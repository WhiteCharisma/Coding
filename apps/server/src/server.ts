import { buildApp } from './app';
import type { AppConfig } from './config';
import type { AppContext } from './context';
import { startJobs } from './ops/jobs';
import { SocketGateway } from './realtime/gateway';

export interface RunningServer {
  ctx: AppContext;
  gateway: SocketGateway;
  url: string;
  close: () => Promise<void>;
}

/** Builds the HTTP app, attaches the Socket.IO gateway and starts listening. */
export async function startServer(config: AppConfig, opts: { jobs?: boolean } = {}): Promise<RunningServer> {
  const { app, ctx } = await buildApp(config);
  const gateway = new SocketGateway(ctx, app.server);
  ctx.realtime = gateway;
  const address = await app.listen({ host: config.host, port: config.port });
  const stopJobs = opts.jobs === false ? () => {} : startJobs(ctx);
  let closed = false;
  return {
    ctx,
    gateway,
    url: address,
    async close() {
      if (closed) return;
      closed = true;
      stopJobs();
      await gateway.close();
      // Node closes only the keep-alive connections that are idle when close() is
      // called. Requests still finishing (e.g. a file stream reaching EOF) would
      // otherwise keep their connection open until the 72 s keep-alive timeout.
      const sweep = setInterval(() => app.server.closeIdleConnections(), 100);
      const hardStop = setTimeout(() => app.server.closeAllConnections(), 8000);
      try {
        await app.close();
      } finally {
        clearInterval(sweep);
        clearTimeout(hardStop);
      }
    },
  };
}
