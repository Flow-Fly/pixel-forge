#!/usr/bin/env bash

set -Eeuo pipefail

readonly project_name="${COMPOSE_PROJECT_NAME:-pixel-forge-container-smoke-$$}"
readonly image_revision="${PIXEL_FORGE_IMAGE_REVISION:-$(git rev-parse HEAD)}"
readonly image_name="pixel-forge-server:${image_revision}"

export COMPOSE_PROJECT_NAME="${project_name}"
export PIXEL_FORGE_IMAGE_REVISION="${image_revision}"

compose() {
  docker compose --project-name "${project_name}" "$@"
}

cleanup() {
  local exit_code=$?
  trap - EXIT

  if ((exit_code != 0)); then
    compose logs --no-color || true
  fi

  compose down --volumes --remove-orphans || true
  exit "${exit_code}"
}

trap cleanup EXIT

compose up --detach --build --wait server

compose exec --tty=false server node server/dist/commands/database-migrate.js
compose exec --tty=false server node server/dist/commands/database-readiness.js
compose exec --tty=false server node server/dist/commands/storage-readiness.js

runtime_identity="$(
  compose exec --tty=false server node -e \
    "process.stdout.write(process.platform + ' ' + process.arch + ' uid=' + String(process.getuid?.() ?? -1))"
)"
[[ "${runtime_identity}" == "linux x64 uid="* ]]
[[ "${runtime_identity}" != *"uid=0" ]]

image_identity="$(docker image inspect "${image_name}" --format '{{.Architecture}} {{.Config.User}}')"
[[ "${image_identity}" == "amd64 node" ]]

liveness="$(curl --fail-with-body --silent http://127.0.0.1:3001/api/health)"
grep --fixed-strings --quiet "\"revision\":\"${image_revision}\"" <<<"${liveness}"
grep --fixed-strings --quiet '"status":"ok"' <<<"${liveness}"

server_container="$(compose ps --quiet server)"
docker kill --signal SIGTERM "${server_container}" >/dev/null

exit_code="$(docker wait "${server_container}")"
[[ "${exit_code}" == "0" ]]
[[ "$(docker inspect "${server_container}" --format '{{.State.OOMKilled}}')" == "false" ]]

server_logs="$(docker logs "${server_container}" 2>&1)"
grep --fixed-strings --quiet '"event":"server.shutdown_started"' <<<"${server_logs}"
grep --fixed-strings --quiet '"event":"server.shutdown_complete"' <<<"${server_logs}"

printf '%s\n' "Container smoke passed: ${image_name} (${runtime_identity})"
