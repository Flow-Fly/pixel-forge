# Pixel Forge server

This workspace contains the local Node 22 and Hono walking skeleton. It is
deliberately stateless: the public health route proves only that the process and
build are alive. Database, object-storage, authentication, and sync readiness
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
```

`server:test` builds the workspace, exercises the Hono app, starts a real HTTP
process, requests its health route, and verifies clean `SIGTERM` shutdown.
`server:start` runs an existing build; run `server:build` first.

Normal `SIGINT` and `SIGTERM` shutdown waits for the Node HTTP server to close.
Startup and shutdown write small structured JSON events without echoing the
environment.
