#!/usr/bin/env bash
# Restores a backup archive. The current data is NOT deleted: it is moved to
# data/pre-restore-<time>/ first, so a restore can itself be undone.
#
#   ./deploy/restore.sh backups/creator-network-20250101T030000Z.tar.gz [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=deploy/lib.sh
source deploy/lib.sh

require_docker
require_env
archive="${1:-}"
[ -n "$archive" ] || die "Usage: ./deploy/restore.sh <archive.tar.gz> [--yes]"
[ -f "$archive" ] || die "No such file: $archive"

# The container only sees ./backups; copy archives from elsewhere into it.
name="$(basename "$archive")"
if [ "$(cd "$(dirname "$archive")" && pwd)" != "$(pwd)/backups" ]; then
  cp "$archive" "backups/$name"
  if [ "$(id -u)" = "0" ]; then chown 1000:1000 "backups/$name"; fi
fi

if [ "${2:-}" != "--yes" ]; then
  echo "This stops the app and replaces the database and uploads with the contents of:"
  echo "  backups/$name"
  read -rp "Type RESTORE to continue: " answer
  [ "$answer" = "RESTORE" ] || die "Cancelled."
fi

info "Stopping the app…"
docker compose stop app
info "Restoring…"
docker compose run --rm --no-deps -T app node apps/server/dist/cli.js restore "/app/backups/$name" --yes
info "Starting the app…"
docker compose up -d
wait_healthy || die "The app did not start after the restore. The previous data is in data/pre-restore-*/."
info "Restore complete."
