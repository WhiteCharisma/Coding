# Shared helpers for the deploy/*.sh scripts. Sourced, not executed.
# shellcheck shell=bash

info() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. On Ubuntu: https://docs.docker.com/engine/install/ubuntu/"
  docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is missing (docker compose …)."
  docker info >/dev/null 2>&1 || die "Cannot talk to Docker. Run as root (sudo) or add your user to the docker group."
}

require_env() {
  [ -f .env ] || die ".env not found. Run ./deploy/install.sh first (or copy .env.example to .env)."
}

app_container() { docker compose ps -q app 2>/dev/null; }

app_running() {
  local id
  id="$(app_container)"
  [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Running}}' "$id" 2>/dev/null)" = "true" ]
}

# Waits until the app container's health check passes (default 180 s).
wait_healthy() {
  local timeout="${1:-180}" waited=0 id status
  info "Waiting for the app to become healthy…"
  while [ "$waited" -lt "$timeout" ]; do
    id="$(app_container)"
    if [ -n "$id" ]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      if [ "$status" = "healthy" ]; then
        info "App is healthy."
        return 0
      fi
      if [ "$status" = "exited" ] || [ "$status" = "dead" ]; then break; fi
    fi
    sleep 3
    waited=$((waited + 3))
  done
  warn "The app did not become healthy. Recent logs:"
  docker compose logs --tail 60 app >&2 || true
  return 1
}

# Runs the server CLI inside the running app container, or in a one-off container when stopped.
run_cli() {
  local tty=()
  [ -t 0 ] && [ -t 1 ] || tty=(-T)
  if app_running; then
    docker compose exec "${tty[@]}" app node apps/server/dist/cli.js "$@"
  else
    docker compose run --rm --no-deps "${tty[@]}" app node apps/server/dist/cli.js "$@"
  fi
}
