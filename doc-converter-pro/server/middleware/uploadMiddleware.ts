import multer from 'multer';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ENV } from '../_core/env';

const UPLOAD_DIR = path.join(os.tmpdir(), 'doc-converter-pro-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 12)}${extension}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const supportedExtensions = ['.pdf', '.doc', '.docx'];
  const supportedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.ms-word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
  ];

  if (supportedExtensions.includes(extension) && supportedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOC, and DOCX files are supported.'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: ENV.conversionMaxFileBytes },
});

export async function cleanupUploadedFile(filePath: string) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn('[upload cleanup] failed:', error);
  }
}

export function getUploadDir() {
  return UPLOAD_DIR;
}
