# Scaleway backend evidence and sign-off templates

Status: blank templates only  
Owner: Pixel Forge project owner  
Tracking capability: [#264](https://github.com/Flow-Fly/pixel-forge/issues/264)

Copy the relevant template into the owner-approved private operational record
for each future execution. Do not fill these templates in this repository with
real resource identifiers, private endpoints, credentials, database URLs,
tokens, provider responses, or sensitive logs.

GitHub issues and pull requests should receive a short redacted summary and a
link to the durable evidence location. They are not secret stores.

## Evidence rules

Every external stage records:

- UTC start and finish time;
- human operator and accountable owner;
- owner-authored approval link for that exact stage;
- repository, full source commit, immutable image digest when applicable;
- tool names and exact versions;
- exact commands with secret-bearing arguments replaced by secret **names**;
- provider resource type and opaque evidence reference, not a public secret;
- expected result, observed result, and pass/fail decision;
- redacted output/checksum location;
- stop, rollback, and cleanup result;
- current cost estimate and post-action billing observation;
- next decision and owner sign-off.

Never record a secret value. Redaction must remove credentials, connection
URLs, signed URLs, private endpoints, certificates containing private keys,
request authorization headers, and raw provider errors that may echo inputs.
Prefer the application's bounded structured events over raw SDK/driver output.

## Stage summary

```md
### <STAGE_NAME> — <UTC_DATE>

- Status: planned | approved | running | passed | failed | rolled-back | cleaned-up
- Operator: <HUMAN_OR_APPROVED_AUTOMATION>
- Owner: <OWNER>
- Approval record: <OWNER_AUTHORED_LINK>
- Source commit: <FULL_GIT_SHA>
- Image digest: <NOT_APPLICABLE_OR_SHA256_DIGEST_REFERENCE>
- Tool versions: <REDACTED_EVIDENCE_REFERENCE>
- Resource references: <PRIVATE_EVIDENCE_REFERENCE>
- Estimate before action: <EUR_BEFORE_TAX_AND_ASSUMPTIONS>
- Started at: <UTC_TIMESTAMP>
- Finished at: <UTC_TIMESTAMP>
- Expected result: <ONE_SENTENCE>
- Observed result: <ONE_SENTENCE>
- Redacted evidence: <DURABLE_PRIVATE_REFERENCE_AND_CHECKSUM>
- Decision: pass | fail | stop
- Rollback result: not-needed | passed | failed | blocked
- Cleanup result: not-applicable | passed | failed | blocked
- Billing observation: <CURRENT_PROVIDER_ESTIMATE>
- Next owner decision: <DECISION_OR_NONE>
```

## Temporary Serverless SQL compatibility experiment

### Approval and safety

- [ ] Owner approved the public TLS/IAM boundary for a temporary experiment.
- [ ] Owner approved an exact resource shape and a maximum €2 spend.
- [ ] A named operator owns deletion within 48 hours.
- [ ] The production-safe compatibility tooling exists; no safety interlock is bypassed.
- [ ] Database name and tags make `temporary`, `pixel-forge`, expiry, and owner visible.
- [ ] Dedicated temporary credentials have an expiry and revocation procedure.
- [ ] Empty-database creation and deletion affect no existing resource.
- [ ] Latest official compatibility, TLS, backup, and pricing pages were reviewed.

### Compatibility record

```md
#### Serverless SQL compatibility record

- Approval: <LINK>
- Resource created at: <UTC_TIMESTAMP>
- Mandatory deletion deadline: <UTC_TIMESTAMP_WITHIN_48_HOURS>
- Database evidence reference: <PRIVATE_REFERENCE>
- PostgreSQL engine/version: <VERSION>
- Node/postgres driver version: <VERSION>
- Connection transport: certificate-validating TLS with SNI | fail
- Migration source commit: <FULL_GIT_SHA>
- Migration set/checksum: <REFERENCE>
- Starting state: empty and independently verified | fail

| Check | Expected | Observed | Evidence | Verdict |
| --- | --- | --- | --- | --- |
| Migrations from zero | All committed migrations apply once | <OBSERVED> | <REFERENCE> | pass/fail |
| Idempotent rerun | No duplicate/destructive change | <OBSERVED> | <REFERENCE> | pass/fail |
| Readiness query | Bounded query succeeds | <OBSERVED> | <REFERENCE> | pass/fail |
| Short transaction | Write/read/delete commits atomically | <OBSERVED> | <REFERENCE> | pass/fail |
| Revision concurrency | Conflicting revision behavior matches contract | <OBSERVED> | <REFERENCE> | pass/fail |
| Pool bound | Configured maximum is observed | <OBSERVED> | <REFERENCE> | pass/fail |
| Idle wake | Latency and billed window are acceptable | <OBSERVED> | <REFERENCE> | pass/fail |
| Known-difference audit | App uses no unsupported behavior | <OBSERVED> | <REFERENCE> | pass/fail |
| Backup export | Restorable export is produced | <OBSERVED> | <REFERENCE> | pass/fail |
| Restore | Restore is verified against isolated target | <OBSERVED> | <REFERENCE> | pass/fail |
| Probe cleanup | Unique compatibility record is absent | <OBSERVED> | <REFERENCE> | pass/fail |

- Security boundary accepted by owner: yes/no — <LINK>
- Compatibility decision: select Serverless SQL | select Managed PostgreSQL | repeat after repair
- Decision reason: <CONCISE_EVIDENCE_BASED_REASON>
- Actual experiment cost: <EUR_BEFORE_TAX>
- Credentials revoked at: <UTC_TIMESTAMP>
- Database deletion observed at: <UTC_TIMESTAMP>
- Post-cleanup billing checked at: <UTC_TIMESTAMP_AND_RESULT>
- Cleanup owner sign-off: <OWNER_AND_LINK>
```

Stop and clean up immediately when the €2 estimate is exceeded, credentials or
output leak, the target cannot be proven temporary, the probe would touch
unrelated data, or deletion cannot be completed by the deadline.

## Production resource inventory

```md
### Production resource inventory

| Resource | Private evidence reference | Region | Created/selected at | Owner | Monthly estimate | Delete/retain rule |
| --- | --- | --- | --- | --- | ---: | --- |
| Existing website bucket (protected) | <REFERENCE> | fr-par | existing | <OWNER> | excluded | never touched by backend |
| Containers namespace | <REFERENCE> | fr-par | <UTC> | <OWNER> | <EUR> | owner-gated deletion only |
| Private Registry namespace | <REFERENCE> | fr-par | <UTC> | <OWNER> | <EUR> | retain approved digests |
| Serverless Container | <REFERENCE> | fr-par | <UTC> | <OWNER> | <EUR> | roll back image before delete |
| Private project bucket | <REFERENCE> | fr-par | <UTC> | <OWNER> | <EUR> | production data; never broad cleanup |
| Selected database | <REFERENCE> | fr-par | <UTC> | <OWNER> | <EUR> | backup/export gate before delete |
| Private Network, if fallback | <REFERENCE> | fr-par | <UTC> | <OWNER> | <EUR> | retain while DB/container attached |
| Custom API domain | <REFERENCE> | fr-par | <UTC> | <OWNER> | <EUR> | DNS rollback first |
| Cockpit settings/rules | <REFERENCE> | fr-par | <UTC> | <OWNER> | <EUR> | review monthly |

- Live console total estimate: <EUR_BEFORE_TAX>
- Pricing source access date: <UTC_DATE>
- €20 review trigger owner: <OWNER>
- Owner resource/cost approval: <LINK>
```

After creation, compare the live inventory with the approved table. Stop on
any extra, replaced, differently sized, or differently located resource.

## Identity and secret inventory

```md
### Identity and secret inventory

| Principal | Policy version/checksum | Credential reference | Created | Expires/rotates | Last verified | Revocation owner |
| --- | --- | --- | --- | --- | --- | --- |
| Deployment | <REFERENCE> | <SECRET_NAME_AND_VERSION_ONLY> | <UTC> | <UTC> | <UTC> | <OWNER> |
| Migration | <REFERENCE> | <SECRET_NAME_AND_VERSION_ONLY> | <UTC> | <UTC> | <UTC> | <OWNER> |
| Runtime | <REFERENCE> | <SECRET_NAME_AND_VERSION_ONLY> | <UTC> | <UTC> | <UTC> | <OWNER> |
| DNS | <REFERENCE> | <SECRET_NAME_AND_VERSION_ONLY> | <UTC> | <UTC> | <UTC> | <OWNER> |

Positive checks:
- [ ] Deployment identity can read the approved registry namespace and container.
- [ ] Migration role can connect to the selected database and inspect migration state.
- [ ] Runtime role can perform only the approved private-bucket operations.

Negative checks:
- [ ] Runtime identity cannot mutate containers, registry, IAM, or database schema.
- [ ] Runtime storage identity cannot read, write, list, or delete in `pixel-forge.app`.
- [ ] Deployment identity cannot read runtime or migration secret values.
- [ ] Migration identity cannot access Object Storage or deploy containers.
- [ ] DNS token cannot edit another zone or account setting.

- Redacted test evidence: <REFERENCE>
- Owner identity/secret approval: <LINK>
```

Revoke the affected credential and stop when any negative check unexpectedly
succeeds.

## Image publication

```md
### Image publication evidence

- Approval: <LINK>
- Source commit: <FULL_GIT_SHA>
- Clean checkout evidence: <REFERENCE>
- CI run: <LINK>
- Target platform: linux/amd64
- Dockerfile/base digest: <REFERENCE>
- Build command: <REDACTED_COMMAND>
- Container smoke result: <REFERENCE>
- Vulnerability/dependency result: <REFERENCE>
- Image uncompressed size: <SIZE>
- Registry tag: <FULL_GIT_SHA>
- Registry digest: <SHA256_DIGEST_REFERENCE>
- Registry visibility: private
- Publication time: <UTC_TIMESTAMP>
- Retention decision: <DIGESTS_TO_KEEP_AND_DELETE>
- Owner publication approval/sign-off: <LINK>
```

Fail when the source tree is dirty, the tag is mutable, the digest is missing,
the target is not `linux/amd64`, or the published digest cannot be tied to the
approved source and checks.

## Production migration

```md
### Production migration evidence

- Approval: <LINK>
- Selected database evidence reference: <REFERENCE>
- Production target positive identification: <REFERENCE>
- Source commit: <FULL_GIT_SHA>
- Migration files/checksum: <REFERENCE>
- Current schema/migration state: <REFERENCE>
- Reviewed SQL: <LINK_OR_PRIVATE_REFERENCE>
- Backward-compatible with last-known-good image: yes/no — <EVIDENCE>
- Backup/export created at: <UTC_TIMESTAMP>
- Restore proof: <REFERENCE>
- Exact redacted command: <COMMAND_WITH_SECRET_NAMES_ONLY>
- Started at: <UTC_TIMESTAMP>
- Finished at: <UTC_TIMESTAMP>
- Structured migration result: <REFERENCE>
- Resulting schema/migration state: <REFERENCE>
- Decision: promote | stop | roll forward | restore
- Owner migration sign-off: <LINK>
```

Do not run this template until the repository has approved production-safe
migration tooling. Never set `DATABASE_SAFETY_CONFIRM=non-production` for a
production URL and never run migrations during application startup.

## Deployment and liveness

```md
### Deployment evidence

- Approval: <LINK>
- Container evidence reference: <REFERENCE>
- Previous image digest: <LAST_KNOWN_GOOD_DIGEST_REFERENCE>
- Proposed image digest: <APPROVED_DIGEST_REFERENCE>
- Source commit/build revision: <FULL_GIT_SHA>
- Secret names and versions: <NAMES_AND_VERSIONS_ONLY>
- Container settings snapshot: <PRIVATE_REFERENCE>
- Cost estimate immediately before deploy: <EUR_BEFORE_TAX>
- Deployment started: <UTC_TIMESTAMP>
- Deployment ready: <UTC_TIMESTAMP>
- Provider rollout result: <REFERENCE>

Public liveness:
- URL: https://<PUBLIC_ENDPOINT>/api/health
- HTTP status: <STATUS>
- Service/status/version fields: <REDACTED_RESULT>
- Build revision equals approved SHA: yes/no
- Topology/credential leakage check: pass/fail
- Evidence: <REFERENCE>

- Deployment decision: promote to DNS | stop | rollback
- Owner deployment sign-off: <LINK>
```

Public liveness must never be reported as dependency readiness.

## Gated database and storage readiness

```md
### Dependency readiness evidence

- Approval: <LINK>
- Operator authentication path: <SECRET_NAMES_ONLY>
- Container image digest: <REFERENCE>
- Database target reference: <PRIVATE_REFERENCE>
- Storage target reference: <PRIVATE_REFERENCE>
- Database readiness event: database.ready | database.not_ready
- Storage readiness event: storage.ready | storage.not_ready
- No raw target/credential/error in output: pass/fail
- Database pool bound observed: <COUNT>
- Project bucket positive check: pass/fail
- Website bucket negative check: pass/fail
- Redacted evidence: <REFERENCE>
- Checked at: <UTC_TIMESTAMP>
- Owner readiness sign-off: <LINK>
```

Run readiness on demand after deployment and during diagnosis. Do not attach it
to frequent public polling that keeps scale-to-zero services awake.

## DNS and CORS

```md
### DNS and CORS evidence

- Approval: <LINK>
- Existing API record snapshot: <REFERENCE_OR_ABSENT>
- Scaleway custom-domain result: <PRIVATE_REFERENCE>
- Proposed Cloudflare record type/name/target: <REDACTED_REFERENCE>
- Proxy mode and reason: <VALUE_AND_REASON>
- TTL: <VALUE>
- Previous record for rollback: <REFERENCE>
- Change time: <UTC_TIMESTAMP>
- Resolver observations: <REFERENCE>
- TLS certificate/hostname validation: pass/fail — <REFERENCE>
- `GET /api/health` through `api.pixel-forge.app`: pass/fail
- CORS allows exactly `https://pixel-forge.app`: pass/fail
- CORS rejects `<UNAPPROVED_TEST_ORIGIN>`: pass/fail
- Existing apex/static records unchanged: pass/fail
- Owner DNS sign-off: <LINK>
```

## Rollback rehearsal

```md
### Rollback rehearsal evidence

- Approval: <LINK>
- Trigger simulated: <TRIGGER>
- Current digest: <REFERENCE>
- Last-known-good digest: <REFERENCE>
- Database contract compatible with old image: yes/no — <EVIDENCE>
- DNS rollback record: <REFERENCE>
- Rollback command with placeholders/redaction: <REFERENCE>
- Started at: <UTC_TIMESTAMP>
- Provider rollout result: <REFERENCE>
- Public liveness after rollback: pass/fail
- Gated readiness after rollback: pass/fail
- CORS after rollback: pass/fail
- Log/error review: pass/fail
- Time to recovery: <DURATION>
- Return-to-current decision: <DECISION_AND_APPROVAL>
- Owner rollback sign-off: <LINK>
```

A failed compatibility check between the old image and current schema blocks
image rollback. Use the approved migration recovery path instead.

## Cleanup

```md
### Cleanup evidence

- Approval: <LINK>
- Reason: <TEMPORARY_EXPIRY_OR_APPROVED_DECOMMISSION>
- Exact resource IDs: <PRIVATE_REFERENCE>
- Dependency/inventory check: <REFERENCE>
- Data classification: disposable | backed-up | production-retained
- Backup/export and restore evidence: <REFERENCE_OR_NOT_APPLICABLE>
- Expected irreversible loss: <DESCRIPTION>
- Credentials to revoke: <SECRET_NAMES_ONLY>
- DNS to restore first: <REFERENCE_OR_NOT_APPLICABLE>
- Cleanup command with placeholders/redaction: <REFERENCE>
- Started at: <UTC_TIMESTAMP>
- Finished at: <UTC_TIMESTAMP>
- Resource absence observed: <REFERENCE>
- Credential revocation observed: <REFERENCE>
- Post-cleanup billing checked: <UTC_TIMESTAMP_AND_RESULT>
- Residual resources/cost: <NONE_OR_LIST>
- Owner cleanup sign-off: <LINK>
```

Never infer a cleanup target from a name fragment, broad prefix, shell glob, or
default CLI project. Never delete the website bucket, production project data,
an unexported database, or a Containers namespace as ordinary rollback.

## Final owner closeout

```md
### #264 owner closeout

- Database selected: Serverless SQL | Managed PostgreSQL
- Database/network-boundary approval: <LINK>
- Resource and recurring-cost approval: <LINK>
- Identity and credential approval: <LINK>
- Production migration approval/result: <LINK>
- First deployment approval/result: <LINK>
- DNS approval/result: <LINK>
- Rollback rehearsal result: <LINK>
- Cleanup result for temporary resources: <LINK>
- Current monthly forecast before tax: <EUR_AND_DATE>
- Actual cost observed to date: <EUR_AND_DATE>
- Public liveness: pass/fail — <REFERENCE>
- Gated database readiness: pass/fail — <REFERENCE>
- Gated storage readiness: pass/fail — <REFERENCE>
- Runtime denied access to website bucket: pass/fail — <REFERENCE>
- Remaining risks: <LIST>
- Next review date: <UTC_DATE>
- Owner decision: accept walking skeleton | repair | roll back | decommission
- Owner sign-off: <OWNER_AND_UTC_TIMESTAMP>
```
