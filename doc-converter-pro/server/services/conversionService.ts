import { spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { ENV } from '../_core/env';

const unlinkAsync = promisify(fs.unlink);

export const TEMP_DIR = path.join(os.tmpdir(), 'doc-converter-pro');
export const PDF_TO_DOCX_SCRIPT = path.join(process.cwd(), 'scripts', 'pdf_to_docx.py');

export type ProgressEvent = {
  progress: number;
  message: string;
};

export async function ensureTempDir() {
  await fs.promises.mkdir(TEMP_DIR, { recursive: true });
}

export function generateJobPath(jobId: string, extension: string) {
  return path.join(TEMP_DIR, `${jobId}${extension}`);
}

export function isValidFileFormat(filename: string, allowedExtensions: string[]) {
  return allowedExtensions.includes(path.extname(filename).toLowerCase());
}

export async function getFileSize(filePath: string) {
  try {
    return (await fs.promises.stat(filePath)).size;
  } catch {
    return 0;
  }
}

export async function cleanupFile(filePath?: string | null) {
  if (!filePath) return;
  try {
    await unlinkAsync(filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn(`[cleanup] Could not remove ${filePath}:`, error);
    }
  }
}

export async function cleanupDirectory(directoryPath?: string | null) {
  if (!directoryPath) return;
  try {
    await fs.promises.rm(directoryPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[cleanup] Could not remove ${directoryPath}:`, error);
  }
}

function runProcess(
  command: string,
  args: string[],
  onProgress: (event: ProgressEvent) => void,
  parseStdout?: (chunk: string) => void,
  timeoutMs?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      error ? reject(error) : resolve();
    };

    let killTimer: NodeJS.Timeout | null = null;
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (e) {
          // ignore
        }
        finishedByTimeout();
      }, timeoutMs);
    }

    function finishedByTimeout() {
      const err = new Error(`Process timed out after ${timeoutMs} ms`);
      finish(err);
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      parseStdout?.(text);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      const clean = chunk.toString().trim();
      if (clean) onProgress({ progress: 52, message: clean.slice(-180) });
    });

    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

export async function convertPdfToDocx(
  inputPath: string,
  outputPath: string,
  onProgress: (event: ProgressEvent) => void
) {
  await ensureTempDir();
  onProgress({ progress: 10, message: 'Opening the PDF with PyMuPDF…' });

  await runProcess(
    ENV.pythonExecutable,
    [PDF_TO_DOCX_SCRIPT, inputPath, outputPath],
    onProgress,
    (chunk) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as ProgressEvent;
          if (typeof event.progress === 'number' && event.message) onProgress(event);
        } catch {
          // Ignore non-JSON diagnostic output from the Python runtime.
        }
      }
    },
    ENV.conversionProcessTimeoutMs
  );

  if (!(await getFileSize(outputPath))) {
    throw new Error('The PDF conversion completed without producing a Word file.');
  }
  onProgress({ progress: 100, message: 'Word document ready for download.' });
}

export async function convertDocxToPdf(
  inputPath: string,
  outputPath: string,
  onProgress: (event: ProgressEvent) => void
) {
  await ensureTempDir();
  const profilePath = path.join(TEMP_DIR, `lo-profile-${path.basename(outputPath, path.extname(outputPath))}`);
  const generatedPath = path.join(
    TEMP_DIR,
    `${path.basename(inputPath, path.extname(inputPath))}.pdf`
  );

  await fs.promises.mkdir(profilePath, { recursive: true });
  onProgress({ progress: 12, message: 'Starting LibreOffice’s high-fidelity renderer…' });

  try {
    await runProcess(
      ENV.libreOfficeExecutable,
      [
        '--headless',
        '--invisible',
        '--nodefault',
        '--nologo',
        '--nofirststartwizard',
        `-env:UserInstallation=${pathToFileURL(profilePath).toString()}`,
        '--convert-to',
        'pdf:writer_pdf_Export',
        '--outdir',
        TEMP_DIR,
        inputPath,
      ],
      onProgress,
      (chunk) => {
        const text = chunk.trim();
        if (text) onProgress({ progress: 72, message: text.slice(-180) });
      },
      ENV.conversionProcessTimeoutMs
    );

    if (generatedPath !== outputPath) {
      await fs.promises.rename(generatedPath, outputPath);
    }

    if (!(await getFileSize(outputPath))) {
      throw new Error('LibreOffice completed without producing a PDF file.');
    }
    onProgress({ progress: 100, message: 'PDF document ready for download.' });
  } finally {
    await cleanupDirectory(profilePath);
    if (generatedPath !== outputPath) await cleanupFile(generatedPath);
  }
}

export async function convertDocument(
  direction: 'pdf_to_word' | 'word_to_pdf',
  inputPath: string,
  outputPath: string,
  onProgress: (event: ProgressEvent) => void
) {
  if (direction === 'pdf_to_word') {
    return convertPdfToDocx(inputPath, outputPath, onProgress);
  }
  return convertDocxToPdf(inputPath, outputPath, onProgress);
}

export function sanitizeDownloadName(filename: string, extension: string) {
  const base = path.basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'converted-document'}${extension}`;
}

export function createConversionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createDownloadToken() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function getFileExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

export function getMimeType(extension: string) {
  return extension === '.pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

export async function fileExists(filePath: string) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export { fs, path };

export const conversionLimits = {
  maxBytes: ENV.conversionMaxFileBytes,
};

export function describeDirection(direction: 'pdf_to_word' | 'word_to_pdf') {
  return direction === 'pdf_to_word' ? 'PDF to Word' : 'Word to PDF';
}

export function outputExtension(direction: 'pdf_to_word' | 'word_to_pdf') {
  return direction === 'pdf_to_word' ? '.docx' : '.pdf';
}

export function inputExtensions(direction: 'pdf_to_word' | 'word_to_pdf') {
  return direction === 'pdf_to_word' ? ['.pdf'] : ['.doc', '.docx'];
}

export function isConversionDirectionValid(filename: string, direction: 'pdf_to_word' | 'word_to_pdf') {
  return isValidFileFormat(filename, inputExtensions(direction));
}

export function makeJobOutputPath(jobId: string, direction: 'pdf_to_word' | 'word_to_pdf') {
  return generateJobPath(jobId, outputExtension(direction));
}

export function makeJobInputPath(jobId: string, extension: string) {
  return generateJobPath(`${jobId}-source`, extension);
}

export function progressMessage(direction: 'pdf_to_word' | 'word_to_pdf') {
  return direction === 'pdf_to_word'
    ? 'Preserving page layout, figures, tables, and embedded structures…'
    : 'Rendering Word content, diagrams, and formulas with LibreOffice…';
}

export function jobSummary(direction: 'pdf_to_word' | 'word_to_pdf') {
  return direction === 'pdf_to_word'
    ? 'Editable Word document with preserved visual structure'
    : 'High-fidelity PDF rendering from the source Word file';
}

export function getTempDirectory() {
  return TEMP_DIR;
}

export function getPdfToDocxScript() {
  return PDF_TO_DOCX_SCRIPT;
}

export function canConvert(filename: string) {
  const extension = getFileExtension(filename);
  return ['.pdf', '.doc', '.docx'].includes(extension);
}

export function conversionLabel(direction: 'pdf_to_word' | 'word_to_pdf') {
  return direction === 'pdf_to_word' ? 'PDF → Word' : 'Word → PDF';
}

export function sourceLabel(direction: 'pdf_to_word' | 'word_to_pdf') {
  return direction === 'pdf_to_word' ? 'PDF' : 'Word';
}

export function targetLabel(direction: 'pdf_to_word' | 'word_to_pdf') {
  return direction === 'pdf_to_word' ? 'DOCX' : 'PDF';
}

export function conversionStatusLabel(status: 'pending' | 'processing' | 'completed' | 'failed') {
  return status === 'completed' ? 'Ready' : status === 'failed' ? 'Failed' : status === 'processing' ? 'Converting' : 'Queued';
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function formatDuration(milliseconds: number) {
  if (!milliseconds) return '—';
  return milliseconds < 1000 ? `${milliseconds} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}

export function isSupportedMime(mime: string) {
  return ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'].includes(mime);
}

export function buildDownloadName(originalFilename: string, direction: 'pdf_to_word' | 'word_to_pdf') {
  return sanitizeDownloadName(originalFilename, outputExtension(direction));
}

export function isTerminalStatus(status: 'pending' | 'processing' | 'completed' | 'failed') {
  return status === 'completed' || status === 'failed';
}

export function now() {
  return new Date().toISOString();
}

export function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

export function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };
}

export function isPathInside(directory: string, candidate: string) {
  const root = path.resolve(directory) + path.sep;
  return path.resolve(candidate).startsWith(root);
}

export function getDownloadPath(jobId: string, direction: 'pdf_to_word' | 'word_to_pdf') {
  return makeJobOutputPath(jobId, direction);
}

export function getInputPath(jobId: string, extension: string) {
  return makeJobInputPath(jobId, extension);
}

export function cleanupJobFiles(inputPath?: string | null, outputPath?: string | null) {
  return Promise.all([cleanupFile(inputPath), cleanupFile(outputPath)]);
}

export const conversionEngine = {
  convertDocument,
  convertPdfToDocx,
  convertDocxToPdf,
};

export default conversionEngine;
