# Current change map

This map locates current implementation responsibility. It is an implementation
index, not an architectural freeze or a replacement for a live issue, governing
decision, or runtime guidance. Before editing a named responsibility, start at
the supported interface, inspect the callers and readers or writers, and confirm
the listed tests and runner still cover the intended behavior.

## Browser editor and automation

### Local-first editor state and project-scoped UI

- **Interface:** [`src/stores/project-context.ts`](../../src/stores/project-context.ts) — `ProjectContext`, `createProjectContext()`, `getActiveProjectContext()`, and `setActiveProjectContext()` — plus [`src/stores/workspace.ts`](../../src/stores/workspace.ts) for `WorkspaceItem` and workspace operations.
- **Callers:** [`src/components/app/pixel-forge-app.ts`](../../src/components/app/pixel-forge-app.ts), drawing and timeline surfaces under [`src/components/canvas/`](../../src/components/canvas/) and [`src/components/timeline/`](../../src/components/timeline/), and command/tool modules that receive a captured context.
- **Tests:** [`tests/services/active-context-actions.test.ts`](../../tests/services/active-context-actions.test.ts), [`tests/commands/context-capture.test.ts`](../../tests/commands/context-capture.test.ts), and [`tests/components/editor-chrome-active-context.test.ts`](../../tests/components/editor-chrome-active-context.test.ts), run by root happy-dom Vitest through `npm run test:run`.
- **Governing:** [`CONTEXT.md`](../../CONTEXT.md) defines Project Target, Project Working State, and View State; [`src/AGENTS.md`](../../src/AGENTS.md) keeps project behavior in `ProjectContext` and remote work optional.

### Editor Command API and Creative Run automation

- **Interface:** [`src/editor/automation-adapter.ts`](../../src/editor/automation-adapter.ts) exposes `AutomationAdapter` and `createAutomationAdapter()`; [`src/editor/catalog.ts`](../../src/editor/catalog.ts) owns `editorCatalog`; [`src/editor/automation-session.ts`](../../src/editor/automation-session.ts) owns session and grant interfaces; [`src/editor/creative-run.ts`](../../src/editor/creative-run.ts) exposes `CreativeRunController` and `createCreativeRun()`.
- **Callers:** [`src/editor/fixture-session.ts`](../../src/editor/fixture-session.ts), [`src/components/dialogs/pf-automation-session-dialog.ts`](../../src/components/dialogs/pf-automation-session-dialog.ts), [`src/components/preview/pf-creative-run-panel.ts`](../../src/components/preview/pf-creative-run-panel.ts), and [`src/components/app/pixel-forge-app.ts`](../../src/components/app/pixel-forge-app.ts).
- **Tests:** [`tests/editor/automation-adapter.test.ts`](../../tests/editor/automation-adapter.test.ts), [`tests/editor/automation-session.test.ts`](../../tests/editor/automation-session.test.ts), [`tests/editor/creative-run.test.ts`](../../tests/editor/creative-run.test.ts), and [`tests/editor/creative-run-controller-recovery.test.ts`](../../tests/editor/creative-run-controller-recovery.test.ts) run in root happy-dom Vitest. Browser-hosted coverage is a separate configuration: [`tests/browser/automation-adapter.test.ts`](../../tests/browser/automation-adapter.test.ts), [`tests/browser/creative-run-panel.test.ts`](../../tests/browser/creative-run-panel.test.ts), and `npm run test:browser`.
- **Governing:** [`CONTEXT.md`](../../CONTEXT.md) defines the Editor Command API, Editor Catalog, Editor Session, Automation Session, Capability Grant, and Automation Adapter; [`src/AGENTS.md`](../../src/AGENTS.md) requires captured project context. The accepted Agentic Preview contract is [#523](https://github.com/Flow-Fly/pixel-forge/issues/523); current proof is tracked in [#599](https://github.com/Flow-Fly/pixel-forge/issues/599) and [PR #600](https://github.com/Flow-Fly/pixel-forge/pull/600).

## Project data, rendering, and export

### Project persistence and local library

- **Interface:** [`src/services/persistence/project-repository.ts`](../../src/services/persistence/project-repository.ts) exposes `ProjectRepository`, `ProjectMeta`, and `WorkspaceState`; [`src/services/persistence/indexed-db.ts`](../../src/services/persistence/indexed-db.ts) provides the IndexedDB adapter; [`src/services/project-library.ts`](../../src/services/project-library.ts) provides `ProjectLibraryService`.
- **Callers:** [`src/stores/project-store.ts`](../../src/stores/project-store.ts), [`src/stores/workspace.ts`](../../src/stores/workspace.ts), [`src/services/auto-save.ts`](../../src/services/auto-save.ts), [`src/services/project-file-import.ts`](../../src/services/project-file-import.ts), and [`src/components/app/pf-project-browser.ts`](../../src/components/app/pf-project-browser.ts).
- **Tests:** [`tests/services/persistence/project-repository.test.ts`](../../tests/services/persistence/project-repository.test.ts), [`tests/services/project-library.test.ts`](../../tests/services/project-library.test.ts), and [`tests/services/auto-save.test.ts`](../../tests/services/auto-save.test.ts), run by root happy-dom Vitest through `npm run test:run`.
- **Governing:** [`CONTEXT.md`](../../CONTEXT.md) defines Local Project Library, Project Library Usage, Save Safety State, Local Recovery History, and Recovery Copy; [`src/AGENTS.md`](../../src/AGENTS.md) keeps local access and saving usable when remote features exist.

### Portable project-file contracts and migrations

- **Interface:** [`shared/src/project.ts`](../../shared/src/project.ts) owns `ProjectFile` and input types; [`shared/src/project-validation.ts`](../../shared/src/project-validation.ts) owns `decodeProjectFile()` and diagnostics; [`shared/src/project-data.ts`](../../shared/src/project-data.ts) normalizes bytes; [`shared/src/project-migrations.ts`](../../shared/src/project-migrations.ts) performs load migrations; [`shared/src/index.ts`](../../shared/src/index.ts) exports the contract.
- **Callers:** Browser serialization and load code under [`src/serialization/`](../../src/serialization/), the local repository, and the server's future untrusted-input boundary.
- **Tests:** [`tests/shared/project-contract.test.ts`](../../tests/shared/project-contract.test.ts) runs in root Vitest; [`shared/tests/node-import.mjs`](../../shared/tests/node-import.mjs) runs through the shared workspace's Node check. `npm run shared:check` is a separate workspace verification path; `npm run test:run` also runs root shared tests.
- **Governing:** [`CONTEXT.md`](../../CONTEXT.md) defines Project Revision and persisted project concepts; [`shared/AGENTS.md`](../../shared/AGENTS.md) requires deterministic, portable validation and versioned compatibility; [`specs/adr/0001-backend-walking-skeleton.md`](../../specs/adr/0001-backend-walking-skeleton.md) keeps shared contracts free of browser and server infrastructure.

### Canonical artwork composition, observation, rendering, and export

- **Interface:** [`src/services/export-composition.ts`](../../src/services/export-composition.ts) exposes `createArtworkCompositionPlan()`, `drawArtworkComposition()`, and `composeExportFrame()`; [`src/editor/observations.ts`](../../src/editor/observations.ts) exposes `observeProject()` and `renderProject()`; export adapters include [`src/services/aseprite-writer.ts`](../../src/services/aseprite-writer.ts).
- **Callers:** [`src/services/project-thumbnail.ts`](../../src/services/project-thumbnail.ts), [`src/stores/project-store.ts`](../../src/stores/project-store.ts), [`src/components/dialogs/pf-export-dialog.ts`](../../src/components/dialogs/pf-export-dialog.ts), and editor observation and asset-package paths.
- **Tests:** [`tests/services/artwork-composition.test.ts`](../../tests/services/artwork-composition.test.ts), [`tests/services/export-composition.test.ts`](../../tests/services/export-composition.test.ts), [`tests/editor/asset-package.test.ts`](../../tests/editor/asset-package.test.ts), and [`tests/services/reference-render-plan.test.ts`](../../tests/services/reference-render-plan.test.ts) run in root happy-dom Vitest through `npm run test:run`. Native Canvas proof uses the separate browser configuration in [`tests/browser/canonical-composition.test.ts`](../../tests/browser/canonical-composition.test.ts) and [`tests/browser/asset-package.test.ts`](../../tests/browser/asset-package.test.ts) through `npm run test:browser`.
- **Governing:** [`CONTEXT.md`](../../CONTEXT.md) defines Canonical Artwork Composition and Render Observation; [`docs/adr/0001-canonical-artwork-composition.md`](../../docs/adr/0001-canonical-artwork-composition.md) governs layer order, opacity, blend modes, and export agreement.

## Server, telemetry, and workflow

### Server process, database metadata, and private project-byte storage

- **Interface:** [`server/src/app.ts`](../../server/src/app.ts) exposes `createApp()`; [`server/src/server.ts`](../../server/src/server.ts) exposes `startServer()` and `RunningServer`; [`server/src/database/adapter.ts`](../../server/src/database/adapter.ts) exposes `DatabaseAdapter`; [`server/src/storage/blob-storage.ts`](../../server/src/storage/blob-storage.ts) exposes `BlobStorage`.
- **Callers:** [`server/src/index.ts`](../../server/src/index.ts), lifecycle and readiness commands under [`server/src/commands/`](../../server/src/commands/), and the database and S3 adapters.
- **Tests:** [`server/tests/app.test.ts`](../../server/tests/app.test.ts), [`server/tests/server.test.ts`](../../server/tests/server.test.ts), and [`server/tests/database-config.test.ts`](../../server/tests/database-config.test.ts) run through `npm run server:check`; database and storage integration suites use separate `npm run server:db:test` and `npm run server:storage:test` runners.
- **Governing:** [`server/AGENTS.md`](../../server/AGENTS.md) governs input, credentials, runtime, and storage safety; [`specs/adr/0001-backend-walking-skeleton.md`](../../specs/adr/0001-backend-walking-skeleton.md) keeps metadata in PostgreSQL, bytes behind a private storage port, and the browser local-first.

### Product telemetry client, shared event contract, Worker, and reporting

- **Interface:** [`src/services/telemetry.ts`](../../src/services/telemetry.ts) exposes `TelemetryClient`, sinks, and `productTelemetry`; [`shared/src/product-events.ts`](../../shared/src/product-events.ts) owns `ProductEvent`, `PRODUCT_EVENT_NAMES`, and `parseProductEvent()`; [`workers/telemetry/src/index.ts`](../../workers/telemetry/src/index.ts) exposes `handleTelemetryRequest()` and `writeProductEvent()`; [`scripts/telemetry-report.mjs`](../../scripts/telemetry-report.mjs) owns query and report functions.
- **Callers:** Editor services, commands, and UI record through `productTelemetry`; the Worker validates and writes to Analytics Engine; the report script reads the event-name contract to produce bounded reports.
- **Tests:** [`tests/services/telemetry.test.ts`](../../tests/services/telemetry.test.ts), [`tests/shared/product-events.test.ts`](../../tests/shared/product-events.test.ts), [`tests/workers/telemetry-worker.test.ts`](../../tests/workers/telemetry-worker.test.ts), and [`tests/scripts/telemetry-report.test.ts`](../../tests/scripts/telemetry-report.test.ts) all run under root `npm run test:run`; `npm run telemetry:test` reruns the Worker test with generated Wrangler types, and `npm run telemetry:typecheck` checks its separate Worker configuration.
- **Governing:** [`docs/operations/product-observability.md`](../operations/product-observability.md) owns the event and privacy contract; [`CONTEXT.md`](../../CONTEXT.md) defines Creative Content Grant and remote transport vocabulary; [`src/AGENTS.md`](../../src/AGENTS.md) keeps creative data out of ordinary telemetry.

### Engineering workflow and verification

- **Interface:** [`docs/operations/codex-agent-workflow.md`](../../docs/operations/codex-agent-workflow.md) is the canonical policy; [`AGENTS.md`](../../AGENTS.md), [`.agentic-loop.yml`](../../.agentic-loop.yml), and [`.codex/agents/`](../../.codex/agents/) provide entry, command, and role configuration.
- **Callers:** Workflow Director/Sol shapes and reconciles GitHub state; delivery-worker/Luna implements one approved delivery slice; pr-finalizer/Terra reviews the complete draft PR. GitHub issues, PRs, checks, and retained artifacts are the durable readers and writers.
- **Tests:** `.agentic-loop.yml` configures repository gates; focused Markdown/configuration checks validate links and profile parsing, while the application and workspace runners above prove product behavior. `npm run fallow:audit` must use the exact handed-off `FALLOW_AUDIT_BASE` and record its report scope.
- **Governing:** Root [`AGENTS.md`](../../AGENTS.md), [`docs/agents/issue-tracker.md`](../../docs/agents/issue-tracker.md), [`docs/agents/triage-labels.md`](../../docs/agents/triage-labels.md), and the live delivery issue govern readiness, task order, evidence, review, and the explicit human merge gate.

Browser, shared workspace, server integration, and telemetry Worker commands
may overlap files with the root runner while using different configuration or
setup. A passing root `npm run test:run` does not imply those other commands
and configurations ran.
