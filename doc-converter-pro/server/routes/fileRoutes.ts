import { randomUUID } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/uploadMiddleware';
import {
  buildDownloadName,
  cleanupJobFiles,
  cleanupFile,
  convertDocument,
  createDownloadToken,
  createConversionId,
  describeDirection,
  fileExists,
  getFileExtension,
  getFileSize,
  getInputPath,
  getMimeType,
  getDownloadPath,
  inputExtensions,
  isConversionDirectionValid,
  isPathInside,
  normalizeError,
  noStoreHeaders,
  outputExtension,
  progressMessage,
  TEMP_DIR,
  path,
  fs,
} from '../services/conversionService';

export type Direction = 'pdf_to_word' | 'word_to_pdf';
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type ConversionJob = {
  id: string;
  sessionId: string;
  originalFilename: string;
  direction: Direction;
  status: JobStatus;
  progress: number;
  message: string;
  error?: string;
  inputPath: string;
  outputPath: string;
  outputName: string;
  downloadToken: string;
  fileSize: number;
  duration?: number;
  createdAt: string;
  completedAt?: string;
  subscribers: Set<Response>;
};

const jobs = new Map<string, ConversionJob>();
const sessionJobs = new Map<string, string[]>();

export const fileRouter = Router();

function getSessionId(req: Request) {
  const supplied = String(req.get('x-session-id') || req.body?.sessionId || '').trim();
  return /^[a-zA-Z0-9_-]{8,96}$/.test(supplied) ? supplied : randomUUID();
}

function writeSse(res: Response, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function publicJob(job: ConversionJob) {
  return {
    id: job.id,
    filename: job.originalFilename,
    direction: job.direction,
    directionLabel: describeDirection(job.direction),
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error || null,
    fileSize: job.fileSize,
    duration: job.duration || null,
    createdAt: job.createdAt,
    completedAt: job.completedAt || null,
    downloadUrl: job.status === 'completed'
      ? `/api/conversions/${job.id}/download?token=${encodeURIComponent(job.downloadToken)}`
      : null,
  };
}

function broadcast(job: ConversionJob) {
  const payload = publicJob(job);
  job.subscribers.forEach((subscriber) => {
    if (!subscriber.writableEnded) writeSse(subscriber, payload);
  });
  if (job.status === 'completed' || job.status === 'failed') {
    job.subscribers.forEach((subscriber) => {
      if (!subscriber.writableEnded) subscriber.end();
    });
    job.subscribers.clear();
  }
}

function updateJob(job: ConversionJob, patch: Partial<ConversionJob>) {
  Object.assign(job, patch);
  broadcast(job);
}

async function runConversion(job: ConversionJob) {
  const startedAt = Date.now();
  updateJob(job, {
    status: 'processing',
    progress: 6,
    message: progressMessage(job.direction),
  });

  try {
    await convertDocument(job.direction, job.inputPath, job.outputPath, (event) => {
      updateJob(job, {
        status: 'processing',
        progress: Math.max(6, Math.min(99, event.progress)),
        message: event.message,
      });
    });

    updateJob(job, {
      status: 'completed',
      progress: 100,
      message: 'Conversion complete. Your file is ready to download.',
      duration: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = normalizeError(error).replace(/^Error:\s*/, '').slice(0, 600);
    await cleanupFile(job.outputPath);
    updateJob(job, {
      status: 'failed',
      progress: 0,
      message: 'We could not convert this document.',
      error: message,
      duration: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    });
  }
}

function handleUploadError(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (error: any) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'This file is larger than the 50 MB limit.'
      : error.message || 'The upload could not be processed.';
    return res.status(400).json({ error: message });
  });
}

fileRouter.post('/conversions', handleUploadError, async (req: Request, res: Response) => {
  const file = req.file;
  const direction = String(req.body?.direction || '') as Direction;
  const sessionId = getSessionId(req);

  if (!file) return res.status(400).json({ error: 'Choose a PDF, DOC, or DOCX file to continue.' });
  if (direction !== 'pdf_to_word' && direction !== 'word_to_pdf') {
    await cleanupFile(file.path);
    return res.status(400).json({ error: 'Choose a valid conversion direction.' });
  }
  if (!isConversionDirectionValid(file.originalname, direction)) {
    await cleanupFile(file.path);
    return res.status(400).json({
      error: direction === 'pdf_to_word'
        ? 'PDF to Word accepts PDF files only.'
        : 'Word to PDF accepts DOC and DOCX files only.',
    });
  }

  const id = createConversionId();
  const extension = getFileExtension(file.originalname);
  const inputPath = getInputPath(id, extension);
  const outputPath = getDownloadPath(id, direction);
  const job: ConversionJob = {
    id,
    sessionId,
    originalFilename: file.originalname,
    direction,
    status: 'queued',
    progress: 0,
    message: 'Upload received. Queuing your conversion…',
    inputPath,
    outputPath,
    outputName: buildDownloadName(file.originalname, direction),
    downloadToken: createDownloadToken(),
    fileSize: file.size,
    createdAt: new Date().toISOString(),
    subscribers: new Set(),
  };

  try {
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });
    await fs.promises.rename(file.path, inputPath);
    jobs.set(id, job);
    const history = sessionJobs.get(sessionId) || [];
    sessionJobs.set(sessionId, [id, ...history].slice(0, 30));
    void runConversion(job);
    return res.status(202).set(noStoreHeaders()).json({ sessionId, job: publicJob(job) });
  } catch (error) {
    await cleanupFile(file.path);
    return res.status(500).json({ error: 'The file could not be prepared for conversion.' });
  }
});

fileRouter.get('/conversions/:id', (req: Request, res: Response) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Conversion not found.' });
  const sessionId = String(req.get('x-session-id') || req.query.sessionId || '');
  if (sessionId !== job.sessionId) return res.status(403).json({ error: 'This conversion belongs to another session.' });
  return res.set(noStoreHeaders()).json({ job: publicJob(job) });
});

fileRouter.get('/conversions/:id/events', (req: Request, res: Response) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Conversion not found.' });
  const sessionId = String(req.get('x-session-id') || req.query.sessionId || '');
  if (sessionId !== job.sessionId) return res.status(403).json({ error: 'This conversion belongs to another session.' });

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  writeSse(res, publicJob(job));

  if (job.status === 'completed' || job.status === 'failed') return res.end();

  job.subscribers.add(res);
  req.on('close', () => job.subscribers.delete(res));
});

fileRouter.get('/conversions/:id/download', async (req: Request, res: Response) => {
  const job = jobs.get(req.params.id);
  const token = String(req.query.token || '');
  if (!job || job.status !== 'completed') return res.status(404).json({ error: 'The converted file is not ready.' });
  if (token.length < 20 || token !== job.downloadToken) return res.status(403).json({ error: 'This download link is invalid or expired.' });
  if (!isPathInside(TEMP_DIR, job.outputPath) || !(await fileExists(job.outputPath))) {
    return res.status(404).json({ error: 'The converted file is no longer available.' });
  }

  res.setHeader('Content-Type', getMimeType(outputExtension(job.direction)));
  res.setHeader('Content-Disposition', `attachment; filename="${job.outputName}"`);
  res.setHeader('Content-Length', String(await getFileSize(job.outputPath)));
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(job.outputPath);
  let cleaned = false;
  const cleanupAfterDownload = async () => {
    if (cleaned) return;
    cleaned = true;
    await cleanupJobFiles(job.inputPath, job.outputPath);
    job.downloadToken = '';
    job.message = 'Downloaded and cleaned up.';
  };
  stream.on('error', async () => {
    await cleanupAfterDownload();
    if (!res.headersSent) res.status(500).json({ error: 'The download could not be completed.' });
  });
  res.on('finish', cleanupAfterDownload);
  stream.pipe(res);
});

fileRouter.get('/history', (req: Request, res: Response) => {
  const sessionId = String(req.get('x-session-id') || req.query.sessionId || '');
  const ids = sessionJobs.get(sessionId) || [];
  const history = ids.map((id) => jobs.get(id)).filter(Boolean).map((job) => publicJob(job as ConversionJob));
  return res.set(noStoreHeaders()).json({ history });
});

export function clearAllConversionJobsForTests() {
  jobs.clear();
  sessionJobs.clear();
}

export function getConversionJobForTests(id: string) {
  return jobs.get(id);
}

export function getSupportedExtensions(direction: Direction) {
  return inputExtensions(direction);
}

export function getOutputExtension(direction: Direction) {
  return outputExtension(direction);
}

export function getConversionMime(direction: Direction) {
  return getMimeType(outputExtension(direction));
}

export function getConversionDescription(direction: Direction) {
  return direction === 'pdf_to_word'
    ? 'Rebuilds editable text and layout with pdf2docx and PyMuPDF.'
    : 'Renders the Word source through LibreOffice headless mode.';
}

export function getJobCountForTests() {
  return jobs.size;
}

export function createTestJobId() {
  return randomUUID();
}
