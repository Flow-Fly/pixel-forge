# ADR 0001: Backend walking-skeleton boundaries

- Status: Accepted
- Date: 2026-07-11
- Decider: Repository owner
- Related issues: #132, #133, #264–#270

## Context

Pixel Forge is a local-first PWA. The browser client works offline, stores projects in IndexedDB, and already exposes a `ProjectRepository` boundary intended for a later remote implementation.

The first backend slice is a walking skeleton, not the accounts or sync feature itself. It must prove that shared project validation, a server process, metadata storage, blob storage, container packaging, and deployment can fit together without weakening the existing offline application.

The current frontend deployment is independent of the future backend: GitHub Actions builds the static app and publishes it to the `pixel-forge.app` Scaleway Object Storage bucket. That working boundary should remain intact.

## Decision drivers

- Preserve the local-first application and its offline behavior.
- Share project-file rules without sharing browser stores or UI code.
- Keep metadata separate from large binary project payloads.
- Prefer simple, portable TypeScript and standard PostgreSQL behavior.
- Keep the initial fixed cost and operational burden low.
- Deploy the API independently from both the static PWA and the existing Cine service.
- Make cloud resources, secrets, migrations, DNS, and spending visible owner decisions.

## Decision

### Repository and package boundaries

The browser client remains at the repository root. We will add two npm workspaces under the same lockfile:

- `shared/` for browser- and server-neutral project contracts;
- `server/` for the backend application.

Both the root client and `server/` may depend on `shared/`. `shared/` must not depend on client stores, DOM APIs, IndexedDB, Hono, database code, or storage SDKs.

Moving the existing client into `client/` is explicitly rejected. It creates migration churn without improving the dependency direction.

### Shared project contract

`shared/` will own:

- `ProjectFile` types and the `PROJECT_VERSION` constant;
- runtime decoding and validation;
- binary-data normalization;
- pure project-file migrations.

The current format is `4.1.0`. Extracting the contract is not a format change and must not bump the version. The root client will keep small compatibility re-exports so #266 does not become a broad import rewrite.

The server may validate project data through `shared/`, but it must not hydrate editor stores. `shared/` exposes pure migrations; whether the later sync API accepts, migrates, or rejects older uploads is a separate protocol decision. The client remains authoritative for signed-out and local-only projects.

### Server runtime and HTTP boundary

The server uses Node 22, TypeScript, and Hono. It must:

- start from typed, validated configuration;
- listen on the platform-provided `PORT`;
- remain stateless between requests;
- shut down gracefully;
- expose a minimal public liveness response without topology or credential details;
- keep dependency readiness diagnostics separate, non-public, operator-gated, and on-demand rather than using them as a platform polling target;
- allow only `https://pixel-forge.app` as the production browser origin, with explicit local origins configured per environment and no wildcard CORS origin.

Scale-to-zero infrastructure cannot safely own in-process timers. Later reconciliation, cleanup, email, billing, or retention jobs must use a durable job or trigger rather than `setInterval`.

### Metadata and project blobs

PostgreSQL stores metadata through Drizzle. Project payload bytes do not belong in PostgreSQL.

Project payloads use a server-owned blob-storage port with:

- MinIO for local development and integration tests;
- a dedicated private Scaleway Object Storage bucket in production.

The private project bucket must never reuse the public `pixel-forge.app` website bucket. Runtime storage credentials remain server-side and receive only the actions and prefixes the API needs. Deployment credentials and runtime credentials are separate identities.

The existing `.pf` representation is zlib-deflated JSON, not gzip. The blob adapter preserves the exact bytes it receives. The later sync API may hash those exact stored bytes and must define compressed and decompressed size limits before inflating an upload. Network upload shape, retention, and garbage collection are deferred.

PostgreSQL and Object Storage do not form one atomic transaction. The later sync design must explicitly define write ordering, idempotency, and orphan cleanup.

### Local development

Docker Compose is local-development infrastructure only. It will provide PostgreSQL and MinIO with disposable development credentials, committed migrations, isolated test data, and documented reset commands.

A fresh clone must be able to run the client and server locally without Scaleway credentials.

### Production topology

The approved target topology is:

- `pixel-forge.app`: existing static PWA on Cloudflare and Scaleway Object Storage;
- `api.pixel-forge.app`: Scaleway Serverless Container in `fr-par`;
- metadata: PostgreSQL-compatible database selected by the gated compatibility step below;
- project payloads: a separate private Scaleway Object Storage bucket.

The API starts with request-based autoscaling and minimum scale zero. Maximum scale, concurrency, request timeout, database pool size, and log retention must be bounded before the first deployment. A warm instance is a later evidence-based optimization, not the default.

The existing Cine Instance and Caddy configuration are outside this decision. Pixel Forge will not be placed on that Instance. Any Cine audit or migration belongs to a separate project and thread.

### Database compatibility gate

The application targets standard PostgreSQL behavior so the production database can change without changing route or domain logic.

Before selecting a production database, #264 will run a bounded Scaleway Serverless SQL spike covering:

- migrations from an empty database;
- the Node driver with certificate-validating TLS and SNI;
- ordinary queries and short transactions;
- revision updates under concurrency;
- idle wake-up behavior and connection pooling;
- backup export and restore.

Serverless SQL currently has PostgreSQL compatibility differences and no VPC attachment. Serverless Containers also do not provide a dedicated IP for a narrow source-IP allowlist. The spike may use the database's public TLS endpoint with a dedicated least-privilege IAM application credential, but production use still requires explicit owner acceptance of that network boundary unless the spike proves another supported route.

If the spike requires unsupported behavior, produces unacceptable cold-start latency, or fails the security review, production uses Scaleway Managed PostgreSQL on a Private Network. No application architecture changes should be required for that fallback.

### Build, deployment, and rollback

GitHub Actions will:

1. pass the complete shared, client, and server verification gate;
2. build a `linux/amd64` server image;
3. tag the image immutably with the commit SHA;
4. push it to Scaleway Container Registry;
5. deploy that exact image only through the production gate.

Production hosts never pull source code and build it in place. `latest` is not a deployment identity.

The deployment record must retain the last-known-good image digest and an exact rollback command. Production migrations are explicit one-off steps, never application-startup behavior. Migrations use an expand/contract approach because installed PWA clients and server releases can remain on different versions.

### Operational approval gates

Agents may prepare code, tests, manifests, infrastructure definitions, and repeatable commands. The owner must explicitly approve:

- creating or replacing cloud resources;
- fixed recurring Pixel Forge backend costs;
- production credentials and their rotation path;
- DNS changes;
- production migrations;
- the first deployment and each later production promotion.

The initial incremental Pixel Forge backend ceiling is €25 per month before tax. It excludes the existing Cine Instance and the already-running static website. #264 must document the estimate and configure bounded resource settings before asking for deployment approval.

## Alternatives considered

### Put the API on the Cine Instance

Rejected for the initial Pixel Forge backend. It has the lowest immediate compute cost, but couples two products, credentials, deployments, and failure domains. The container boundary keeps a later move to an Instance possible if sustained traffic makes serverless uneconomical.

### Choose Managed PostgreSQL immediately

Deferred as the safe fallback. It provides a familiar Private Network boundary but introduces a fixed monthly database cost before the alpha workload is understood.

### Store project blobs in PostgreSQL

Rejected. Metadata queries and large project bytes have different access, lifecycle, and scaling needs.

### Move the entire client into a workspace

Rejected. Keeping the client at the root produces the required dependency direction with much less churn.

### Use Fastify instead of Hono

Fastify remains a valid fallback if a demonstrated plugin need appears. Hono is sufficient for the small, typed walking skeleton.

### Replace the backend with a hosted BaaS

Deferred. Authentication can be accelerated by a service later, but Pixel Forge still needs custom local-first synchronization, conflict, entitlement, and project-blob boundaries.

## Consequences

### Benefits

- The current application and static deployment remain stable.
- Shared validation becomes usable from both trusted client code and untrusted server input.
- Local services match the production protocols without requiring cloud access.
- The server is portable between Serverless Containers and an ordinary container host.
- Cloud spending and operational risk stay behind observable gates.

### Costs and constraints

- Serverless compute and a serverless database may both add wake-up latency after idle periods.
- Serverless SQL needs an explicit compatibility and security decision before production use.
- Object and metadata writes require recovery logic because they are not atomic.
- Independent PWA and API releases require deliberate compatibility windows.
- A separate private bucket and least-privilege identities add setup work, but avoid mixing public assets with user data.

## Implementation contracts

- #266 extracts only the shared project boundary and preserves client behavior.
- #265 adds only the local Hono process and process-level health.
- #267 proves portable PostgreSQL migrations and exposes a safe compatibility-test command.
- #268 proves the narrow blob port against MinIO.
- #269 builds a stateless non-root server image and extends CI without publishing it.
- #264 owns Serverless SQL evidence, the final production database choice, cloud resources, DNS, secrets, migration, deployment, health proof, cost evidence, and rollback.

No later issue becomes executable merely because this ADR exists. Each issue must be refreshed against the merged implementation that precedes it.

## Validation and revisit triggers

Revisit an implementation choice when evidence shows that:

- serverless cost exceeds a small always-on Instance at sustained traffic;
- cold-start latency harms save or sync behavior;
- Serverless SQL fails the compatibility or security gate;
- Hono lacks a required capability;
- the €25 incremental monthly ceiling cannot be maintained.

Those triggers may change a provider or framework. They do not reopen the local-first client, shared portable contract, or metadata/blob separation without a new product decision.

## Explicit non-goals

This ADR does not choose or implement:

- Cine hosting or shared cross-application infrastructure;
- authentication providers or email transport;
- the sync protocol, conflict payloads, or direct browser-to-storage access;
- user quotas, billing, retention, deletion, or export policy;
- background jobs, WAF/Edge Services, warm capacity, HA, multi-region, or disaster recovery;
- any cloud resource, credential, DNS record, migration, or deployment.

## References

Repository:

- `package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `src/types/project.ts`
- `src/serialization/project-data.ts`
- `src/serialization/project-load.ts`
- `src/services/persistence/project-repository.ts`
- `src/services/persistence/indexed-db.ts`

Platform documentation checked for this decision:

- [Scaleway Serverless Containers concepts](https://www.scaleway.com/en/docs/serverless-containers/concepts/)
- [Scaleway Serverless Containers limitations](https://www.scaleway.com/en/docs/serverless-containers/reference-content/containers-limitations/)
- [Scaleway Serverless Containers and Private Networks](https://www.scaleway.com/en/docs/serverless-containers/reference-content/containers-private-networks/)
- [Scaleway Serverless SQL networking](https://www.scaleway.com/en/serverless-sql-database/)
- [Scaleway Serverless SQL compatibility differences](https://www.scaleway.com/en/docs/serverless-sql-databases/reference-content/known-differences/)
- [Scaleway Serverless SQL TLS](https://www.scaleway.com/en/docs/serverless-sql-databases/api-cli/secure-connection-ssl-tls/)
- [Scaleway Serverless SQL backups](https://www.scaleway.com/en/docs/serverless-sql-databases/how-to/manage-backups/)
- [Scaleway Serverless pricing](https://www.scaleway.com/en/pricing/serverless/)
- [Scaleway Managed Database pricing](https://www.scaleway.com/en/pricing/managed-databases/)
