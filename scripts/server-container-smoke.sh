#!/usr/bin/env bash

set -Eeuo pipefail

readonly smoke_project_prefix='pixel-forge-container-smoke-'
readonly project_name="${PIXEL_FORGE_SMOKE_PROJECT_NAME:-${smoke_project_prefix}$$}"
readonly image_revision="${PIXEL_FORGE_IMAGE_REVISION:-$(git rev-parse HEAD)}"
readonly image_name="pixel-forge-server:${image_revision}"
readonly shutdown_wait_seconds=20

if [[ "${project_name}" != "${smoke_project_prefix}"* ]]; then
  printf '%s\n' "PIXEL_FORGE_SMOKE_PROJECT_NAME must start with ${smoke_project_prefix}" >&2
  exit 1
fi

export PIXEL_FORGE_IMAGE_REVISION="${image_revision}"

compose() {
  docker compose \
    --project-name "${project_name}" \
    --file compose.yaml \
    --file compose.smoke.yaml \
    "$@"
}

cleanup() {
  local exit_code=$?
  trap - EXIT

  if ((exit_code != 0)); then
    compose logs --no-color || true
  fi

  if ! compose down --volumes --remove-orphans; then
    printf '%s\n' 'Container smoke cleanup failed.' >&2
    if ((exit_code == 0)); then
      exit_code=1
    fi
  fi

  exit "${exit_code}"
}

trap cleanup EXIT

compose up --detach --build --wait --wait-timeout 180 server

compose exec --tty=false server node server/dist/commands/database-migrate.js
compose exec --tty=false server node server/dist/commands/database-readiness.js
compose exec --tty=false server node server/dist/commands/storage-readiness.js

runtime_identity="$(
  compose exec --tty=false server node -e \
    "process.stdout.write(process.platform + ' ' + process.arch + ' uid=' + String(process.getuid?.() ?? -1))"
)"
printf '%s\n' "Runtime identity: ${runtime_identity}"
[[ "${runtime_identity}" =~ ^linux\ x64\ uid=[1-9][0-9]*$ ]]

image_identity="$(docker image inspect "${image_name}" --format '{{.Architecture}} {{.Config.User}}')"
printf '%s\n' "Image identity: ${image_identity}"
[[ "${image_identity}" == "amd64 node" ]]

server_address="$(compose port server 3001)"
liveness="$(curl --fail-with-body --silent "http://${server_address}/api/health")"
printf '%s\n' "Liveness response: ${liveness}"
grep --fixed-strings --quiet "\"revision\":\"${image_revision}\"" <<<"${liveness}"
grep --fixed-strings --quiet '"status":"ok"' <<<"${liveness}"

server_container="$(compose ps --quiet server)"
docker kill --signal SIGTERM "${server_container}" >/dev/null

for ((elapsed_seconds = 0; elapsed_seconds < shutdown_wait_seconds; elapsed_seconds += 1)); do
  [[ "$(docker inspect "${server_container}" --format '{{.State.Running}}')" == "false" ]] && break
  sleep 1
done

container_state="$(
  docker inspect "${server_container}" \
    --format '{{.State.Running}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}'
)"
printf '%s\n' "Stopped container state: ${container_state}"
[[ "${container_state}" == 'false exit=0 oom=false' ]]

server_logs="$(docker logs "${server_container}" 2>&1)"
grep --fixed-strings --quiet '"event":"server.shutdown_started"' <<<"${server_logs}"
grep --fixed-strings --quiet '"event":"server.shutdown_complete"' <<<"${server_logs}"

printf '%s\n' "Container smoke passed: ${image_name} (${runtime_identity})"
