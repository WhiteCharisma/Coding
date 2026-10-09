#!/usr/bin/env bash
# Updates to the latest code on the current branch (or to a given tag/commit):
#
#   ./deploy/update.sh            # git pull --ff-only, rebuild, restart
#   ./deploy/update.sh v0.2.0     # check out a specific tag or commit
#
# A backup is taken first. If the new version does not become healthy, the script prints
# the exact commands to roll back.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=deploy/lib.sh
source deploy/lib.sh

require_docker
require_env
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "Tracked files have local changes; commit or stash them first."

before="$(git rev-parse --short HEAD)"
info "Current version: ${before}. Taking a safety backup first…"
./deploy/backup.sh

info "Fetching updates…"
git fetch --tags --quiet
if [ $# -ge 1 ]; then
  git checkout --quiet "$1"
else
  git pull --ff-only --quiet
fi
after="$(git rev-parse --short HEAD)"
if [ "$before" = "$after" ]; then
  info "Already up to date (${after}). Rebuilding anyway to pick up base image fixes."
fi

docker compose build app
docker compose up -d
if ! wait_healthy; then
  latest="$(ls -1t backups/*.tar.gz 2>/dev/null | head -n1 || true)"
  cat >&2 <<MSG

The new version (${after}) is not healthy. To roll back:
  git checkout ${before} && docker compose build app && docker compose up -d
If the database was already migrated by the new version, also restore the backup taken above:
  ./deploy/restore.sh ${latest:-backups/<archive>.tar.gz}
MSG
  exit 1
fi
docker image prune -f >/dev/null || true
info "Updated ${before} → ${after}."
