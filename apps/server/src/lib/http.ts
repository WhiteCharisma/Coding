import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError, tooMany } from './errors';

/** Per-route rate-limit config: `{ config: rateLimit(10, '1 minute') }`. */
export function rateLimit(max: number, timeWindow: string) {
  return { rateLimit: { max, timeWindow } };
}

export function rateLimitErrorBuilder(_req: unknown, context: { after: string }): AppError {
  return tooMany(`Too many requests. Try again in ${context.after}.`);
}

/**
 * Converts every error into `{ error: { code, message, details? } }`.
 * Internal errors are logged with the request id and returned as a generic message.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      if (error.status >= 500) request.log.error({ err: error }, error.message);
      void reply.status(error.status).send({
        error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) },
      });
      return;
    }
    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status < 500) {
      const code =
        status === 413 ? 'payload_too_large' : status === 415 ? 'unsupported_media_type' : status === 429 ? 'rate_limited' : 'bad_request';
      const message =
        status === 413
          ? 'That request is too large.'
          : status === 415
            ? 'Unsupported content type.'
            : status === 429
              ? 'Too many requests. Please slow down.'
              : 'The request could not be processed.';
      void reply.status(status).send({ error: { code, message } });
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    void reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' } });
  });

}

/**
 * 404 handler. When the built web app is served, browser navigations to unknown
 * non-API paths get index.html so client-side routes work on reload.
 */
export function registerNotFoundHandler(app: FastifyInstance, opts: { spaFallback: boolean }): void {
  app.setNotFoundHandler((request, reply) => {
    const accept = String(request.headers.accept ?? '');
    if (opts.spaFallback && request.method === 'GET' && !request.url.startsWith('/api/') && accept.includes('text/html')) {
      void reply.header('Cache-Control', 'no-cache').type('text/html').sendFile('index.html');
      return;
    }
    void reply.status(404).send({ error: { code: 'not_found', message: `No route for ${request.method} ${request.url.split('?')[0]}` } });
  });
}
