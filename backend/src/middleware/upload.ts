import multer from 'multer';
import { config } from '../config.js';

/**
 * Files are held in memory only long enough to validate them, then written to UPLOAD_DIR
 * under a generated name. Nothing is written to a publicly served directory.
 */
export const MAX_UPLOAD_BYTES = Math.floor(config.MAX_UPLOAD_MB * 1024 * 1024);

export const uploadSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4, parts: 6 },
}).single('file');
