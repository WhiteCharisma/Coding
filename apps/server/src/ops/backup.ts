import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import type { AppContext } from '../context';
import { currentMigration } from '../db/client';

const run = promisify(execFile);
const ARCHIVE_RE = /^creator-network-(\d{8}T\d{6}Z)(?:-[a-z]+)?\.tar\.gz$/;

export interface BackupInfo {
  file: string;
  path: string;
  bytes: number;
  createdAt: number;
}

export interface BackupManifest {
  format: 1;
  appVersion: string;
  createdAt: number;
  reason: string;
  migration: { id: number; createdAt: number } | null;
  sqliteVersion: string;
  databaseSha256: string;
  counts: Record<string, number>;
}

function stamp(d = new Date()): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Backup metadata safe to show in the admin UI (no server filesystem paths). */
export function publicBackupInfo(b: BackupInfo): Omit<BackupInfo, 'path'> {
  return { file: b.file, bytes: b.bytes, createdAt: b.createdAt };
}

export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => ARCHIVE_RE.test(f))
    .map((file) => {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      return { file, path: full, bytes: stat.size, createdAt: stat.mtimeMs };
    })
    .sort((a, b) => b.file.localeCompare(a.file));
}

function checkIntegrity(dbFile: string): void {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    const rows = db.pragma('integrity_check') as { integrity_check: string }[];
    if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') {
      throw new Error(`integrity check failed: ${rows.map((r) => r.integrity_check).join('; ')}`);
    }
  } finally {
    db.close();
  }
}

let running: Promise<BackupInfo> | null = null;

/**
 * Creates `creator-network-<UTC time>.tar.gz` containing:
 *   manifest.json   — version, schema migration, row counts, database checksum
 *   database.sqlite — consistent snapshot via the SQLite online backup API
 *   uploads/        — all stored files
 */
export function createBackup(ctx: AppContext, opts: { reason: string }): Promise<BackupInfo> {
  running ??= doBackup(ctx, opts).finally(() => {
    running = null;
  });
  return running;
}

async function doBackup(ctx: AppContext, opts: { reason: string }): Promise<BackupInfo> {
  const dir = ctx.config.backupDir;
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const ts = stamp();
  const staging = path.join(dir, `.staging-${ts}`);
  await fsp.mkdir(staging, { recursive: true, mode: 0o700 });
  const file = `creator-network-${ts}${opts.reason === 'manual' || opts.reason === 'scheduled' ? '' : `-${opts.reason.replace(/[^a-z]/g, '')}`}.tar.gz`;
  const archive = path.join(dir, file);
  try {
    const dbCopy = path.join(staging, 'database.sqlite');
    await ctx.sqlite.backup(dbCopy);
    checkIntegrity(dbCopy);
    const counts: Record<string, number> = {};
    const snapshot = new Database(dbCopy, { readonly: true });
    try {
      for (const table of ['users', 'communities', 'channels', 'messages', 'uploads']) {
        counts[table] = (snapshot.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
      }
    } finally {
      snapshot.close();
    }
    const manifest: BackupManifest = {
      format: 1,
      appVersion: ctx.config.version,
      createdAt: Date.now(),
      reason: opts.reason,
      migration: currentMigration(ctx.sqlite),
      sqliteVersion: (ctx.sqlite.prepare('select sqlite_version() as v').get() as { v: string }).v,
      databaseSha256: await sha256File(dbCopy),
      counts,
    };
    await fsp.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const args = ['-czf', archive, '-C', staging, 'manifest.json', 'database.sqlite'];
    if (fs.existsSync(ctx.config.uploadsDir)) {
      args.push(
        '--exclude=uploads/tmp',
        '-C',
        path.dirname(ctx.config.uploadsDir),
        path.basename(ctx.config.uploadsDir),
      );
    }
    await run('tar', args);
    await fsp.chmod(archive, 0o600);
    pruneBackups(dir, ctx.config.backupRetention);
    const stat = await fsp.stat(archive);
    ctx.log.info({ file, bytes: stat.size, reason: opts.reason }, 'backup created');
    return { file, path: archive, bytes: stat.size, createdAt: stat.mtimeMs };
  } catch (err) {
    await fsp.rm(archive, { force: true });
    throw err;
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

export function pruneBackups(dir: string, keep: number): string[] {
  const removed: string[] = [];
  for (const b of listBackups(dir).slice(keep)) {
    fs.rmSync(b.path, { force: true });
    removed.push(b.file);
  }
  return removed;
}

export interface RestoreResult {
  manifest: BackupManifest;
  previousDataMovedTo: string | null;
}

/**
 * Restores a backup archive into `dataDir`. MUST run while the server is stopped.
 * Existing data is never deleted: it is moved to `dataDir/pre-restore-<time>/`.
 */
export async function restoreBackup(
  archivePath: string,
  dataDir: string,
  dbFileName = 'creator-network.sqlite',
): Promise<RestoreResult> {
  const archive = path.resolve(archivePath);
  if (!fs.existsSync(archive)) throw new Error(`Backup not found: ${archive}`);
  const ts = stamp();
  const staging = path.join(dataDir, `.restore-${ts}`);
  await fsp.mkdir(staging, { recursive: true });
  try {
    await run('tar', ['-xzf', archive, '-C', staging, '--no-same-owner']);
    const manifestPath = path.join(staging, 'manifest.json');
    const dbPath = path.join(staging, 'database.sqlite');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(dbPath))
      throw new Error('Archive is missing manifest.json or database.sqlite');
    const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8')) as BackupManifest;
    if (manifest.format !== 1) throw new Error(`Unsupported backup format ${String(manifest.format)}`);
    const sum = await sha256File(dbPath);
    if (sum !== manifest.databaseSha256)
      throw new Error('Database checksum does not match the manifest (corrupted archive?)');
    checkIntegrity(dbPath);

    const current = path.join(dataDir, dbFileName);
    const currentUploads = path.join(dataDir, 'uploads');
    let movedTo: string | null = null;
    const existing = [current, `${current}-wal`, `${current}-shm`, currentUploads].filter((p) => fs.existsSync(p));
    if (existing.length) {
      movedTo = path.join(dataDir, `pre-restore-${ts}`);
      await fsp.mkdir(movedTo, { recursive: true });
      for (const p of existing) await fsp.rename(p, path.join(movedTo, path.basename(p)));
    }
    await fsp.rename(dbPath, current);
    const restoredUploads = path.join(staging, 'uploads');
    if (fs.existsSync(restoredUploads)) await fsp.rename(restoredUploads, currentUploads);
    else await fsp.mkdir(currentUploads, { recursive: true });
    return { manifest, previousDataMovedTo: movedTo };
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}
