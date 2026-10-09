/**
 * Server-side command line tools.
 *
 *   node dist/cli.js <command> [options]        (production / Docker)
 *   npm run cli -- <command> [options]          (development)
 *
 * Commands
 *   create-admin [--username u] [--email e] [--display-name n]
 *                                      Create an administrator (prompts for missing values).
 *   promote <username> [--role admin|moderator|member]
 *   reset-link <username>              Print a one-time password reset link (works without email).
 *   migrate                            Apply pending database migrations.
 *   backup                             Create a backup archive now.
 *   list-backups
 *   restore <archive.tar.gz> --yes     Restore a backup. THE SERVER MUST BE STOPPED.
 *   seed-demo [--member <username>]    Load the demo communities (clearly marked as demo data),
 *                                      optionally adding an existing user to all of them.
 *   purge-demo                         Remove all demo users and communities.
 *   cleanup                            Run the periodic cleanup job once.
 */
import readline from 'node:readline';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import {
  emailSchema,
  passwordSchema,
  usernameSchema,
  displayNameSchema,
  RESERVED_USERNAMES,
} from '@creator-network/shared';
import { audit } from './audit';
import { createPasswordResetLink } from './auth/service';
import { loadConfig } from './config';
import { createContext } from './create-context';
import { currentMigration } from './db/client';
import { newId } from './db/ids';
import { users } from './db/schema';
import { hashPassword, isCommonPassword } from './lib/password';
import { createBackup, listBackups, restoreBackup } from './ops/backup';
import { runCleanup } from './ops/jobs';
import { purgeDemoData, seedDemoData } from './seed/demo';

function parseArgs(argv: string[]): { command: string; positional: string[]; flags: Record<string, string | true> } {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

// Piped (non-TTY) input must be read through ONE line reader: a readline interface per
// question would buffer and drop the remaining lines when it is closed.
let pipedInput: { rl: readline.Interface; lines: AsyncIterator<string> } | null = null;

async function readPipedLine(): Promise<string> {
  if (!pipedInput) {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    pipedInput = { rl, lines: rl[Symbol.asyncIterator]() };
  }
  const next = await pipedInput.lines.next();
  if (next.done) throw new Error('Input ended before all answers were given.');
  return next.value;
}

function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    return readPipedLine().then((line) => {
      process.stdout.write('\n');
      return line.trim();
    });
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

/** Reads a line without echoing it (falls back to a plain line read when stdin is not a TTY). */
function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    process.stdout.write(question);
    // Do not trim: leading/trailing spaces are part of a password.
    return readPipedLine().then((line) => {
      process.stdout.write('\n');
      return line;
    });
  }
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          done();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          done();
          reject(new Error('Cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function valueOrPrompt<T>(
  flag: string | true | undefined,
  question: string,
  parse: (v: string) => T,
): Promise<T> {
  let raw = typeof flag === 'string' ? flag : '';
  for (;;) {
    if (!raw) raw = await ask(question);
    try {
      return parse(raw);
    } catch (err) {
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      raw = '';
    }
  }
}

function zodParse<T>(schema: { parse: (v: unknown) => T }) {
  return (v: string): T => {
    try {
      return schema.parse(v);
    } catch (err) {
      const issues = (err as { issues?: { message: string }[] }).issues;
      throw new Error(issues?.[0]?.message ?? 'Invalid value', { cause: err });
    }
  };
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help') {
    console.log(
      `Usage: cli <create-admin|promote|reset-link|migrate|backup|list-backups|restore|seed-demo|purge-demo|cleanup>`,
    );
    return;
  }
  const config = loadConfig();
  if (command === 'restore') {
    const archive = positional[0];
    if (!archive) throw new Error('Usage: restore <archive.tar.gz> --yes');
    if (flags.yes !== true) {
      throw new Error(
        'Restoring replaces the current database and uploads (they are moved to data/pre-restore-<time>/). Stop the server first, then re-run with --yes.',
      );
    }
    const result = await restoreBackup(archive, config.dataDir);
    console.log(
      `Restored backup from ${new Date(result.manifest.createdAt).toISOString()} (app ${result.manifest.appVersion}).`,
    );
    console.log(`Rows: ${JSON.stringify(result.manifest.counts)}`);
    if (result.previousDataMovedTo) console.log(`Previous data was moved to: ${result.previousDataMovedTo}`);
    console.log('Start the server again; any newer migrations will be applied automatically.');
    return;
  }

  const log = pino({ level: 'warn' });
  const { ctx, close } = createContext(config, log);
  try {
    switch (command) {
      case 'migrate': {
        const m = currentMigration(ctx.sqlite);
        console.log(
          `Database is up to date (latest migration created at ${m ? new Date(m.createdAt).toISOString() : 'n/a'}).`,
        );
        break;
      }
      case 'create-admin': {
        console.log('Create an administrator account.\n');
        const username = await valueOrPrompt(flags.username, 'Username: ', (v) => {
          const u = zodParse(usernameSchema)(v);
          if (RESERVED_USERNAMES.has(u)) throw new Error('That username is reserved.');
          if (ctx.db.select({ id: users.id }).from(users).where(eq(users.username, u)).get()) {
            throw new Error(`"${u}" already exists. Use: promote ${u} --role admin`);
          }
          return u;
        });
        const email = await valueOrPrompt(flags.email, 'Email: ', (v) => {
          const e = zodParse(emailSchema)(v);
          if (ctx.db.select({ id: users.id }).from(users).where(eq(users.email, e)).get())
            throw new Error('That email is already in use.');
          return e;
        });
        const displayName = await valueOrPrompt(flags['display-name'], 'Display name: ', zodParse(displayNameSchema));
        let password = '';
        for (;;) {
          password = await askHidden('Password (min 10 characters): ');
          try {
            zodParse(passwordSchema)(password);
            if (isCommonPassword(password) || password.toLowerCase().includes(username))
              throw new Error('Choose a less predictable password.');
          } catch (err) {
            console.error(`  ${err instanceof Error ? err.message : String(err)}`);
            continue;
          }
          const confirm = await askHidden('Repeat password: ');
          if (confirm === password) break;
          console.error('  Passwords do not match.');
        }
        const now = Date.now();
        const id = newId(now);
        ctx.db
          .insert(users)
          .values({
            id,
            username,
            email,
            emailVerifiedAt: now,
            passwordHash: await hashPassword(password),
            displayName,
            platformRole: 'admin',
            onboardingCompletedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        audit(ctx.db, {
          scope: 'platform',
          actorId: null,
          action: 'user.admin_created_by_cli',
          targetType: 'user',
          targetId: id,
          targetLabel: username,
        });
        console.log(`\nAdministrator "${username}" created. Sign in at ${config.appOrigin}/login`);
        break;
      }
      case 'promote': {
        const username = positional[0];
        if (!username) throw new Error('Usage: promote <username> [--role admin|moderator|member]');
        const role = typeof flags.role === 'string' ? flags.role : 'admin';
        if (!['admin', 'moderator', 'member'].includes(role))
          throw new Error('Role must be admin, moderator or member.');
        const user = ctx.db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
        if (!user || user.status === 'deleted') throw new Error(`No user named "${username}".`);
        ctx.db
          .update(users)
          .set({ platformRole: role as 'admin' | 'moderator' | 'member', updatedAt: Date.now() })
          .where(eq(users.id, user.id))
          .run();
        audit(ctx.db, {
          scope: 'platform',
          actorId: null,
          action: 'user.platform_role_changed_by_cli',
          targetType: 'user',
          targetId: user.id,
          targetLabel: user.username,
          metadata: { to: role },
        });
        console.log(`${user.username} is now ${role}.`);
        break;
      }
      case 'reset-link': {
        const username = positional[0];
        if (!username) throw new Error('Usage: reset-link <username>');
        const user = ctx.db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
        if (!user || user.status === 'deleted') throw new Error(`No user named "${username}".`);
        const link = createPasswordResetLink(ctx, user.id);
        audit(ctx.db, {
          scope: 'platform',
          actorId: null,
          action: 'user.reset_link_created_by_cli',
          targetType: 'user',
          targetId: user.id,
          targetLabel: user.username,
        });
        console.log(`One-time reset link for ${user.username} (valid for 1 hour):\n${link}`);
        break;
      }
      case 'backup': {
        const b = await createBackup(ctx, { reason: 'manual' });
        console.log(`Backup written: ${b.path} (${(b.bytes / 1024 / 1024).toFixed(2)} MB)`);
        break;
      }
      case 'list-backups': {
        const list = listBackups(config.backupDir);
        if (list.length === 0) console.log('No backups yet.');
        for (const b of list)
          console.log(`${b.file}\t${(b.bytes / 1024 / 1024).toFixed(2)} MB\t${new Date(b.createdAt).toISOString()}`);
        break;
      }
      case 'seed-demo': {
        const summary = await seedDemoData(ctx, {
          member: typeof flags.member === 'string' ? flags.member : undefined,
        });
        console.log(summary);
        break;
      }
      case 'purge-demo': {
        const summary = await purgeDemoData(ctx);
        console.log(summary);
        break;
      }
      case 'cleanup': {
        console.log(await runCleanup(ctx));
        break;
      }
      default:
        throw new Error(`Unknown command "${command}". Run with --help.`);
    }
  } finally {
    pipedInput?.rl.close();
    close();
  }
}

main().catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
