# Scaleway backend access and cost controls

Status: preparation only

Owner: Pixel Forge project owner

Tracking capability: [#264](https://github.com/Flow-Fly/pixel-forge/issues/264)

Last price and permission review: 2026-07-21

This document prepares decisions; it does not grant access or authorize spend.
Use it with the [deployment runbook](scaleway-backend-deployment.md) and
[evidence templates](scaleway-backend-evidence.md).

## Control principles

- The owner remains the only approver for provider resources, identities,
  credentials, recurring cost, database selection, migrations, image
  publication, deployment, DNS, rollback, and destructive cleanup.
- Deployment, migration, and runtime use separate principals. A leaked runtime
  credential must not deploy images, change infrastructure, or run migrations.
- The backend runtime must be unable to read or mutate the existing
  `pixel-forge.app` website bucket.
- Secret values never enter Git, build arguments, image layers, shell history,
  GitHub issue/PR text, or unredacted evidence.
- Permission sets are an initial proposal. Verify their live effective scope
  with the Scaleway policy simulator or controlled positive and negative tests
  before issuing credentials.
- Every credential gets an owner, purpose, issue link, creation time, rotation
  date, revocation procedure, and last-use evidence.

## Responsibility and permission proposal

The current Scaleway permission-set reference distinguishes product read,
write, and full-access capabilities. Prefer the narrow sets below over
`AllProductsFullAccess`.

| Principal | Intended use | Proposed permissions | Explicitly denied by role design |
| --- | --- | --- | --- |
| Owner | Approvals and exceptional recovery | Human account with strong authentication; temporarily delegates narrowly scoped policies | Routine CI or runtime use |
| Read-only auditor | Inventory, cost, and evidence checks | `ContainersReadOnly`, `ContainerRegistryReadOnly`, `ServerlessSQLDatabaseReadOnly` or `RelationalDatabasesReadOnly` for provider metadata, `ObjectStorageBucketsRead`, `ObservabilityReadOnly`, and IAM metadata read-only when required | All mutation and secret-version access |
| Deployment application | Push an approved digest and update the approved container | `ContainerRegistryFullAccess` and `ContainersFullAccess`, project-scoped; add `PrivateNetworksReadOnly` only for the Managed PostgreSQL topology | Database data, migration credentials, runtime object access, website-bucket deployment |
| Provisioning application | One approved resource-creation session | Temporary product-specific full access only for resources named in that approval; bucket-policy access only while installing the reviewed policy | Persistent runtime or ordinary deployment use; revoke after the session |
| Migration application/database role | One approved migration | Database DDL on the selected Pixel Forge database only; for Serverless SQL, evaluate `ServerlessSQLDatabaseReadWrite` rather than full resource administration | Resource creation/deletion, container deployment, object storage, unrelated databases |
| Runtime application/database role | Serve API requests | `ServerlessSQLDatabaseDataReadWrite` when that IAM path is used, plus a native PostgreSQL DML-only role on the application schema; object `Get`, `Put`, and `Delete`, plus only the bucket-level access required by readiness, restricted to the private project bucket/prefix | DDL, provider administration, bucket creation/deletion/policy changes, registry, deployment, website bucket |
| DNS operator | Add or roll back the one approved `api` record | Cloudflare token scoped to DNS edit for the `pixel-forge.app` zone | Other zones, account settings, unrelated records |

Scaleway project-level Object Storage sets can be broader than the one bucket
the runtime needs. Install and review a bucket policy that names the runtime
application, allows only the required actions and prefix, requires TLS, and
explicitly protects the website bucket. The current adapter uses `HeadBucket`,
`GetObject`, `PutObject`, and `DeleteObject`; verify an allowed operation on the
private project bucket and a denied operation against `pixel-forge.app`.

Do not invent a narrower permission name if the live console does not offer
it. Stop and ask the owner whether to use a reviewed resource policy, a
separate Scaleway Project, or a different credential boundary.

Scaleway resource IAM and PostgreSQL database roles are separate boundaries.
For the Managed PostgreSQL fallback, `RelationalDatabasesReadOnly` lets an
auditor inspect provider resource metadata; the runtime receives no provider
database-administration permission and uses only a native PostgreSQL DML role.
For Serverless SQL, `ServerlessSQLDatabaseDataReadWrite` excludes table-shape
and resource-setting changes. The migration identity may use
`ServerlessSQLDatabaseReadWrite`, which includes table-structure changes but
not database creation or settings, only for the approved migration window.

## Secret names and consumers

Names below are proposals, not values. Existing static-site deployment secrets
must not be repurposed for the backend.

| Secret name | Store | Consumer | Purpose |
| --- | --- | --- | --- |
| `PIXEL_FORGE_PROD_SCW_DEPLOY_ACCESS_KEY_ID` | GitHub production environment | Approved deployment job | Registry and container deployment identity |
| `PIXEL_FORGE_PROD_SCW_DEPLOY_SECRET_ACCESS_KEY` | GitHub production environment | Approved deployment job | Deployment credential counterpart |
| `PIXEL_FORGE_PROD_SCW_PROJECT_ID` | GitHub production environment or non-secret variable | Approved deployment job | Pins every command to one project |
| `PIXEL_FORGE_PROD_DATABASE_MIGRATION_URL` | Approved migration secret path | One-off migration job | DDL-capable connection for the selected database |
| `DATABASE_URL` | Serverless Container secret environment | Backend process | Runtime DML connection only |
| `STORAGE_ACCESS_KEY_ID` | Serverless Container secret environment | Backend process | Private project-bucket runtime identity |
| `STORAGE_SECRET_ACCESS_KEY` | Serverless Container secret environment | Backend process | Runtime storage credential counterpart |
| `PIXEL_FORGE_PROD_CLOUDFLARE_DNS_TOKEN` | Owner-approved DNS environment | One-off DNS job or operator | One-zone DNS edit only |

`CORS_ALLOWED_ORIGINS`, `BUILD_REVISION`, `DATABASE_MAX_CONNECTIONS`,
`STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, and
`STORAGE_FORCE_PATH_STYLE` are configuration, not secrets. Resource IDs may be
sensitive operational metadata even when they are not credentials; keep them
in the approved evidence location rather than public issue text.

Do not add examples shaped like access keys or database passwords. Record only
the secret name, version identifier, store, consumer, and rotation/revocation
evidence.

## Approval and stop gates

Each approval is narrow, single-stage, and recorded as an owner-authored GitHub
comment or other durable owner record linked from the evidence. Approval of one
gate does not imply approval of the next.

| Gate | Owner must approve | Stop when |
| --- | --- | --- |
| Temporary SQL experiment | Database shape, public TLS/IAM boundary, €2 maximum, deletion owner, 48-hour deadline | Tooling still requires bypassing a safety interlock; estimate exceeds €2; cleanup cannot be guaranteed |
| Production database choice | Compatibility evidence, latency, network boundary, backup/restore, current cost | Required PostgreSQL behavior fails; security boundary is rejected; monthly estimate lacks headroom |
| Resource creation | Exact inventory, names, region, tags, owner, cost, cleanup | Live inventory differs; any resource is destructive replacement or outside Pixel Forge |
| Identity and credential creation | Principal, exact policy, secret path, expiry, rotation, negative tests | Policy reaches the website bucket or unrelated resources; secret would enter logs or Git |
| Image publication | Full source SHA, green checks, `linux/amd64`, digest capture, retention | Image is mutable, rebuilt from another tree, too large, or fails the approved scan/smoke |
| Migration | Reviewed SQL, selected target ID, backup/restore evidence, compatible rollback/roll-forward | Current command requires bypassing `non-production`; target identity is ambiguous; backup cannot be restored |
| First deployment | Exact digest, migration result, secret versions, bounds, rollback digest, current estimate | Any input is `latest`, a secret is exposed, readiness cannot be observed, or rollback is not viable |
| DNS | Generated endpoint, exact record, proxy/TLS choice, TTL, rollback record | Endpoint or certificate is unhealthy; change would touch existing apex/static records |
| Rollback | Trigger, last-known-good digest, schema compatibility, operator | Migration makes the old image unsafe; evidence is incomplete |
| Cleanup | Exact IDs, backup/export, expected data loss, billing check, owner | Target is broad, inferred, production data, website storage, or lacks recovery evidence |

## Pricing model

All figures are before tax. They are a snapshot, not a quote. Scaleway prices,
free-tier consumption elsewhere in the account, minimum billable units,
resource sizes, and traffic can change. Recalculate from the live pricing pages
and the console estimate immediately before every spend approval.

The €25/month figure from ADR 0001 is an owner operating ceiling, not a
provider-enforced billing cap. Usage-based Serverless SQL and container charges
can exceed it. Use provider budgets/alerts as notification only; they do not
make the architecture incapable of overspend.

### Price snapshot

| Item | Price used by worksheet | Billing note |
| --- | --- | --- |
| Serverless Container vCPU | €0.00001/vCPU-second after 200,000 free vCPU-seconds/account/month | Free tier is shared across the account |
| Serverless Container memory | €0.000001/GB-second after 400,000 free GB-seconds/account/month | Warm/provisioned resources consume billable resources |
| Serverless SQL compute | €0.13572/vCPU-hour | Minimum five-minute active window |
| Serverless SQL storage | €0.000272/GB-hour | Continues while data is stored |
| Serverless SQL backup | Included daily backup retained seven days | Restore activity can wake/bill compute |
| Managed PostgreSQL `DB-DEV-S` main node | €0.0156/hour | Storage, backup, topology, and options are additional |
| Standard Multi-AZ Object Storage | €0.0146/GB-month | Requests/ingress included; recheck current regional price |
| Object Storage egress | First 75 GB/month included, then €0.01/GB | Confirm account and traffic applicability |
| Private Container Registry | €0.027/GB-month | Intra-region transfer is free |
| Cockpit Scaleway data/default retention | Included | Default metrics 31 days; logs/traces seven days |
| Cockpit active alert rule | €0.015/day | Each active rule is recurring usage |

### Formulas

Use 730 hours and 30 days only for estimates; use actual billed time for
closeout.

```text
container_vcpu = max(0, vcpu_seconds - remaining_free_vcpu_seconds) * 0.00001
container_memory = max(0, gb_seconds - remaining_free_gb_seconds) * 0.000001
serverless_sql_compute = active_vcpu_hours * 0.13572
serverless_sql_storage = average_database_gb * 730 * 0.000272
managed_db_node = node_hourly_price * 730
object_storage = average_project_blob_gb * 0.0146
private_registry = retained_private_image_gb * 0.027
cockpit_alerts = active_rules * active_days * 0.015
billable_egress = max(0, egress_gb - applicable_free_egress_gb) * 0.01
```

One isolated one-vCPU Serverless SQL wake costs at least about €0.01131:
`€0.13572 / 12`. One hundred isolated wake windows cost about €1.13 before
storage. One stored database GB costs about €0.20/month:
`1 * 730 * €0.000272 = €0.19856`.

The `DB-DEV-S` main node is about €11.39/month before storage and backups:
`730 * €0.0156`. Comparing node compute alone, Serverless SQL reaches that
amount near 84 active one-vCPU hours/month. This is a rough economic trigger,
not an automatic database decision; the Managed PostgreSQL topology, storage,
backup, network boundary, and operational behavior also matter.

## Cheapest credible low-traffic alpha

Under the accepted serverless architecture, the cheapest credible case keeps
the container at minimum scale zero, stays inside the account's unused
container free tier, stores little data, retains few images, and wakes SQL only
for real use.

Example fixed usage assumptions:

- 1 GB average Serverless SQL storage: €0.19856/month;
- 10 GB average private project objects: €0.14600/month;
- 5 GB retained private images: €0.135/month;
- default Cockpit retention and no paid alert rule: €0;
- container usage within the still-available account free tier: €0.

Fixed estimate: **€0.47956/month**, rounded to about **€0.48**, plus
Serverless SQL wakes and any billable traffic. For example, 100 isolated
five-minute wake windows add about €1.13, producing roughly €1.61 before tax.
Actual session duration can cost more; adjacent activity may share an active
window. This is the cheapest credible scenario, not a guaranteed bill.

## Conservative alpha worksheet

This scenario deliberately leaves headroom below €25:

| Assumption | Estimated monthly cost |
| --- | ---: |
| 100 active one-vCPU Serverless SQL hours | €13.57200 |
| 1 GB average SQL storage | €0.19856 |
| 10 GB Multi-AZ project objects | €0.14600 |
| 5 GB private registry images | €0.13500 |
| 100,000 billable container vCPU-seconds beyond free tier | €1.00000 |
| 100,000 billable container GB-seconds beyond free tier | €0.10000 |
| Two Cockpit alert rules for 30 days | €0.90000 |
| Egress within applicable free allowance | €0.00000 |
| **Estimated usage** | **€16.05156** |
| **Unallocated owner ceiling headroom** | **€8.94844** |

The headroom absorbs estimate error; it is not an instruction to consume more.
At €20 forecast or observed monthly usage, stop discretionary changes and
review the database choice and traffic before the €25 ceiling is reached.

## Managed PostgreSQL fallback

The cheapest listed `DB-DEV-S` main-node compute is about €11.39/month before
storage, backups, extra nodes, or options. Record the live console's complete
topology price; do not claim the fallback fits under €25 from node price alone.

A single small node may be the cheapest credible alpha fallback but has a
different availability profile from additional-node or Multi-AZ choices. The
owner must explicitly accept that tradeoff. Select Managed PostgreSQL when its
Private Network and ordinary PostgreSQL behavior are worth the fixed cost, or
when Serverless SQL is active for roughly 84 hours/month or more and the full
live estimates favor the managed service.

## Cheaper alternatives not selected

- `STARDUST1-S` is listed around €0.10/month before attached storage, public
  addressing, backups, and operator time. Self-hosting the API and PostgreSQL
  there would be cheaper on the provider invoice, but it transfers patching,
  database durability, backups, monitoring, incident response, and capacity
  risk to the owner. It also departs from the accepted Serverless Containers
  walking-skeleton topology.
- Reusing the existing Cine Instance may have near-zero incremental compute
  cost, but ADR 0001 rejects coupling the products' credentials, deployments,
  and failure domains.
- Running locally or on an unmanaged free service is not a credible production
  target for an owner-gated backend with durable metadata and project bytes.

These options can be reconsidered through a new architecture decision if
actual serverless cost or latency triggers the ADR revisit criteria. They are
not silently substituted during #264.

## Cost closeout

After every temporary experiment, first deployment, and monthly review:

- [ ] Record actual resource hours, storage, registry size, egress, and active rules.
- [ ] Record the amount of container free tier that was actually available.
- [ ] Compare estimate versus provider cost dashboard and invoice.
- [ ] Confirm temporary resources and credentials were deleted/revoked.
- [ ] Forecast the rest of the month and stop at the €20 review trigger.
- [ ] Ask the owner before accepting any fixed recurring charge or higher ceiling.

## Official sources

All sources accessed 2026-07-21. Recheck every pricing page before approval.

- [Scaleway Serverless pricing](https://www.scaleway.com/en/pricing/serverless/)
- [Scaleway Managed Database pricing](https://www.scaleway.com/en/pricing/managed-databases/)
- [Scaleway Object Storage pricing](https://www.scaleway.com/en/pricing/storage/)
- [Container Registry pricing FAQ](https://www.scaleway.com/en/docs/container-registry/faq/)
- [Cockpit pricing](https://www.scaleway.com/en/pricing/managed-services/)
- [Scaleway Instance pricing](https://www.scaleway.com/en/pricing/virtual-instances/)
- [Scaleway IAM permission sets](https://www.scaleway.com/en/docs/iam/reference-content/permission-sets/)
- [Object Storage bucket policies](https://www.scaleway.com/en/docs/object-storage/api-cli/bucket-policy/)
- [Serverless SQL FAQ](https://www.scaleway.com/en/docs/serverless-sql-databases/faq/)
