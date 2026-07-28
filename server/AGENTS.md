# Server guidance

This file applies to the Node 22 and Hono backend under `server/`. Inherit the
workflow and cross-cutting review rules from the repository root. Treat
`specs/adr/0001-backend-walking-skeleton.md` as the active architecture
boundary until a later accepted decision replaces it.

## Working agreements

- The server may depend on `@pixel-forge/shared`; it must not import browser
  stores or UI code.
- Validate configuration and untrusted input at their boundaries.
- Keep production resources, credentials, DNS, migrations, and spending behind
  explicit owner approval.
- Keep commands non-interactive, repeatable, and safe to run against an
  explicitly selected environment.

## Code Review Rules

### Metadata and project bytes

- Flag project payload bytes stored in PostgreSQL or exposed through a public
  bucket. PostgreSQL stores metadata; exact project bytes use the server-owned
  private object-storage boundary.
- Flag multi-resource writes that assume PostgreSQL and object storage are one
  atomic transaction. Define ordering, idempotency, retry behavior, and orphan
  recovery before accepting the write path.

### Runtime and migration safety

- Flag production migrations performed during application startup. Use
  committed, explicit deployment steps and preserve compatibility with older
  installed clients during rollout.
- Flag in-process timers used for durable reconciliation, cleanup, email,
  billing, or retention work. Scale-to-zero instances require an external
  durable trigger or job boundary.

### Security and privacy

- Flag wildcard production CORS, public dependency diagnostics, secrets or
  tokens in logs, project contents in ordinary logs, and configuration that
  silently falls back to unsafe production defaults.
- Keep runtime storage credentials server-side and separate from deployment
  credentials. Limit them to the required bucket actions and prefixes.

## Verification

Run the relevant focused test plus:

```sh
npm run server:check
git diff --check
```
