/**
 * HTTP client for the Creator Network API.
 * - Sends the session cookie (same origin) and the CSRF header on every request.
 * - Normalises errors into ApiError { status, code, message, details }.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Called when any request returns 401 (session ended elsewhere). */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

const CSRF = { 'X-Requested-With': 'CreatorNetwork' };

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init: { signal?: AbortSignal; quiet401?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...CSRF,
        ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && !init.quiet401) for (const l of unauthorizedListeners) l();
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, init?: { signal?: AbortSignal; quiet401?: boolean }) =>
    request<T>('GET', path, undefined, init),
  post: <T>(path: string, body: unknown = {}, init?: { signal?: AbortSignal }) => request<T>('POST', path, body, init),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  del: <T = void>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

export interface UploadHandle<T> {
  promise: Promise<T>;
  abort: () => void;
}

/** Multipart upload with progress events (fetch cannot report upload progress). */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): UploadHandle<T> {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', CSRF['X-Requested-With']);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
        const fallback = xhr.status === 413 ? 'That file is too large.' : `Upload failed (${xhr.status})`;
        reject(new ApiError(xhr.status, e?.code ?? 'upload_failed', e?.message ?? fallback));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, 'network', 'The upload was interrupted. Check your connection and retry.'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Upload cancelled.'));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** First field-level validation message for a given field, if any. */
export function fieldError(err: unknown, field: string): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const issues = (err.details as { issues?: { path: string; message: string }[] } | undefined)?.issues;
  return issues?.find((i) => i.path === field)?.message;
}
