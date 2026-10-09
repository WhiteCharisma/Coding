import { loadConfig } from './config';
import { startServer } from './server';

async function main(): Promise<void> {
  const config = loadConfig();
  const server = await startServer(config);
  const { ctx } = server;
  ctx.log.info(
    {
      url: server.url,
      origin: config.appOrigin,
      dataDir: config.dataDir,
      mail: ctx.mailer.transport,
      version: config.version,
    },
    `${config.appName} is running`,
  );
  if (config.isProduction && !config.secureCookies) {
    ctx.log.warn('APP_ORIGIN is not https:// — session cookies are not marked Secure. Use HTTPS in production.');
  }
  if (!ctx.mailer.enabled) {
    ctx.log.warn('Email delivery is not configured: email verification and password recovery emails are unavailable.');
  }

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    ctx.log.info({ signal }, 'shutting down');
    const force = setTimeout(() => {
      ctx.log.error('graceful shutdown timed out, exiting');
      process.exit(1);
    }, 10_000);
    force.unref();
    server
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        ctx.log.error({ err }, 'error during shutdown');
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
