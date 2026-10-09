/**
 * Errors thrown by services. The HTTP layer converts them to
 * `{ error: { code, message, details? } }` responses; unknown errors become a
 * generic 500 without leaking internals.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown, code = 'bad_request') =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'You need to sign in to do that.', code = 'unauthorized') =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have permission to do that.', code = 'forbidden') =>
  new AppError(403, code, message);
/** Used for resources the user may not know exist — never distinguishes "hidden" from "missing". */
export const notFound = (message = 'Not found.', code = 'not_found') => new AppError(404, code, message);
export const conflict = (message: string, code = 'conflict') => new AppError(409, code, message);
export const tooLarge = (message: string) => new AppError(413, 'payload_too_large', message);
export const unsupported = (message: string) => new AppError(415, 'unsupported_media_type', message);
export const tooMany = (message = 'Too many requests. Please slow down.', code = 'rate_limited') =>
  new AppError(429, code, message);
export const unavailable = (message: string, code = 'unavailable') => new AppError(503, code, message);
