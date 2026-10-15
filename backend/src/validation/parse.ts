import type { ZodError, ZodTypeAny, z } from 'zod';
import { AppError } from '../errors.js';

/** Converts a ZodError into a 422 AppError without exposing internal schema details. */
export function toValidationError(error: ZodError): AppError {
  const details = error.issues.map((i) => ({
    field: i.path.join('.') || '(root)',
    message: i.message,
  }));
  return new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', details);
}

/** Parses untrusted input with a schema. Throws a 422 AppError on failure. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) throw toValidationError(result.error);
  return result.data;
}
