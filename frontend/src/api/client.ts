/** Thin fetch wrapper. Cookies are sent automatically (same origin). Errors are normalized to ApiError. */

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export interface ApiErrorDetail {
  field?: string;
  message?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetail[] | Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: ApiError['details']) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form; // the browser sets the multipart boundary itself
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = data?.error as { code?: string; message?: string; details?: ApiError['details'] } | undefined;
    throw new ApiError(
      response.status,
      err?.code ?? 'ERROR',
      err?.message ?? 'Something went wrong. Please try again.',
      err?.details,
    );
  }
  return data as T;
}

/** URL the browser opens to download a file the user is allowed to see. */
export const fileDownloadUrl = (fileId: string) => `${BASE_URL}/files/${fileId}`;

/** Readable message for a failed request, preferring the first per-field message when present. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (Array.isArray(error.details) && error.details.length > 0) {
      const first = error.details[0] as ApiErrorDetail;
      if (first.message) return first.message;
    }
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
