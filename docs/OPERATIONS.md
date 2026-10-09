# Operations

Everyday tasks for a running instance. All commands run in the installation directory
(e.g. `/opt/creator-network`). Installation itself: [DEPLOYMENT.md](DEPLOYMENT.md).

| Task                            | Command                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Status of the containers        | `docker compose ps`                                                                    |
| Application logs (follow)       | `docker compose logs -f app`                                                           |
| Proxy / certificate logs        | `docker compose logs -f caddy`                                                         |
| Restart                         | `docker compose restart app`                                                           |
| Stop / start everything         | `docker compose down` / `docker compose up -d`                                         |
| Update to the latest version    | `./deploy/update.sh`                                                                   |
| Backup now                      | `./deploy/backup.sh`                                                                   |
| List backups                    | `ls -lh backups/`                                                                      |
| Restore a backup                | `./deploy/restore.sh backups/<archive>.tar.gz`                                         |
| Create an administrator         | `./deploy/create-admin.sh`                                                             |
| Make an existing user admin/mod | `docker compose exec app node apps/server/dist/cli.js promote <username> --role admin` |
| One-time password reset link    | `./deploy/reset-link.sh <username>` (also in Admin → Users)                            |
| Run the cleanup job now         | `docker compose exec app node apps/server/dist/cli.js cleanup`                         |
| Remove demo content             | `docker compose exec app node apps/server/dist/cli.js purge-demo`                      |
| Resource usage                  | `docker stats --no-stream` · Admin → Overview                                          |

`docker compose down` keeps all data: `data/`, `backups/` and the Caddy certificate volumes
are never removed by it. **Never** run `docker compose down -v` unless you intend to delete the
certificate volumes, and never delete `data/` without a verified backup.

## Health

- `GET /api/health` → `{"status":"ok"}` while the process serves requests (liveness).
- `GET /api/health/ready` → 200 `{"status":"ok"}` when the database, the uploads directory and
  free disk space (> 200 MB) are fine, otherwise 503 `{"status":"degraded"}`. Docker uses it as
  the container health check (every 30 s); `docker compose ps` shows `healthy`.
- Details (which check failed, free disk, uptime, memory, live connections, last backup, email
  status) are visible to staff in **Admin → Overview**.

## Logs

The app writes JSON lines to stdout (rotated by Docker: 5 × 10 MB). Each request is logged with
method, path and status. Cookies, authorization headers, passwords and `token` query parameters
are redacted; message contents are never logged and the app does not log email addresses
(an SMTP error returned by your mail provider may quote a recipient address). Caddy writes no access log
(its URLs could contain one-time tokens). Adjust verbosity with `LOG_LEVEL` in `.env`
(`info` by default; `warn` for quieter logs, `debug` for troubleshooting).

## Backups

Each archive `backups/creator-network-<UTC time>.tar.gz` contains:

- `database.sqlite` — a consistent snapshot taken with SQLite's online backup API, verified with
  `PRAGMA integrity_check` before the archive is written;
- `uploads/` — all stored files;
- `manifest.json` — app version, time, row counts, file count.

Automatic backups run every `BACKUP_INTERVAL_HOURS` (default 24) and the newest
`BACKUP_RETENTION` (default 14) archives are kept. Archives are written with mode 600.

**Copy archives off the server.** Example cron entry on another machine (daily, 04:30):

```cron
30 4 * * * rsync -a --delete-after root@YOUR_VPS_IP:/opt/creator-network/backups/ /srv/backups/creator-network/
```

Test a restore regularly (for example on a spare VM or your laptop with Docker) — a backup you
have never restored is not yet a backup.

## Restore

```bash
./deploy/restore.sh backups/creator-network-20250101T030000Z.tar.gz
```

1. Asks for confirmation (type `RESTORE`; `--yes` skips it in scripts).
2. Stops the app, unpacks the archive, verifies the database, then **moves** the current
   database and uploads to `data/pre-restore-<time>/` (nothing is deleted).
3. Starts the app; newer database migrations, if any, are applied automatically.
4. Waits for the health check.

To undo a restore, stop the app and move the files from `data/pre-restore-<time>/` back.
Sessions that existed at backup time are valid again after a restore; sessions created later
are gone (those users simply sign in again).

Restoring onto a **new server**: install as in DEPLOYMENT.md, copy the archive into `backups/`,
then run `./deploy/restore.sh`.

## Updates and rollback

`./deploy/update.sh` (or `./deploy/update.sh <tag>`):

1. refuses to run if tracked files were edited on the server;
2. creates a backup;
3. `git pull --ff-only` (or checks out the given tag);
4. rebuilds the image and restarts the app (a few seconds of downtime; clients reconnect);
5. waits for the health check and prints rollback commands if it fails:
   `git checkout <previous> && docker compose build app && docker compose up -d`, plus
   `./deploy/restore.sh <backup>` if the new version already migrated the database.

Database migrations only move forward. Read the release notes before updating across several
versions.

## Moderation and accounts

- **Reports** arrive in Admin → Reports. Resolving can delete the message, warn the user
  (they get a notification with your note) or suspend them. Every action is in the audit log.
- **Suspensions**: Admin → Users → ⋯ → Suspend (reason shown to the user, optional duration).
  Suspended users are signed out everywhere and see the reason and the appeal contact when they
  try to sign in. Restore from the same menu.
- **Lost passwords without email**: Admin → Users → ⋯ → "Create password reset link", or
  `./deploy/reset-link.sh <username>`; send the link to the person over a channel you trust.
- **Account deletion** (by the user in Settings → Account, or by an admin) anonymises the
  profile ("Deleted user"), signs them out and optionally deletes their messages. Owners must
  transfer or delete their communities first.
- **Registration**: Admin → Instance settings → open / invite-only / closed. Invite-only accepts
  registration codes (Admin → Registration invites) and community invite links.

## Troubleshooting

| Symptom                                                | Check                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser shows a certificate error                      | `docker compose logs caddy` — DNS must point to this server, ports 80/443 open, no wrong AAAA record. Caddy retries automatically.                                              |
| "Cross-origin request rejected" / socket won't connect | `APP_ORIGIN` must exactly match the address in the browser (scheme + host, no trailing slash). Restart after editing `.env`: `docker compose up -d`.                            |
| App container restarting / unhealthy                   | `docker compose logs --tail 100 app`. Common causes: invalid `.env` value (the log names it), `data/` not writable by uid 1000 (`chown -R 1000:1000 data backups`), disk full.  |
| Everyone appears to have the same IP / rate limits hit | The app trusts `X-Forwarded-For` only from the Caddy network (`TRUST_PROXY` in docker-compose.yml). Don't publish port 3000 or put another proxy in front without adjusting it. |
| Disk filling up                                        | `du -sh data/uploads backups`; lower `BACKUP_RETENTION`, move old archives off the server, lower the upload limit in Admin → Instance settings.                                 |
| Emails not arriving                                    | Admin → Overview → Email delivery; `docker compose logs app                                                                                                                     | grep -i mail`; check SMTP host/port/secure and that the provider allows the `MAIL_FROM` address. |
