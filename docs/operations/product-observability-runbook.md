# Product observability runbook

Status: prepared, not deployed

This runbook enables, verifies, queries, and rolls back Pixel Forge activation
analytics. The committed configuration creates no Cloudflare resource until an
owner deliberately deploys it.

## Runtime contract

- Route: `POST https://pixel-forge.app/api/telemetry`
- Worker: `pixel-forge-telemetry`
- Dataset: `pixel_forge_product_events`
- Browser credentials: omitted
- Browser timeout: 2 seconds, with no retry or offline queue
- Body limit: 512 bytes
- Rate limit: one identifier-free, shared `product-events` key, nominally 60
  requests per 60 seconds per Cloudflare location
- Retention: Cloudflare's fixed three months
- Persisted Worker logs and traces: disabled
- Worker invocation logs: disabled

The rate limiter is deliberately not keyed by IP address, user, session,
account, device, or geography. Cloudflare documents its Rate Limiting API as
permissive and eventually consistent, so this limit bounds ordinary abuse but
is not exact billing protection.

Accepted rows contain:

| Column   | Meaning |
| -------- | ------- |
| `index1` | approved event name |
| `blob1`  | optional approved dimension name, otherwise empty |
| `blob2`  | optional approved dimension value, otherwise empty |
| `timestamp` | time supplied by Cloudflare |

A schema-invalid request can write only `telemetry_request_rejected` plus the
fixed `invalid_payload` reason. It never writes submitted content. Requests
rejected before schema validation and rate-limited requests write no row.

## Owner prerequisites

Complete all of these before the first deployment:

1. Publish and approve `https://pixel-forge.app/privacy.html`.
2. In Cloudflare Email Routing, add the private destination address, complete
   its verification email, and route `privacy@pixel-forge.app` to it. Do not
   commit or paste the private destination into GitHub.
3. Send a test message to the privacy alias from a different account and verify
   that it arrives.
4. Create a GitHub environment named `telemetry-production`. Add a required
   reviewer if the repository plan supports environment protection.
5. Create a **Custom token** rather than using the broad **Edit Cloudflare
   Workers** template. Grant exactly these three permission rows:
   - **Account → Workers Scripts → Write**;
   - **Zone → Workers Routes → Write**;
   - **Zone → Zone → Read**.
   Restrict **Account Resources** to the one account that owns Pixel Forge. For
   both zone permission rows, restrict **Zone Resources** to the single
   `pixel-forge.app` zone. Do not select all accounts or all zones.

   Wrangler reads the committed `zone_name` in
   `workers/telemetry/wrangler.jsonc`, calls Cloudflare's `GET /zones` endpoint
   to resolve it to a zone ID, and then publishes the route. **Zone → Zone →
   Read** is required only for that name lookup; it does not authorize DNS
   changes. Do not add Account Settings, User Details, Memberships, KV, R2,
   Tail, Logs, DNS Read, DNS Write, or any other permission. Cloudflare's
   template currently includes several unrelated grants and is not acceptable
   unchanged. See Cloudflare's [API token permission
   definitions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/),
   [`GET /zones` permission
   requirement](https://developers.cloudflare.com/api/resources/zones/methods/list/),
   and [Worker route publication
   permission](https://developers.cloudflare.com/api/resources/workers/subresources/routes/methods/create/).
6. Store the account ID as `CLOUDFLARE_ACCOUNT_ID` and the deployment token as
   `CLOUDFLARE_API_TOKEN` in the `telemetry-production` GitHub environment.
   Never expose either value to the browser or repository.
7. Separately create an owner query token with only **Account → Account
   Analytics → Read**, restricted to the same account. Keep it in a password
   manager; do not store it in GitHub unless a later approved report job needs
   it.

Cloudflare creates the Analytics Engine dataset automatically on the first
write. No database migration or manual dataset creation is required.

## First deployment

The repository workflow is manual-only:

1. Open GitHub Actions → **Deploy telemetry Worker** → **Run workflow**.
2. Select the reviewed commit and check the production confirmation.
3. Approve the `telemetry-production` environment deployment when prompted.
4. Confirm the action ran shared checks, Worker type generation, Worker tests,
   and `wrangler deploy --strict` successfully.
5. Confirm Cloudflare shows the `pixel-forge-telemetry` Worker and the exact
   `pixel-forge.app/api/telemetry` route.

No push, merge, or application deployment automatically deploys this Worker.

## Preserve the no-log default

Cloudflare enables persisted observability by default for newly created
Workers. Pixel Forge overrides that default in `workers/telemetry/wrangler.jsonc`:

```json
{
  "observability": {
    "enabled": false,
    "logs": {
      "enabled": false,
      "invocation_logs": false,
      "persist": false
    },
    "traces": {
      "enabled": false,
      "persist": false
    }
  }
}
```

Keep this block on every environment and deployment. Do not enable Workers
Logs or traces in the dashboard, add an observability destination, attach a
Tail Worker, or enable Workers Logpush without reopening the privacy boundary.
Before deployment, validate the committed source of truth without publishing:

```sh
npx wrangler deploy --dry-run --strict \
  --config workers/telemetry/wrangler.jsonc
```

Routine failure evidence remains the bounded HTTP response, the fixed
Analytics Engine rejection marker, GitHub deployment history, and the owner
report. Real-time tailing can expose request metadata to the active viewer even
when it is not persisted, so use it only for an explicitly approved live
incident and stop it immediately afterward.

## Verify ingestion

Send one contract-safe request from a terminal:

```sh
curl --include --request POST https://pixel-forge.app/api/telemetry \
  --header 'Origin: https://pixel-forge.app' \
  --header 'Content-Type: application/json' \
  --data '{"name":"editor_loaded","dimensions":{"entryPoint":"direct"}}'
```

Expected result: HTTP `202` with the bounded body `Accepted`.

Then send a privacy-invalid request and expect HTTP `400`:

```sh
curl --include --request POST https://pixel-forge.app/api/telemetry \
  --header 'Origin: https://pixel-forge.app' \
  --header 'Content-Type: application/json' \
  --data '{"name":"project_created","dimensions":{"source":"blank","filename":"must-not-pass.pf"}}'
```

The submitted filename must not appear in Analytics Engine. Only the fixed
rejection marker may be written.

## Run the owner report

Set the read-only token only in the current shell or a secure local secret
manager:

```sh
export CLOUDFLARE_ACCOUNT_ID='<account id>'
export CLOUDFLARE_ANALYTICS_API_TOKEN='<Account Analytics Read token>'
npm run telemetry:report
```

The command makes three SQL API queries: 24 hours, 7 days, and 30 days. It uses
`SUM(_sample_interval)` so counts remain sampling-aware. Ratios divide event
counts by `editor_loaded` counts. They are directional event-count ratios, not
unique-user, returning-user, session, or cohort conversions.

## Failure observation

| Boundary | Evidence | Expected response |
| -------- | -------- | ----------------- |
| Browser validation | development inspector | rejected events do not appear |
| Browser delivery | browser network panel | failure is silent to editor behavior; no retry |
| Worker validation | bounded HTTP status/body | `400`, `403`, `405`, `413`, `415`, or `429` |
| Accepted ingestion | product event row and HTTP `202` | report count eventually increases |
| Privacy-invalid schema | fixed rejection row and HTTP `400` | no submitted field is stored |
| Deployment | GitHub environment/action and Cloudflare deployment history | exact commit and Worker version are visible |
| Query | local report exit status | errors include HTTP status, never token or provider body |

## Rollback and disablement

For a bad Worker version, authenticate locally with the deployment credential
and roll back to the previous deployed version:

```sh
npx wrangler rollback \
  --config workers/telemetry/wrangler.jsonc \
  --message 'Rollback telemetry Worker'
```

Cloudflare documents rollback as an immediate new deployment. Verify the route
again with the safe request above.

If the first deployment has no prior version, disable the Worker route in the
Cloudflare dashboard and deploy an application build with the telemetry client
returned to a no-op before re-enabling it. Do not delete the Worker or dataset
during incident response. Existing rows expire after three months; removing
the route stops new writes but does not erase retained rows.

## Quota and cost watch

As documented on 22 July 2026, Cloudflare lists these Analytics Engine Free
plan allowances:

- 100,000 data points written per day;
- 10,000 SQL queries per day;
- no active Analytics Engine billing yet, with future pricing published;
- one `writeDataPoint` call per accepted or schema-invalid request;
- three months of fixed retention.

Recheck the current Cloudflare pages before first deployment and periodically
afterward:

- <https://developers.cloudflare.com/analytics/analytics-engine/pricing/>
- <https://developers.cloudflare.com/analytics/analytics-engine/limits/>
- <https://developers.cloudflare.com/analytics/analytics-engine/sampling/>
- <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>
- <https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/>
- <https://developers.cloudflare.com/workers/wrangler/configuration/#observability>
- <https://developers.cloudflare.com/workers/observability/logs/workers-logs/>
- <https://developers.cloudflare.com/fundamentals/api/reference/permissions/>
- <https://developers.cloudflare.com/api/resources/zones/methods/list/>
- <https://developers.cloudflare.com/api/resources/workers/subresources/routes/methods/create/>
- <https://developers.cloudflare.com/email-service/get-started/route-emails/>
