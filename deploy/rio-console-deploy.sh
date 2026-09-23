#!/usr/bin/env bash
# Install this on CT 102 as the ExecStart target for rio-console-deploy.service.
# It is intentionally not run by the Console container or by CI.
set -Eeuo pipefail

APP_DIR=${RIO_CONSOLE_APP_DIR:-/opt/services/apps/rio-console}
STATUS_FILE=${RIO_CONSOLE_DEPLOY_STATUS_FILE:-$APP_DIR/data/deploy-status.json}
WRITER=${RIO_CONSOLE_STATUS_WRITER:-$APP_DIR/scripts/write_deploy_status.py}
COMPOSE_FILE=${RIO_CONSOLE_COMPOSE_FILE:-$APP_DIR/compose.yml}
CONTAINER=${RIO_CONSOLE_CONTAINER:-rio-console}
DEPLOYMENT_ID=${INVOCATION_ID:-dep_$(date -u +%Y%m%dT%H%M%SZ)_console}
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TARGET_REVISION=""
PREVIOUS_REVISION=""
PHASE=prepare

write_status() {
  local status=$1
  shift
  local args=(
    --file "$STATUS_FILE"
    --deployment-id "$DEPLOYMENT_ID"
    --status "$status"
    --phase "$PHASE"
    --started-at "$STARTED_AT"
  )
  if [[ -n "$TARGET_REVISION" ]]; then
    args+=(--target-revision "$TARGET_REVISION")
  fi
  if [[ -n "$PREVIOUS_REVISION" ]]; then
    args+=(--previous-revision "$PREVIOUS_REVISION")
  fi
  python3 "$WRITER" "${args[@]}" "$@"
}

fail() {
  local exit_code=$?
  local message="deploy failed during $PHASE"
  write_status failed --finished-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --error "$message" || true
  exit "$exit_code"
}
trap fail ERR

abort() {
  write_status failed --finished-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --error "$1"
  trap - ERR
  exit 1
}

wait_for_readiness() {
  local check_name=$1
  shift
  local attempt
  local max_attempts=${RIO_CONSOLE_READINESS_ATTEMPTS:-30}

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if "$@"; then
      return 0
    fi
    sleep 1
  done

  echo "$check_name did not become ready after ${max_attempts}s" >&2
  return 1
}

cd "$APP_DIR"
PREVIOUS_REVISION=$(git rev-parse HEAD)
PHASE=fetch
write_status running
git fetch origin main
if [[ -n $(git status --porcelain) ]]; then
  echo "refusing deployment: working tree has local changes" >&2
  abort "deployment refused: working tree has local changes"
fi
git merge-base --is-ancestor HEAD origin/main
git merge --ff-only origin/main
TARGET_REVISION=$(git rev-parse HEAD)

PHASE=build
write_status running
RIO_CONSOLE_GIT_REVISION="$TARGET_REVISION" docker compose -f "$COMPOSE_FILE" build --pull rio-console

PHASE=recreate
write_status running
RIO_CONSOLE_GIT_REVISION="$TARGET_REVISION" docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate rio-console

PHASE=revision-attestation
write_status running
RUNNING_REVISION=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$CONTAINER")
if [[ "$RUNNING_REVISION" != "$TARGET_REVISION" ]]; then
  echo "running image revision does not match target revision" >&2
  abort "deployment revision attestation failed"
fi

PHASE=readiness
write_status running --running-revision "$RUNNING_REVISION"
wait_for_readiness "console health check" docker exec "$CONTAINER" python -c 'import httpx; assert httpx.get("http://127.0.0.1:8000/healthz", timeout=10).status_code == 200'
wait_for_readiness "agent connectivity check" docker exec "$CONTAINER" python -c 'import httpx, os; assert httpx.get(os.environ["RIO_AGENT_URL"] + "/health", headers={"Authorization": "Bearer " + os.environ["RIO_AGENT_TOKEN"]}, timeout=10).status_code == 200'

write_status succeeded \
  --running-revision "$RUNNING_REVISION" \
  --finished-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --verified-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --check container-http=passed \
  --check agent-connectivity=passed
