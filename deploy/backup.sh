#!/usr/bin/env bash
# Creates a consistent backup archive (database snapshot + uploads + manifest) in ./backups.
# Safe while the app is running. Copy the archives to another machine regularly, e.g.:
#   rsync -a backups/ you@backup-host:creator-network-backups/
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=deploy/lib.sh
source deploy/lib.sh

require_docker
require_env
mkdir -p backups
run_cli backup
