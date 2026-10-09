import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * All runtime configuration comes from environment variables (see .env.example).
 * Secrets are never hard-coded and never sent to the browser.
 */

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['true', '1', 'yes'].includes(v)));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_NAME: z.string().min(1).max(40).default('Creator Network'),
  /** Public URL users open in their browser, e.g. https://community.example.com */
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  /** Extra allowed browser origins (comma separated), e.g. the server port during development. */
  ADDITIONAL_ORIGINS: csv,
  DATA_DIR: z.string().default('./data'),
  BACKUP_DIR: z.string().default('./backups'),
  BACKUP_INTERVAL_HOURS: z.coerce.number().min(0).max(24 * 30).default(24),
  BACKUP_RETENTION: z.coerce.number().int().min(1).max(365).default(14),
  /** "false", "true", or a comma separated list of trusted proxy IPs/CIDRs. */
  TRUST_PROXY: z.string().default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SECURE_COOKIES: z.enum(['auto', 'true', 'false']).default('auto'),
  MAIL_TRANSPORT: z.enum(['smtp', 'outbox', 'disabled', 'auto']).default('auto'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  /** Hard upper bound for uploads; the admin setting can only go lower. */
  MAX_UPLOAD_MB_HARD_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
  /** "strict" in production. "relaxed" multiplies limits for automated tests (ignored in production). */
  RATE_LIMIT_MODE: z.enum(['strict', 'relaxed']).default('strict'),
  WEB_DIST_DIR: z.string().optional(),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).max(262144).default(19456),
  ARGON2_ITERATIONS: z.coerce.number().int().min(1).max(10).default(2),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  isTest: boolean;
  host: string;
  port: number;
  appName: string;
  appOrigin: string;
  allowedOrigins: string[];
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  outboxDir: string;
  backupDir: string;
  backupIntervalHours: number;
  backupRetention: number;
  trustProxy: boolean | string[];
  logLevel: Env['LOG_LEVEL'];
  sessionTtlMs: number;
  secureCookies: boolean;
  sessionCookieName: string;
  mail:
    | { transport: 'smtp'; host: string; port: number; secure: boolean; user?: string; password?: string; from: string }
    | { transport: 'outbox'; from: string }
    | { transport: 'disabled' };
  maxUploadMbHardLimit: number;
  rateLimitMultiplier: number;
  webDistDir: string;
  argon2: { memoryCost: number; timeCost: number };
  version: string;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env, overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const appOrigin = new URL(env.APP_ORIGIN).origin;
  const secureCookies =
    env.SECURE_COOKIES === 'auto' ? appOrigin.startsWith('https://') : env.SECURE_COOKIES === 'true';

  const dataDir = path.resolve(env.DATA_DIR);

  let mail: AppConfig['mail'];
  const transport = env.MAIL_TRANSPORT === 'auto' ? (env.SMTP_HOST ? 'smtp' : isProduction ? 'disabled' : 'outbox') : env.MAIL_TRANSPORT;
  const from = env.MAIL_FROM ?? `${env.APP_NAME} <no-reply@${new URL(appOrigin).hostname}>`;
  if (transport === 'smtp') {
    if (!env.SMTP_HOST) throw new Error('MAIL_TRANSPORT=smtp requires SMTP_HOST');
    mail = {
      transport: 'smtp',
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? (env.SMTP_SECURE ? 465 : 587),
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from,
    };
  } else if (transport === 'outbox') {
    mail = { transport: 'outbox', from };
  } else {
    mail = { transport: 'disabled' };
  }

  let trustProxy: boolean | string[] = false;
  if (env.TRUST_PROXY === 'true') trustProxy = true;
  else if (env.TRUST_PROXY !== 'false' && env.TRUST_PROXY.trim() !== '')
    trustProxy = env.TRUST_PROXY.split(',').map((s) => s.trim());

  const here = path.dirname(fileURLToPath(import.meta.url));
  // In the bundled build this file lives in apps/server/dist; in dev in apps/server/src.
  const webDistDir = path.resolve(env.WEB_DIST_DIR ?? path.join(here, '..', '..', 'web', 'dist'));

  const config: AppConfig = {
    env: env.NODE_ENV,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    host: env.HOST,
    port: env.PORT,
    appName: env.APP_NAME,
    appOrigin,
    allowedOrigins: [...new Set([appOrigin, ...env.ADDITIONAL_ORIGINS.map((o) => new URL(o).origin)])],
    dataDir,
    dbPath: path.join(dataDir, 'creator-network.sqlite'),
    uploadsDir: path.join(dataDir, 'uploads'),
    outboxDir: path.join(dataDir, 'mail-outbox'),
    backupDir: path.resolve(env.BACKUP_DIR),
    backupIntervalHours: env.BACKUP_INTERVAL_HOURS,
    backupRetention: env.BACKUP_RETENTION,
    trustProxy,
    logLevel: env.LOG_LEVEL,
    sessionTtlMs: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    secureCookies,
    // The __Host- prefix forces Secure, Path=/ and no Domain attribute in browsers.
    sessionCookieName: secureCookies ? '__Host-cn_session' : 'cn_session',
    mail,
    maxUploadMbHardLimit: env.MAX_UPLOAD_MB_HARD_LIMIT,
    rateLimitMultiplier: !isProduction && env.RATE_LIMIT_MODE === 'relaxed' ? 100 : 1,
    webDistDir,
    argon2: { memoryCost: env.ARGON2_MEMORY_KIB, timeCost: env.ARGON2_ITERATIONS },
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0-dev',
    ...overrides,
  };
  return config;
}
