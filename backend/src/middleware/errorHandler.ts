import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { toValidationError } from '../validation/parse.js';

/** Maps every failure to { error: { code, message, details? } }. Stack traces never reach the client. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    const mapped = toValidationError(err);
    res.status(422).json({ error: { code: mapped.code, message: mapped.message, details: mapped.details } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(422).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_INVALID',
        message: tooLarge ? 'File exceeds the maximum allowed size' : 'Upload rejected',
      },
    });
    return;
  }
  const maybe = err as { type?: string; code?: string };
  if (maybe?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  if (maybe?.code === 'P2002') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'A conflicting record already exists' } });
    return;
  }
  // Unknown error: log server-side with request context, return a generic message.
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}
