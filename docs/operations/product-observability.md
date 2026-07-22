# Product observability boundary

Status: approved foundation contract

This document defines how Pixel Forge decides whether a feature needs
observability and what the client may record. The current implementation has
no production event sink. It does not persist analytics state or send product
events over the network.

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

The production default is a no-op. It makes no network request, writes no
cookie, and uses no `localStorage`, IndexedDB, or other client persistence.
Its production retention is therefore zero.

Development inspection is explicit and local. Its sink writes allowlisted
events to the browser development console and does not persist them through
Pixel Forge. Console history and preservation are controlled by the developer
and browser, not by the application.

Telemetry is best-effort. Rejected payloads and sink failures cannot block
drawing, saving, exporting, or offline use.

## Production-sink approval gate

A production sink is a separate delivery slice and is not authorized by this
foundation. Before enabling one, the owner must approve and verify:

- the user-facing privacy notice and the applicable lawful-basis assessment;
- a finite, purpose-bound retention period and deletion path;
- the people and service identities allowed to read or administer the data;
- processor and data-location documentation;
- abuse controls, query limits, cost bounds, and failure visibility;
- the exact request metadata the provider receives even when it is not in the
  event payload;
- whether an opt-out or consent control is required.

The consent-banner decision must be reopened before introducing persistent
identifiers, cookies or other terminal storage, fingerprinting,
cross-device/account linkage, session replay, advertising, or non-exempt
third-party analytics.

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
