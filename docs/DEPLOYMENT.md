# Deployment (Hostinger VPS or any Linux server with Docker)

This guide takes a fresh VPS to a running HTTPS instance. Day-to-day tasks (updates, backups,
restores, logs, troubleshooting) are in [OPERATIONS.md](OPERATIONS.md).

> **Status (be precise about what has been verified):** the Docker image, the Compose stack,
> the install/update/backup/restore/create-admin scripts, persistence across container
> re-creation, and backup → restore were all **tested in a local Docker environment**
> (Docker 29.8, Compose v5.6), with Caddy serving plain HTTP on a local port. Automatic
> Let's Encrypt certificate issuance **could not be tested** there (no public DNS), and the
> stack has **not yet been deployed to a real Hostinger VPS**. Treat the first deployment as
> a deployment candidate: follow the checklist at the end before inviting real users.

## 1. Which Hostinger product works?

| Hostinger product                                                                    | Works?                  | Why                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VPS (KVM) with Ubuntu 22.04/24.04** — e.g. the "Ubuntu 24.04 with Docker" template | ✅ **Supported target** | Root access, Docker + Compose, persistent volumes, ports 80/443, long-running processes and WebSockets                                                                                                                      |
| Shared / Premium / Business web hosting                                              | ❌ Not supported        | No Docker, no root, no persistent Node.js process, WebSockets and long-lived connections are not available; processes are killed                                                                                            |
| Cloud hosting (managed)                                                              | ❌ Not supported        | Same restrictions as shared hosting (managed LiteSpeed/PHP stack)                                                                                                                                                           |
| Hostinger "Node.js" web app hosting (managed)                                        | ⚠️ Not supported as-is  | Provider-managed runtime; no Docker, no guaranteed persistent disk for SQLite/uploads, no control over the reverse proxy or long-lived WebSockets. Would need a different architecture (external database + object storage) |

**Size:** minimum 1 vCPU / 2 GB RAM / 20 GB disk (KVM 1). Recommended for a few hundred active
users: 2 vCPU / 4–8 GB RAM (KVM 2). Measured idle footprint of the production container:
≈130 MB RSS for the app plus ≈10 MB for Caddy; the app container is capped at 1 GB
(`APP_MEMORY_LIMIT`). Uploaded files are what grows the disk. Load measurements:
[PERFORMANCE.md](PERFORMANCE.md).

## 2. What you need

- A Hostinger VPS with the **"Ubuntu 24.04 with Docker"** template (or plain Ubuntu 22.04/24.04 —
  then install Docker Engine + the Compose plugin from https://docs.docker.com/engine/install/ubuntu/).
- A domain or subdomain, e.g. `community.example.com`.
- SSH access to the VPS (hPanel → VPS → Overview shows the IP address and root login).
- Optional: SMTP credentials for email (verification and password-recovery mail). Without SMTP
  the platform works; admins hand out one-time reset links instead.

## 3. DNS

In the DNS settings of your domain (Hostinger: hPanel → Domains → _your domain_ → DNS / Nameservers)
create an **A record** for the name you want (`@` for the bare domain, or e.g. `community`)
pointing to the VPS **IPv4 address**. Only add an **AAAA** record if your VPS has a working IPv6
address — a wrong AAAA record makes certificate issuance fail.

Wait until `dig +short community.example.com` (or https://dnschecker.org) shows the VPS IP.

## 4. Firewall

Ports **80** and **443** (TCP, plus 443/UDP for HTTP/3) must be reachable; SSH (22) must stay open.

- If you use the hPanel VPS firewall, add rules allowing TCP 22, 80, 443 and UDP 443.
- On the server with ufw:
  ```bash
  ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable
  ```
  Note: Docker publishes ports through its own iptables rules, which bypass ufw. The stack
  only publishes 80 and 443; the application port (3000) is never published.

## 5. Install

```bash
ssh root@YOUR_VPS_IP
apt-get update && apt-get install -y git            # git is usually already installed
git clone https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git /opt/creator-network
cd /opt/creator-network
./deploy/install.sh
```

For a private repository, use a read-only deploy key (GitHub → repository → Settings → Deploy keys)
and clone with the SSH URL.

`install.sh` asks for the domain and an email address for Let's Encrypt, writes `.env`
(mode 600) from `.env.example`, creates `data/` and `backups/` (owned by uid 1000, the
container user), builds the image (a few minutes the first time) and starts the stack. It
finishes when the app's health check passes. Caddy then obtains the HTTPS certificate on the
first request — open `https://community.example.com`; the first load can take a few seconds.

Then create the first administrator (there are **no default credentials**):

```bash
./deploy/create-admin.sh
```

It prompts for username, email, display name and password (input hidden). Sign in, finish the
short onboarding, and open **Administration** to review the instance settings (registration
mode, upload limit, who may create communities, appeal contact).

### Email (optional)

Edit `.env`, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and
`MAIL_FROM`, then `docker compose up -d`. Example for a mailbox hosted at Hostinger
(confirm the values in hPanel → Emails → _your mailbox_ → Configuration):

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@example.com
SMTP_PASSWORD=…the mailbox password…
MAIL_FROM="Creator Network <no-reply@example.com>"
```

Admin → Overview → "Email delivery" shows whether SMTP is configured. Any SMTP provider works;
no paid API is required.

## 6. Where your data lives

| Path (in `/opt/creator-network`)       | Contents                                                                | Back up?                     |
| -------------------------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| `data/creator-network.sqlite` (+ -wal) | The database: accounts, communities, messages, settings, audit log      | **Yes** (via backup archive) |
| `data/uploads/`                        | Uploaded files (random names, served only after an authorization check) | **Yes** (via backup archive) |
| `data/pre-restore-*/`                  | Previous data kept by a restore (delete when you no longer need it)     | Optional                     |
| `backups/*.tar.gz`                     | Backup archives (database snapshot + uploads + manifest), mode 600      | **Copy off the server**      |
| `.env`                                 | Configuration incl. SMTP password (mode 600, never committed)           | Keep a private copy          |
| Docker volumes `caddy_data/config`     | TLS certificates and Caddy state (re-issued automatically if lost)      | No                           |

Nothing under `data/` or `backups/` is ever served by the web server; files are only
reachable through `/api/files/:id` after permission checks.

## 7. Backups

- Automatic: every `BACKUP_INTERVAL_HOURS` (default 24 h) the app writes an archive to
  `backups/` and keeps the newest `BACKUP_RETENTION` (default 14).
- Manual: `./deploy/backup.sh` (safe while running — uses SQLite's online backup API and
  verifies the copy with an integrity check).
- **Off-server copies are your responsibility** — a backup on the same disk does not protect
  against losing the VPS. For example, from your own computer:
  ```bash
  rsync -av root@YOUR_VPS_IP:/opt/creator-network/backups/ ./creator-network-backups/
  ```
  Hostinger's VPS snapshots/backups are a useful extra layer but not a replacement.
- Restore: `./deploy/restore.sh backups/<archive>.tar.gz` — see [OPERATIONS.md](OPERATIONS.md#restore).

## 8. Updating

```bash
cd /opt/creator-network && ./deploy/update.sh          # or: ./deploy/update.sh v0.2.0
```

Takes a backup, pulls the new code (fast-forward only), rebuilds, restarts and waits for the
health check. Expect a few seconds of downtime while the container restarts; open browsers
reconnect automatically and queued messages are sent when the connection returns. If the new
version is unhealthy, the script prints the exact rollback commands.

## 9. Pre-launch checklist (before inviting real users)

- [ ] HTTPS works (`https://…` shows a valid certificate) and `http://` redirects to HTTPS.
- [ ] `APP_ORIGIN` in `.env` is exactly `https://<your domain>`; the app logs no
      "APP_ORIGIN is not https://" warning (`docker compose logs app`).
- [ ] Administrator created; registration mode chosen (open / invite-only / closed).
- [ ] Email configured, or a documented process for issuing reset links.
- [ ] A backup was created **and restored on a test machine** at least once.
- [ ] Off-server backup copy scheduled (cron/rsync from another machine).
- [ ] Demo data not loaded (or removed with `docker compose exec app node apps/server/dist/cli.js purge-demo`).
- [ ] Appeal contact and community guidelines published (Admin → Instance settings).
- [ ] The items in [SECURITY.md](SECURITY.md#before-production) and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) reviewed.

## Building behind a TLS-intercepting proxy (rare)

If your build machine sits behind a proxy that re-signs HTTPS, pass its CA certificate as a
BuildKit secret; it is only mounted during `npm ci` and never stored in an image layer:

```bash
docker build --secret id=build_ca,src=/path/to/proxy-ca.crt -t creator-network:latest .
docker compose up -d --no-build
```
