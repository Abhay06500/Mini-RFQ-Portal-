import { ApiError } from '../api/client';

/** All messages from a failed request. Validation and publish-readiness errors list several problems. */
export function errorMessages(error: unknown): string[] {
  if (error instanceof ApiError) {
    if (Array.isArray(error.details) && error.details.length > 0) {
      return error.details.map((d) => (d as { message?: string }).message ?? error.message);
    }
    return [error.message];
  }
  return ['Something went wrong. Please try again.'];
}
