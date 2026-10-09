#!/usr/bin/env bash
# Creates an administrator account (prompts for username, email, display name and password).
# There are no default credentials: run this once after installing.
#   ./deploy/create-admin.sh [--username name] [--email you@example.com] [--display-name "Your Name"]
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=deploy/lib.sh
source deploy/lib.sh

require_docker
require_env
run_cli create-admin "$@"
