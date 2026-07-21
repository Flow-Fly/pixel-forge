# Scaleway backend deployment runbook

Status: preparation only

Owner: Pixel Forge project owner

Tracking capability: [#264](https://github.com/Flow-Fly/pixel-forge/issues/264)

Last source review: 2026-07-21

This runbook describes the proposed first production deployment of the backend
walking skeleton. It does not authorize or perform that deployment. Every
external mutation remains behind a separately recorded owner approval.

The target remains the topology accepted in
[ADR 0001](../../specs/adr/0001-backend-walking-skeleton.md):

- keep the static PWA at `pixel-forge.app` on its existing Cloudflare and
  Scaleway Object Storage path;
- run `api.pixel-forge.app` as a Scaleway Serverless Container in `fr-par`;
- keep project bytes in a new private bucket, never the website bucket;
- choose Serverless SQL only after its compatibility and network-boundary gate;
- use Managed PostgreSQL on a Private Network if that gate fails;
- leave Cine, Caddy, and the existing Instance untouched.

Read [access and cost controls](scaleway-backend-access-and-costs.md) before
using this runbook. Record each future step in the
[evidence templates](scaleway-backend-evidence.md).

## Hard stop: the repository is not production-migration ready

The current database compatibility and migration commands deliberately require
`DATABASE_SAFETY_CONFIRM=non-production`. The storage compatibility command is
also restricted to loopback endpoints. Do not weaken or bypass either
interlock during deployment.

A separate, approved code slice must add a production-safe migration target
and strengthen the compatibility probe before the temporary database spike or
any production migration. This documentation slice does not add that tooling.

## Source and command baseline

This runbook targets the stable Scaleway Serverless Containers `v1` API. The
`v1beta1` API is deprecated. In `v1`, creating or updating a container deploys
it automatically, and a Containers namespace no longer creates a Container
Registry namespace automatically. Treat both facts as mutation hazards, not
conveniences.

Before an approved session, record the exact tool versions and re-open every
source marked **verify at execution**:

```sh
scw version
docker version
git rev-parse HEAD
```

The `scw container ...` commands below follow the current CLI reference
generated for the `v1` API. Each mutating example starts with `echo`, contains
placeholder identifiers, and is inert as written. Removing `echo` is a
deliberate execution step allowed only after the matching owner gate is linked
in the evidence record.

## Proposed resource inventory

| Resource | Proposed identity | Region | Lifecycle and boundary |
| --- | --- | --- | --- |
| Existing static website bucket | `pixel-forge.app` | `fr-par` | Existing; never read, written, or managed by backend identities |
| Existing Cloudflare zone | `pixel-forge.app` | Global | Existing; only a separately approved DNS change may add the API record |
| Serverless Containers namespace | `<CONTAINER_NAMESPACE_ID>` | `fr-par` | New; production API resources only |
| Private Container Registry namespace | `<REGISTRY_NAMESPACE_ID>` | `fr-par` | New; immutable server images only |
| Server image | `<REGISTRY>/pixel-forge-server@sha256:<DIGEST>` | `fr-par` | Built from and labelled with `<FULL_GIT_SHA>`; never `latest` |
| Serverless Container | `<CONTAINER_ID>` | `fr-par` | New; public HTTPS API, minimum scale zero |
| Container-generated endpoint | `<CONTAINER_PUBLIC_ENDPOINT>` | `fr-par` | Capture before proposing DNS |
| Container custom domain | `api.pixel-forge.app` | `fr-par` | New; only after endpoint verification and DNS approval |
| Private project bucket | `<PROJECT_BUCKET_NAME>` | `fr-par` Multi-AZ | New; private project bytes only |
| Temporary Serverless SQL database | `<SPIKE_DATABASE_ID>` | `fr-par` | Optional, owner-approved spike; delete within 48 hours |
| Production Serverless SQL database | `<PRODUCTION_DATABASE_ID>` | `fr-par` | Create only if compatibility and public TLS/IAM boundary are accepted |
| Managed PostgreSQL fallback | `<RDB_INSTANCE_ID>` | `fr-par` | Alternative to production Serverless SQL, not an additional database |
| Private Network for fallback | `<PRIVATE_NETWORK_ID>` | `fr-par` | Create/attach only with Managed PostgreSQL fallback |
| Deployment, migration, runtime identities | `<APPLICATION_IDS>` | Project-scoped | Separate applications and credentials; see access runbook |
| Cockpit evidence | `<COCKPIT_DASHBOARD_URL>` | `fr-par` | Default Scaleway data/retention first; paid rules require approval |

Every placeholder must map to exactly one evidence record. Never put a secret,
database URL, access key, token, or unredacted provider response in this table,
Git, GitHub issues, or pull requests.

## Proposed initial container bounds

These are conservative alpha starting values, not deployed settings:

| Setting | Proposed value | Reason |
| --- | --- | --- |
| Image | immutable registry digest for `<FULL_GIT_SHA>` | Makes promotion and rollback unambiguous |
| Port | platform-provided `PORT` | `PORT` is reserved by Serverless Containers; the app already reads it |
| Minimum scale | `0` | Allows scale to zero and avoids fixed warm compute |
| Maximum scale | `2` | Bounds compute and aggregate database connections during the alpha |
| Memory | `512 MiB` (`536870912` bytes) | Small starting allocation; confirm with the real image |
| CPU | `250 mvCPU` | Small starting allocation; confirm cold-start and request behavior |
| Concurrent requests | `8` per instance | Bounds work and database pressure |
| Request timeout | `30s` | The public walking-skeleton path should not run long work |
| Database connections | `4` per instance | Existing server default; at max scale, no more than eight app connections |
| Liveness path | `/api/health` | Process/build liveness only; never probes dependencies |
| Startup path | `/api/health` | Prevents traffic before the HTTP process listens |
| CORS origin | `https://pixel-forge.app` | Exact production browser origin, never `*` |
| Log retention | Scaleway default | Avoids extended-retention charges until evidence justifies them |

Serverless Containers currently allow 70–6000 mvCPU, 128–12228 MB memory,
maximum scale 50, concurrency up to 80 per instance, and 10 seconds to 60
minutes request timeout. They scale an idle minimum-zero instance down after
about 15 minutes. Recheck the official limits before execution.

## Stage 0: read-only preflight

Stop if the current `origin/main` commit is not the explicitly approved source
revision or if the live resource inventory differs from the previous evidence.

```sh
git fetch origin
git rev-parse origin/main
git status --short

scw account project get project-id=<SCW_PROJECT_ID>
scw container namespace list project-id=<SCW_PROJECT_ID> region=fr-par
scw container container list project-id=<SCW_PROJECT_ID> region=fr-par
scw container domain list project-id=<SCW_PROJECT_ID> region=fr-par
scw registry namespace list project-id=<SCW_PROJECT_ID> region=fr-par
```

These commands are read-only but still require authorized provider access.
They belong in a future approved operator session, not this docs-only slice.

Before proceeding, confirm all of the following:

- [ ] The approved source is a full commit SHA already green in CI.
- [ ] The resource names do not collide with existing resources.
- [ ] `pixel-forge.app` and its deployment credentials are outside the write boundary.
- [ ] The latest console estimates have been copied into the cost evidence.
- [ ] The deployment and rollback image digests are known.
- [ ] The next single mutation and its cleanup are explicitly approved.

## Stage 1: temporary Serverless SQL compatibility experiment

Required owner gate: temporary resource creation, a maximum €2 experiment
budget, the public TLS/IAM boundary, and mandatory deletion within 48 hours.

The future production-safe compatibility command must prove:

- migrations from an empty database;
- certificate-validating TLS and SNI with the Node PostgreSQL driver;
- ordinary reads/writes and short transactions;
- revision updates under concurrent connections;
- idle wake behavior and connection-pool bounds;
- backup export and restore;
- cleanup of the compatibility record and temporary database.

Serverless SQL differs from ordinary PostgreSQL in material ways, including
unsupported temporary tables and non-guaranteed advisory locks. A green basic
query is not sufficient. Record each result independently.

Stop and select the Managed PostgreSQL fallback when any required behavior
fails, cold-start latency is unacceptable, cleanup cannot be proven, or the
owner rejects a database available only through the public TLS endpoint.

## Stage 2: production resource preparation

Required owner gate: final database choice, full resource list, identity plan,
current monthly estimate, and cleanup owner.

The following examples are intentionally inert:

```sh
# REMOVE echo only after linking the resource-creation approval record.
echo scw container namespace create \
  project-id=<SCW_PROJECT_ID> \
  name=pixel-forge-production \
  description='Pixel Forge production API' \
  tags.0=pixel-forge \
  tags.1=production \
  region=fr-par

# The v1 namespace does not create this registry namespace for you.
echo scw registry namespace create \
  project-id=<SCW_PROJECT_ID> \
  name=<REGISTRY_NAMESPACE_NAME> \
  is-public=false \
  region=fr-par
```

Create the private project bucket and its bucket policy only from an approved,
reviewed policy artifact. The policy must grant the runtime principal only the
object operations used by the server and must explicitly prevent access to the
public website bucket. Verify both an allowed project-object operation and a
denied website-bucket operation before deployment.

If Managed PostgreSQL is selected, create its Private Network in this stage and
attach the database and future container to that one network. Serverless
Containers can attach to one Private Network and use a different automatically
assigned address per instance; they do not provide a dedicated source IP.

## Stage 3: immutable image publication

Required owner gate: registry write, full source SHA, reviewed image build,
image size, vulnerability result, target architecture, and retention plan.

The canonical CI build must use `linux/amd64`, preserve the repository's pinned
Node base-image digest, and pass `npm run server:container:smoke`. Publication
must produce both:

- `<REGISTRY>/pixel-forge-server:<FULL_GIT_SHA>` for human traceability;
- `<REGISTRY>/pixel-forge-server@sha256:<DIGEST>` for deployment identity.

Do not publish or deploy `latest`. Do not rebuild the same SHA after approval;
promote the already-reviewed digest.

## Stage 4: gated migration

Required owner gate: selected target database, backup/restore evidence,
reviewed migration SQL, forward and rollback decision, exact source revision,
and approved production migration tooling.

There is intentionally no executable production migration command in this
runbook yet. The current command refuses production. The follow-up code slice
must provide a positive production-target identity check, a dry inspection
path, a one-off execution path, structured evidence without connection details,
and an explicit owner confirmation. Migrations must never run during app
startup.

## Stage 5: first container deployment

Required owner gate: migration success, secret injection, exact image digest,
container bounds, rollback digest, and current cost estimate.

The creation example is inert and uses only secret **names**:

```sh
# REMOVE echo only after linking the first-deployment approval record.
echo scw container container create \
  namespace-id=<CONTAINER_NAMESPACE_ID> \
  name=pixel-forge-api \
  image=<REGISTRY>/pixel-forge-server@sha256:<DIGEST> \
  min-scale=0 \
  max-scale=2 \
  memory-limit-bytes=536870912 \
  mvcpu-limit=250 \
  timeout=30s \
  privacy=public \
  protocol=http1 \
  port=3001 \
  https-connections-only=true \
  scaling-option.concurrent-requests-threshold=8 \
  startup-probe.http.path=/api/health \
  liveness-probe.http.path=/api/health \
  environment-variables.HOST=0.0.0.0 \
  environment-variables.NODE_ENV=production \
  environment-variables.BUILD_REVISION=<FULL_GIT_SHA> \
  environment-variables.CORS_ALLOWED_ORIGINS=https://pixel-forge.app \
  environment-variables.DATABASE_MAX_CONNECTIONS=4 \
  environment-variables.STORAGE_REGION=fr-par \
  environment-variables.STORAGE_BUCKET=<PROJECT_BUCKET_NAME> \
  environment-variables.STORAGE_ENDPOINT=https://s3.fr-par.scw.cloud \
  environment-variables.STORAGE_FORCE_PATH_STYLE=false \
  secret-environment-variables.DATABASE_URL=<VALUE_FROM_APPROVED_SECRET_PATH> \
  secret-environment-variables.STORAGE_ACCESS_KEY_ID=<VALUE_FROM_APPROVED_SECRET_PATH> \
  secret-environment-variables.STORAGE_SECRET_ACCESS_KEY=<VALUE_FROM_APPROVED_SECRET_PATH> \
  region=fr-par
```

Do not paste this rendered command into a terminal with real secret values;
the values must move from the approved secret path to the provider without
appearing in shell history, CI logs, or evidence. Verify the supported secure
injection mechanism again when the deployment automation is implemented.

Container `v1` creates and updates deploy automatically. Capture the resulting
container ID, endpoint, immutable image reference, settings, and status before
making any DNS change.

## Stage 6: liveness and dependency readiness

Public liveness proves only that the process and build are alive:

```sh
curl --fail-with-body https://<CONTAINER_PUBLIC_ENDPOINT>/api/health
```

The response must name the approved build revision and must not expose a
database host, bucket, provider identifier, credentials, or dependency error.

Database and storage readiness remain separate, authenticated, on-demand
operator commands. They must not be platform polling targets because polling
would keep minimum-zero services awake. Store redacted structured results in
the evidence record; never publish raw driver or SDK errors.

## Stage 7: custom domain and Cloudflare DNS

Required owner gate: verified generated endpoint, exact proposed DNS record,
proxy mode, TLS behavior, TTL, rollback record, and maintenance window.

First register the custom domain with the container. The example is inert:

```sh
# REMOVE echo only after linking the DNS approval record.
echo scw container domain create \
  container-id=<CONTAINER_ID> \
  hostname=api.pixel-forge.app \
  region=fr-par
```

Capture the DNS target and validation instructions returned by Scaleway. Then
create exactly the required `api` record in Cloudflare. Do not infer the target
or proxy setting from this document: confirm them against the live Scaleway
custom-domain instructions and Cloudflare's current CNAME/TLS guidance.

Verify `https://api.pixel-forge.app/api/health`, the certificate chain, exact
CORS response for `https://pixel-forge.app`, and rejection of an unapproved
origin. Leave the existing apex and website records unchanged.

## Rollback

Define rollback before every promotion. A rollback is allowed only to a known
green digest whose database contract remains compatible with the applied
migration.

The image rollback example is inert:

```sh
# REMOVE echo only after linking the rollback approval record.
echo scw container container update <CONTAINER_ID> \
  image=<REGISTRY>/pixel-forge-server@sha256:<LAST_KNOWN_GOOD_DIGEST> \
  region=fr-par
```

Because a `v1` update deploys automatically, monitor the rollout immediately.
Re-run public liveness, gated readiness, CORS, and log checks. If the migration
is not backward compatible, stop traffic and use the migration-specific
recovery plan rather than pretending an image rollback is sufficient.

DNS rollback restores the exact previous record captured before mutation. It
must not delete or replace unrelated Cloudflare records.

## Cleanup boundary

Cleanup is its own destructive gate. Before deletion, list the exact resource
ID, dependencies, retained evidence, backup/export status, expected data loss,
and recovery window. Namespace deletion cascades to contained resources and is
irreversible; never use a namespace delete command as routine rollback.

For the temporary SQL experiment, cleanup is successful only when the database
is deleted, its credentials are revoked, the deletion is observed in the
provider inventory, and post-cleanup billing is checked. Production data and
the private project bucket are never broad-cleanup targets.

## Official sources

All sources accessed 2026-07-21. Recheck pages marked **verify at execution**.

- [Serverless Containers v1 migration guide](https://www.scaleway.com/en/docs/serverless-containers/reference-content/v1-migration-guide/) — stable API changes; **verify at execution**
- [Scaleway CLI: Serverless Containers](https://cli.scaleway.com/container/) — command and field reference; **verify at execution**
- [Serverless Containers limits](https://www.scaleway.com/en/docs/serverless-containers/reference-content/containers-limitations/) — resource bounds and `linux/amd64`; **verify at execution**
- [Serverless Containers and Private Networks](https://www.scaleway.com/en/docs/serverless-containers/reference-content/containers-private-networks/) — network behavior and limits
- [Serverless SQL PostgreSQL differences](https://www.scaleway.com/en/docs/serverless-sql-databases/reference-content/known-differences/) — compatibility gate
- [Serverless SQL TLS](https://www.scaleway.com/en/docs/serverless-sql-databases/api-cli/secure-connection-ssl-tls/) — certificate-validating connection
- [Serverless SQL backups](https://www.scaleway.com/en/docs/serverless-sql-databases/how-to/manage-backups/) — backup and restore evidence
- [Object Storage bucket policies](https://www.scaleway.com/en/docs/object-storage/api-cli/bucket-policy/) — prefix-scoped resource policies and TLS condition
- [Cloudflare subdomain records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-subdomain/) — CNAME and proxy/TLS choices; **verify at execution**
