#!/usr/bin/env bash
# Prints a one-time password reset link for a user (valid 1 hour). Works without email.
#   ./deploy/reset-link.sh <username>
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=deploy/lib.sh
source deploy/lib.sh

require_docker
require_env
[ $# -ge 1 ] || die "Usage: ./deploy/reset-link.sh <username>"
run_cli reset-link "$1"
