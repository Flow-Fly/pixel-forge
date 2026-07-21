# Pixel Forge server

This workspace contains the local Node 22 and Hono walking skeleton. The public
health route proves only that the process and build are alive. PostgreSQL
readiness, migrations, and compatibility checks are explicit commands; they do
not run during normal server startup. Object-storage, authentication, and sync
belong to later delivery slices.

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
CORS_ALLOWED_ORIGINS=http://localhost:5173 \
BUILD_REVISION=local-test \
npm run server:dev
```

`CORS_ALLOWED_ORIGINS` accepts a comma-separated list of exact HTTP or HTTPS
origins. Wildcards, paths, query strings, and empty entries are rejected.

## Run PostgreSQL locally

The root `compose.yaml` defines one local-development PostgreSQL service with
disposable credentials. It binds only to the loopback interface.

```sh
docker compose up -d --wait postgres
```

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

The command is safe to re-run. It writes only the
`database_compatibility:last_checked` metadata key. Failures return a non-zero
exit code and emit a structured stage without printing the connection URL or a
raw driver error.

Run the real database integration test while the local service is healthy:

```sh
npm run server:db:test
```

The integration command uses the same `DATABASE_SAFETY_CONFIRM=non-production`
interlock and administrative-database refusal as migration commands.

The test generates unique metadata keys and removes those exact keys before
closing its database connections. The compatibility subprocess updates the
same durable `database_compatibility:last_checked` key as the documented
command. The test does not truncate a table or create, drop, or reset a
database.

## Stop or reset local PostgreSQL

Stop the service while preserving its local volume:

```sh
docker compose down
```

If the disposable local data is no longer useful, remove only this Compose
project's containers and named volumes:

```sh
docker compose down --volumes
```

The second command permanently deletes the local development database. Never
use it as a production recovery procedure. Production migrations and recovery
remain explicit owner-gated operations outside this repository slice.

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
Those diagnostics will be separate, operator-gated endpoints after the
corresponding adapters exist.

## Commands

Run these commands from the repository root:

```sh
npm run server:typecheck
npm run server:lint
npm run server:test
npm run server:build
npm run server:start
npm run server:db:generate
npm run server:db:migrate
npm run server:db:ready
npm run server:db:compat
npm run server:db:test
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
