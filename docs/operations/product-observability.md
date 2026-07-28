# Product observability boundary

Status: production implementation approved; first deployment remains owner-gated

This document defines how Pixel Forge decides whether a feature needs
observability and what the client may record. Production builds deliver the
approved events to the same-origin `/api/telemetry` route. Development and
tests keep events in memory and make no production telemetry request. The
first production Worker deployment remains an explicit owner action documented
in [`product-observability-runbook.md`](./product-observability-runbook.md).

## Feature decision

Every delivery slice must choose one of these outcomes in its issue or pull
request:

| Decision               | Use when                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| `none`                 | No useful signal is needed; include one sentence explaining why.     |
| `product milestone`    | A coarse user outcome helps evaluate whether the feature creates value. |
| `client failure`       | A browser failure would otherwise be invisible and hard to reproduce. |
| `operational boundary` | Work crosses HTTP, storage, queues, processes, or another runtime seam. |

The decision is about evidence, not volume. Do not add telemetry merely
because a feature has code paths available to instrument. A feature can need
operational evidence without needing a product event, and `none` is a valid
decision.

For any decision other than `none`, document:

- the question or failure the signal answers;
- the trigger and observation point;
- the exact allowlisted fields;
- where the signal is visible and who may access it;
- failure behavior and why it cannot block the product;
- retention and deletion expectations;
- whether the privacy or consent gate must be reopened.

## Product-event taxonomy

Product events are coarse milestones, not interaction logs. The client
contract permits only these events and dimensions:

| Event                    | Allowed dimensions                                             |
| ------------------------ | -------------------------------------------------------------- |
| `editor_loaded`          | `entryPoint`: `direct` or `file_handler`                       |
| `project_created`        | `source`: `blank`, `import`, or `guided_drawing`               |
| `project_opened`         | `source`: `library`, `file`, or `session_restore`              |
| `first_drawing_action`   | `tool`: `pencil`, `eraser`, `fill`, `shape`, or `other`        |
| `second_frame_created`   | none                                                           |
| `playback_started`       | none                                                           |
| `project_saved`          | `destination`: `local_library` or `download`                   |
| `export_completed`       | `format`: `png`, `gif`, `webp`, `aseprite`, or `pixel_forge`   |
| `tutorial_started`       | none                                                           |
| `tutorial_completed`     | none                                                           |
| `tutorial_skipped`       | none                                                           |

Adding an event or dimension changes this privacy contract. It requires an
explicit issue decision, contract tests, and documentation before a call site
may emit it.

## Data that must not enter product events

The product-event contract must not carry:

- artwork, project bytes, project names, or filenames;
- palettes, color values, or imported-image metadata;
- free-form text, pointer streams, or exact interaction histories;
- raw error messages, stack traces, or arbitrary logger fields;
- authentication tokens or other credentials;
- IP addresses, geography, user IDs, or account IDs;
- persistent anonymous or session identifiers;
- device fingerprints or cross-device/account linkage.

Unknown events, unknown dimensions, and extra fields are rejected. Call sites
must pass the closed event type; a generic property bag is not an accepted
substitute.

## Current collection and retention

Production delivery is identifier-free and best-effort. Each event name is
attempted at most once during a page lifecycle. The client revalidates the
event, sends it with omitted credentials and a bounded timeout, and does not
retry or queue it. It writes no cookie, `localStorage`, IndexedDB, user ID,
session ID, or fingerprint. Delivery failures are discarded and cannot block
editor behavior.

The Worker validates method, path, exact production origin, JSON content type,
body size, global coarse rate limit, and the closed event schema. The Analytics
Engine row uses `index1` for the event name, `blob1` for the optional dimension
name, and `blob2` for its value. Cloudflare supplies the row timestamp. A
privacy-invalid event may write only the fixed operational marker
`telemetry_request_rejected` with the fixed reason `invalid_payload`; it cannot
write submitted fields. Rate-limited and early boundary rejections write no
row.

Cloudflare Workers observability is explicitly disabled in the committed
configuration. Persisted logs and traces are off, and invocation logs are off,
so request, response, header, and invocation metadata are not copied into
Workers Logs outside the approved Analytics Engine rows. These settings must
remain explicit because Cloudflare enables persisted observability by default
for newly created Workers.

Workers Analytics Engine retains rows for Cloudflare's fixed three-month
period. Pixel Forge has no per-row deletion workflow or identity with which to
find a person's row; rows expire automatically.

Development inspection is local. The bounded in-memory sink keeps only the
latest 100 allowlisted events. Developers can use
`window.pixelForgeTelemetry.list()` and `.clear()`. Snapshots are immutable,
reload clears them, and they are not logged, persisted, or passed to Sentry.

Telemetry is best-effort. Rejected payloads and sink failures cannot block
drawing, saving, exporting, or offline use.

## Production enablement gate

The implementation does not authorize its own first deployment. Before
enabling collection, the owner must approve and verify:

- the user-facing privacy notice and the applicable lawful-basis assessment;
- the fixed three-month retention and automatic-expiry limitation;
- the people and service identities allowed to read or administer the data;
- processor and data-location documentation;
- the global identifier-free rate limit, query limits, cost bounds, and failure
  visibility;
- the exact request metadata the provider receives even when it is not in the
  event payload;
- whether an opt-out or consent control is required.

The approved implementation uses no cookies or terminal storage and therefore
does not add a consent banner. The consent decision must be reopened before
introducing persistent identifiers, cookies or other terminal storage,
fingerprinting, cross-device/account linkage, session replay, advertising, or
non-exempt third-party analytics.

This is a product and engineering constraint, not a legal compliance
guarantee. Banner-free collection does not remove privacy-notice, data
minimization, access, retention, or processor obligations.

## Adjacent systems

Pixel Forge already has a separate Sentry error-reporting integration. This
foundation neither sends product events to Sentry nor changes that service.
Client-failure privacy and retention require their own later #401 slice.

Backend structured logs and service health evidence are operational telemetry,
not product analytics. They should use stable boundary event names and avoid
creative content, but they do not share this client product-event sink.
