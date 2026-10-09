import fs from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { registerAuthHooks } from './auth/plugin';
import { registerAuthRoutes } from './auth/routes';
import type { AppConfig } from './config';
import type { AppContext } from './context';
import { createContext } from './create-context';
import { rateLimitErrorBuilder, registerErrorHandler } from './lib/http';
import { registerHealthRoutes } from './ops/health';
import { registerUserRoutes } from './users/routes';
import { registerCommunityRoutes } from './communities/routes';
import { registerMessageRoutes } from './messages/routes';
import { registerDmRoutes } from './dms/routes';
import { registerNotificationRoutes } from './notifications/routes';
import { registerUploadRoutes } from './uploads/routes';
import { registerSearchRoutes } from './search/routes';
import { registerReportRoutes } from './reports/routes';
import { registerAdminRoutes } from './admin/routes';

const SENSITIVE_QUERY = /([?&](?:token|code)=)[^&]*/gi;

function loggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  return {
    level: config.logLevel,
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password', '*.token'],
      censor: '[redacted]',
    },
    serializers: {
      req(req: { method: string; url: string; id: string; ip?: string }) {
        // Reset/verification links carry tokens in the query string: never log them.
        return { id: req.id, method: req.method, url: req.url.replace(SENSITIVE_QUERY, '$1[redacted]') };
      },
    },
  };
}

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
}

export async function buildApp(config: AppConfig): Promise<BuiltApp> {
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
    requestIdHeader: false,
    genReqId: (() => {
      let n = 0;
      return () => `r${(++n).toString(36)}`;
    })(),
  });

  const { ctx, close } = createContext(config, app.log);
  app.addHook('onClose', async () => close());

  await app.register(fastifyCookie);

  const wsOrigins = config.allowedOrigins.map((o) => o.replace(/^http/, 'ws'));
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", ...wsOrigins],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(config.secureCookies ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'same-origin' },
    strictTransportSecurity: config.secureCookies ? { maxAge: 15552000, includeSubDomains: false } : false,
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });

  registerAuthHooks(app, ctx);

  await app.register(fastifyRateLimit, {
    global: true,
    max: 600 * config.rateLimitMultiplier,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (request) => request.auth?.user.id ?? request.ip,
    errorResponseBuilder: rateLimitErrorBuilder,
  });

  registerErrorHandler(app);

  registerHealthRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerUserRoutes(app, ctx);
  registerCommunityRoutes(app, ctx);
  registerMessageRoutes(app, ctx);
  registerDmRoutes(app, ctx);
  registerNotificationRoutes(app, ctx);
  await registerUploadRoutes(app, ctx);
  registerSearchRoutes(app, ctx);
  registerReportRoutes(app, ctx);
  registerAdminRoutes(app, ctx);

  // Serve the built single-page app (production). In development Vite serves it.
  const indexHtml = path.join(config.webDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: '/',
      wildcard: false,
      index: false,
      setHeaders(reply, filePath) {
        // Hashed build assets never change; everything else must be revalidated.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          void reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          void reply.header('Cache-Control', 'no-cache');
        }
      },
    });
    app.setNotFoundHandler((request, reply) => {
      const accept = String(request.headers.accept ?? '');
      if (request.method === 'GET' && !request.url.startsWith('/api/') && accept.includes('text/html')) {
        void reply.header('Cache-Control', 'no-cache').type('text/html').sendFile('index.html');
        return;
      }
      void reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
    });
  }

  return { app, ctx };
}
