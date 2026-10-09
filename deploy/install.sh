#!/usr/bin/env bash
# First installation on a Linux VPS with Docker (e.g. Hostinger VPS "Ubuntu 24.04 with Docker").
#
#   git clone <repository> /opt/creator-network && cd /opt/creator-network
#   sudo ./deploy/install.sh
#
# Non-interactive: DOMAIN=chat.example.com ACME_EMAIL=you@example.com sudo -E ./deploy/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=deploy/lib.sh
source deploy/lib.sh

require_docker

if [ -f .env ]; then
  info ".env already exists — keeping it."
else
  domain="${DOMAIN:-}"
  email="${ACME_EMAIL:-}"
  if [ -z "$domain" ]; then read -rp "Domain for the community (e.g. community.example.com): " domain; fi
  if [ -z "$email" ]; then read -rp "Email for Let's Encrypt certificate notices: " email; fi
  [[ "$domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "\"$domain\" does not look like a domain name."
  [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "\"$email\" does not look like an email address."
  umask 077
  sed -e "s|^DOMAIN=.*|DOMAIN=${domain}|" \
    -e "s|^APP_ORIGIN=.*|APP_ORIGIN=https://${domain}|" \
    -e "s|^ACME_EMAIL=.*|ACME_EMAIL=${email}|" \
    -e "s|^MAIL_FROM=.*|MAIL_FROM=\"Creator Network <no-reply@${domain}>\"|" \
    .env.example >.env
  chmod 600 .env
  info "Created .env (mode 600). Edit it later to add SMTP settings for email."
fi

# Persistent data lives next to docker-compose.yml. The container runs as uid 1000.
mkdir -p data backups
if [ "$(id -u)" = "0" ]; then
  chown 1000:1000 data backups
else
  if [ ! -w data ] || [ ! -w backups ]; then warn "data/ and backups/ must be writable by uid 1000 (run with sudo)."; fi
fi
chmod 750 data backups

domain_now="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
info "Make sure the DNS A/AAAA record of ${domain_now} points to this server and ports 80/443 are open."

info "Building the application image (first build takes a few minutes)…"
docker compose build
info "Starting the stack…"
docker compose up -d
wait_healthy || die "Installation did not finish. Fix the problem above, then run: docker compose up -d"

cat <<MSG

Creator Network is running. Next steps:
  1. Create the first administrator:   ./deploy/create-admin.sh
  2. Open https://${domain_now} and sign in.
  3. Check backups:                    ./deploy/backup.sh  (archives in ./backups — copy them off the server)
See docs/DEPLOYMENT.md for updates, restores and troubleshooting.
MSG
