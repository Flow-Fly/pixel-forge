# Pixel Forge server

This workspace contains the local Node 22 and Hono walking skeleton. The public
health route proves only that the process and build are alive. PostgreSQL
and object-storage readiness and compatibility checks are explicit commands;
they do not run during normal server startup. Authentication and sync belong
to later delivery slices.

## Run locally

Install all workspaces from the repository root:

```sh
npm ci
```

Start the browser client and server in separate terminals:

```sh
npm run dev
npm run server:dev
```

The defaults serve the API on `http://127.0.0.1:3001` and allow browser
requests from `http://localhost:5173`.

`PORT=0` asks Node to choose an available ephemeral port for automated smoke
tests; the `server.started` event reports the port that was actually bound.

The server does not load `.env` files implicitly. Set process values in your
shell when you need to override the safe local defaults:

```sh
PORT=3100 \
HOST=127.0.0.1 \
CORS_ALLOWED_ORIGINS=http://localhost:5173 \
BUILD_REVISION=local-test \
npm run server:dev
```

`CORS_ALLOWED_ORIGINS` accepts a comma-separated list of exact HTTP or HTTPS
origins. Wildcards, paths, query strings, and empty entries are rejected.

## Run PostgreSQL and MinIO locally

The root `compose.yaml` defines local-development PostgreSQL and MinIO services
with disposable credentials. Their database, object API, and MinIO console
ports bind only to the loopback interface. The one-shot `minio-bootstrap`
service creates only the local `pixel-forge-dev` bucket after MinIO is healthy.

```sh
docker compose up -d --wait postgres minio
docker compose run --rm --no-deps minio-bootstrap
```

`docker compose ps` should report both long-running services as healthy and
`minio-bootstrap` as successfully exited. PostgreSQL remains available at
`127.0.0.1:5432`, MinIO's S3-compatible endpoint at `127.0.0.1:9000`, and its
local console at `127.0.0.1:9001`.

Database commands require an explicit URL. Commands that apply committed
migrations also require the exact non-production confirmation. Neither value
is loaded implicitly from a `.env` file.

```sh
export DATABASE_URL=postgresql://pixel_forge:pixel_forge_local@127.0.0.1:5432/pixel_forge_dev
export DATABASE_SAFETY_CONFIRM=non-production

npm run server:db:migrate
npm run server:db:ready
```

`DATABASE_SAFETY_CONFIRM` is an interlock, not automatic production detection.
Migration and compatibility commands also refuse the built-in `postgres`,
`template0`, and `template1` databases. They never create or drop a database.

The committed migration creates only `app_meta`, a small key/value table for
application-level metadata. Project bytes, users, sessions, entitlements,
billing, and sync data are not part of this slice.

## Run the compatibility check

The same bounded command is intended for the separately approved #264 database
spike. It applies committed migrations, runs a readiness query, and performs a
short metadata transaction against the explicitly supplied non-production
database.

```sh
npm run server:db:compat
```

The command is safe to re-run. Its transaction uses one uniquely named probe
record and deletes that record before committing. Failures return a non-zero
exit code and emit a structured stage without printing the connection URL or a
raw driver error.

Run the real database integration test while the local service is healthy:

```sh
npm run server:db:test
```

The integration command uses the same `DATABASE_SAFETY_CONFIRM=non-production`
interlock and administrative-database refusal as migration commands.

The test generates unique metadata keys and removes those exact keys before
closing its database connections. The compatibility subprocess also deletes
its uniquely named probe inside the checked transaction. The test does not
truncate a table or create, drop, or reset a database.

## Verify local object storage

Storage commands require explicit S3-compatible settings. MinIO uses path-style
requests locally. The normal server process does not read or require these
values.

```sh
export STORAGE_ENDPOINT=http://127.0.0.1:9000
export STORAGE_REGION=us-east-1
export STORAGE_BUCKET=pixel-forge-dev
export STORAGE_ACCESS_KEY_ID=pixel_forge
export STORAGE_SECRET_ACCESS_KEY=pixel_forge_local_secret
export STORAGE_FORCE_PATH_STYLE=true

npm run server:storage:ready
```

Plain HTTP storage endpoints are accepted without an extra flag only on the
loopback interface. The Compose server uses the isolated service name
`minio`, so it supplies the exact
`STORAGE_INSECURE_HTTP_CONFIRM=local-container-network` interlock. Do not use
that interlock to connect to remote object storage; remote endpoints must use
HTTPS.

Readiness performs only a bucket-level availability check. It emits a small
`storage.ready` or `storage.not_ready` event without logging the endpoint,
bucket, credentials, or raw SDK error.

Mutation and integration commands additionally require the exact local safety
confirmation and refuse non-loopback endpoints:

```sh
export STORAGE_SAFETY_CONFIRM=local-non-production

npm run server:storage:compat
npm run server:storage:test
```

The compatibility command writes arbitrary bytes to one uniquely named key,
reads and compares those bytes, deletes that exact key, and verifies that it is
missing. The integration suite uses another unique per-run prefix. Cleanup
deletes only the exact keys created by that run: neither path lists objects,
deletes a broad prefix, removes a bucket, or provisions storage.

## Build and smoke the server container

The server image always builds from the repository root because npm's lockfile
and workspace declarations live there. The multi-stage `Dockerfile.server`
builds the shared and server workspaces, then copies only production packages,
compiled server files, and committed migrations into the runtime stage. Its
Node 22 patch image is pinned by digest.

Use the full source commit as the image identity:

```sh
export PIXEL_FORGE_IMAGE_REVISION="$(git rev-parse HEAD)"
docker compose build server
```

This creates `pixel-forge-server:<commit-sha>`. Do not publish or deploy a
`latest` tag. CI follows the same convention with `github.sha` and never logs
in to a registry or pushes the image.

The container runs as the unprivileged `node` user, listens on runtime `PORT`,
and sets `HOST=0.0.0.0` so Docker can route traffic to it. Direct local Node
execution keeps the safer `127.0.0.1` default. The Compose service also drops
Linux capabilities, enables `no-new-privileges`, and mounts its root filesystem
read-only. It has no application volume or scheduled process.

Run the complete disposable smoke from the repository root:

```sh
npm run server:container:smoke
```

The command creates a uniquely named Compose project, builds the
`linux/amd64` image, waits for PostgreSQL and MinIO, bootstraps only the local
development bucket, applies committed migrations, runs both dependency
readiness commands, requests `/api/health`, verifies the non-root Linux
identity, sends `SIGTERM`, and requires the structured shutdown-complete event.
Its exit trap removes only that smoke project's containers and volumes.

The public `/api/health` route remains process liveness only. Database and
storage readiness stay separate commands; container startup never hides a
dependency probe inside the public route.

Docker Desktop could not start on the owner's workstation while this slice was
developed. GitHub Actions' Linux Docker engine is therefore the canonical
image-build and runtime-smoke evidence. The local command is documented and is
the path to re-run after Docker Desktop is repaired; this slice does not repair
the workstation installation.

## Stop or reset local services

Stop the service while preserving its local volume:

```sh
docker compose down
```

If the disposable local database and object data are no longer useful, remove
only this Compose project's containers and named volumes:

```sh
docker compose down --volumes
```

The second command permanently deletes this Compose project's local PostgreSQL
and MinIO data. It is the only documented broad cleanup and is a manual local
reset, not part of an integration test. Never use it as a production recovery
procedure. Production storage, migrations, and recovery remain explicit
owner-gated operations outside this repository slice.

## Verify health

```sh
curl --fail-with-body http://127.0.0.1:3001/api/health
```

The response is deterministic apart from the configured build revision:

```json
{
  "revision": "development",
  "service": "pixel-forge-api",
  "status": "ok",
  "version": "0.1.0"
}
```

This public route never probes or describes database or storage dependencies.
Those checks remain separate, operator-run commands.

## Commands

Run these commands from the repository root:

```sh
npm run server:typecheck
npm run server:lint
npm run server:test
npm run server:build
npm run server:check
npm run server:container:build
npm run server:container:smoke
npm run server:start
npm run server:db:generate
npm run server:db:migrate
npm run server:db:ready
npm run server:db:compat
npm run server:db:test
npm run server:storage:ready
npm run server:storage:compat
npm run server:storage:test
npm run shared:check
```

`server:test` builds the workspace, exercises the Hono app, starts a real HTTP
process, requests its health route, and verifies clean `SIGTERM` shutdown.
`server:start` runs an existing build; run `server:build` first.

`server:db:generate` creates a new forward migration from the Drizzle schema;
review and commit the generated SQL and metadata. Use committed migrations for
shared environments. Do not use schema push commands as a migration shortcut.

Normal `SIGINT` and `SIGTERM` shutdown waits for the Node HTTP server to close.
Startup and shutdown write small structured JSON events without echoing the
environment.
