# Pixel-Forge Codebase Audit

*Date: 2026-07-06 — audited at commit `9d8d618`*

## 1. Snapshot

- ~45,000 lines of TypeScript across 198 source files.
- Stack: Lit 3 + `@lit-labs/signals`, Vite 7, Vitest 4, `idb` (IndexedDB), `pako`, no framework beyond web components.
- Architecture: singleton stores (signals) → command pattern for undo/redo → tools (pointer state machines) → canvas rendering with dirty-rect tracking and a rAF render scheduler.
- Health check: `tsc --noEmit` passes clean, all 88 tests pass (5 test files).

### What is genuinely good

These are worth preserving through any refactor:

- **Strict TypeScript** (`strict`, `noUnusedLocals`, `verbatimModuleSyntax`) and a clean typecheck.
- **Command pattern** for undo/redo with memory budgeting (50 MB / 100 command caps), context stacks for isolated editing modes (brush editor), and — notably — `userId` stamping on every command. This was clearly designed with multi-user in mind and is a great foundation for sync/collaboration.
- **Rendering discipline**: dirty-rect store + `RenderScheduler` coalescing to animation frames, onion-skin cache, `OptimizedDrawingCommand` / `patch-command` for compact diffs.
- **Indexed-color architecture** (palette indices + per-cel index buffers) — the right model for a pixel editor and it also enables cheap diffing later.
- **Binary project format**: cels stored as PNG bytes rather than Base64 JSON, Aseprite import/export.

## 2. Complexity hotspots

Ranked by how much they will hurt as the codebase grows.

### 2.1 `src/stores/project.ts` — `loadProject()` is a migration engine in disguise

A ~250-line method that inline-handles every historical format (v1.x Base64, v2.0 binary, v2.1 text layers, v2.2 linked cels, v3.0 index buffers, v3.1 ephemeral palette, v3.2 continuous layers), while also directly driving `layerStore`, `animationStore`, `paletteStore`, and `viewportStore`, including a "delete all frames then delete the placeholder" dance and a `setTimeout(0)` to fix viewport timing.

**Fix**: extract a `serialization/` module with explicit per-version migrations (`migrateV1toV2(file)`, `migrateV2toV3(file)`, …) that normalize a `ProjectFile` to the current shape *before* any store is touched, then a single `hydrate(file)` step. This is also the #1 prerequisite for backend sync — the server will need to understand exactly one canonical schema.

### 2.2 Version constant drift (bug)

`PROJECT_VERSION` in `src/types/project.ts` is still `'3.0.0'`, but the format already includes v3.1 (`ephemeralPalette`) and v3.2 (`continuous`) fields. Files written today claim to be 3.0.0 while containing 3.2 data. Harmless while the loader is field-tolerant, but it will bite the moment a backend validates versions. Bump it and add a test asserting round-trip integrity.

### 2.3 `src/commands/selection-commands.ts` (942 lines)

Six command classes plus general-purpose pixel utilities (`findContentBounds`, `trimTransparentPixels`) in one file. **Fix**: one file per command (or per group: float/commit, delete/fill, transform/flip), move the pixel utilities to `utils/` where other code can reuse them.

### 2.4 Duplicated stroke machinery across tools

`pencil-tool.ts` (688 lines) and `eraser-tool.ts` (428) both independently implement: stroke snapshots (`getImageData` of the whole canvas per stroke), index-buffer setup (`ensureCelIndexBuffer` + `getOrAddColorForDrawing`), shift-click line chaining, axis locking, grid spacing, pixel-perfect point tracking. Fill/shape/gradient repeat parts of this. **Fix**: extract a `StrokeSession` (snapshot, index buffer, dirty rect, commit-to-command) that tools compose, leaving each tool with only its unique behavior.

### 2.5 `src/components/canvas/pf-drawing-canvas.ts` (892 lines)

The component owns tool instantiation and dispatch, document-level pointer tracking, text-tool special cases, and render orchestration — plus `private activeTool: any; // TODO: Type properly`. **Fix**: a typed `ToolController` owning tool lifecycle/dispatch; the component keeps only DOM/canvas concerns. Typing `activeTool: BaseTool` is a 10-minute win available today.

### 2.6 `src/services/keyboard/register-shortcuts.ts` (855 lines)

One giant imperative registration function. **Fix**: a declarative shortcut table (`{ combo, scope, command, when }[]`) consumed by a small dispatcher. Also makes the shortcuts dialog and future user-remappable keys nearly free.

### 2.7 Other large-file smells (lower priority)

`stores/selection/store.ts` (933 — state + hit-testing + transform math together), `stores/palette/store.ts` (850), `pf-context-bar.ts` (735 — per-tool option rendering could be data-driven from tool metadata), `pf-context-menu.ts` (713).

## 3. Architecture issues

### 3.1 Singleton store web with circular imports

Every store is a module-level singleton, and they import each other freely: `projectStore` ↔ `historyStore` is an outright cycle (`history.ts` imports `project.ts` and vice versa); `stores/layers` is imported by 35 files, `stores/animation` by 33, `stores/project` by 27. This works because usage is lazy, but it makes: unit testing painful (importing one store boots the whole graph), a second project instance impossible, and SSR/worker reuse impossible.

**Direction** (incremental, not a rewrite): introduce a composition root that constructs stores and passes dependencies explicitly (or an app-context object). Start by breaking the `history ↔ project` cycle: auto-save does not belong in `HistoryStore` — move it to a dedicated `AutoSaveService` that observes history.

### 3.2 Mixed reactivity model

Signals hold arrays/maps of **mutable** objects: `loadProject` mutates `layer.id`, `layer.visible` in place; cel maps are cloned sometimes and mutated other times; `historyStore.version` is a manual "poke the canvas" counter. This is the classic source of "view didn't update" bugs. **Direction**: pick one rule — either immutable snapshots in signals, or mutable stores with explicit invalidation — and document it. The `version` counter suggests you're already halfway to the explicit-invalidation model; formalize it.

### 3.3 Persistence: single slot, no abstraction seam

`PersistenceService` stores exactly one project under the key `'current-project'`. There's no project list, and callers use the concrete class directly. **Direction**: define a `ProjectRepository` interface (`list/load/save/delete/thumbnail`) with the IndexedDB implementation behind it. The future backend becomes a second implementation plus a sync coordinator, instead of a rewrite. This is the single most important structural change for the backend goal.

### 3.4 Undo history is snapshot-heavy

Commands frequently capture full-canvas `ImageData` (pencil snapshots the entire layer per stroke). The 50 MB cap keeps it from blowing up, but on large canvases history depth collapses. `patch-command.ts` / `OptimizedDrawingCommand` exist — finish migrating tools to patch-based commands. Bonus: patch-based commands are exactly the delta format a sync engine wants.

### 3.5 No lint/format tooling, CI doesn't run tests

There's no ESLint/Prettier config, and `deploy.yml` builds and deploys on push to main without running `vitest` or even relying on the `tsc` step to gate (it does run via `npm run build`, but tests never run in CI). Add a CI job: `tsc && vitest run` on PRs. Cheap and prevents regressions from landing.

### 3.6 Thin test coverage in the riskiest places

5 test files (88 tests) covering drawing algorithms, viewport math, and the eraser. Zero tests for: serialization/migrations, history/undo semantics, palette/index-buffer invariants, selection commands. These are precisely the areas a backend/sync effort will churn. Write round-trip tests (`saveProject → loadProject → deep-equal`) before touching serialization.

### 3.7 Miscellaneous

- Sentry is loaded from a third-party CDN `<script>` in `index.html` — blocked by ad-blockers, no SRI hash, and errors from module code may miss it. Prefer the npm SDK bundled with the app.
- `package.json` name is `"chrono-sun"`, version `0.0.0` — rename to `pixel-forge` and start versioning.
- 41 `console.*` calls in `src/` — fine for now, but a tiny `log` util with levels would let you wire them to Sentry breadcrumbs.
- 13 files use `setTimeout` for sequencing (e.g. `resetView` after load) — each one is a latent race; prefer `updateComplete`/explicit lifecycle hooks.
- `ProjectFile.data: string | Uint8Array` plus the `Record<string, number>` JSON-mangled case handled in `hasImageData` — the migration layer (2.1) should normalize this once at load so the rest of the code sees only `Uint8Array`.

## 4. Backend readiness assessment

The long-term goal (accounts + paid sync) is well-served by things already in place:

| Already in place | Still needed |
|---|---|
| Serializable `ProjectFile` with binary cels | Canonical, versioned schema + migration pipeline (§2.1, §2.2) |
| `userStore` stub + `userId` on every command | Real auth (the stub shows the seam already exists) |
| IndexedDB behind one service class | `ProjectRepository` interface + multi-project storage (§3.3) |
| Dirty-rect + patch commands | Cel-level content hashing for delta sync |
| Static S3 deploy | An actual backend (API + DB + object storage) |

**Suggested sync architecture** (when you get there): keep the client local-first. Store projects locally keyed by `projectId`; sync per-cel PNG blobs content-addressed by hash (the indexed-color buffers make cels small), with a `project.json` manifest. Last-write-wins per cel is fine for single-user multi-device; the command log (already user-stamped) is your upgrade path to real collaboration later. A boring stack works: Postgres (accounts, project metadata, entitlements) + S3-compatible storage (you're already on Scaleway) + Stripe webhooks updating an `entitlements` table checked at sync time.

## 5. Recommended next features (5–10)

Ordered so each step de-risks the next; items 1–3 are "pre-backend" hardening that pays off immediately even if the backend slips.

1. **Project library (local multi-project)** — new/open/duplicate/rename/delete with thumbnails, stored in the existing IndexedDB `sprites` store keyed by id (it already has a keyPath ready for this). This forces the `ProjectRepository` interface and project-identity model that cloud sync needs, and is a big UX win on its own.
2. **Serialization overhaul: versioned schema + migration pipeline + round-trip tests** — extract save/load from `projectStore`, bump `PROJECT_VERSION`, normalize legacy formats at the boundary. Prerequisite for any server-side validation.
3. **CI + guardrails** — GitHub Actions job running `tsc` + `vitest run` on PRs, ESLint/Prettier, and tests for history and palette invariants. Cheap insurance before the bigger refactors.
4. **Accounts + cloud sync MVP (the backend)** — email/OAuth login, sync the project library (whole-project blobs first, last-write-wins), conflict = "keep both". Client stays local-first; sync is a background reconciler behind the repository interface from step 1.
5. **Subscription billing** — Stripe Checkout + customer portal + webhook → `entitlements` table. Free tier: e.g. 3 synced projects / 1 device; paid: unlimited projects, version history, priority features. Gate at the sync API, never in client-only code.
6. **Delta sync + cloud version history** — upgrade sync to content-addressed per-cel blobs (hash index buffers); keep N historical manifests per project. "Version history" is a compelling paid-tier feature and nearly free once blobs are content-addressed.
7. **Shareable read-only links** — publish a sprite/animation to a public URL (rendered GIF/WebP/PNG + embedded viewer). Growth loop for the product and a low-risk first "public" backend surface.
8. **PWA / installability** — offline service worker, install prompt, file-handler registration for `.aseprite`/`.pixelforge`. Reinforces the local-first story and desktop-app feel.
9. **Cross-device asset sync (palettes & brushes)** — tiny payloads, ideal first real-world test of the sync engine before project sync ships broadly; `brush-persistence.ts`/`palette-persistence.ts` already isolate the data.
10. **Real-time collaboration (later, paid tier)** — the command pattern with `userId` stamping and per-user undo was clearly built for this. Server-authoritative command log first; CRDTs only if free-form concurrent editing demands it.

## 6. Suggested order of operations

```
Hardening   : (3) CI/lint → (2) serialization + tests → break history↔project cycle
Product     : (1) project library → (8) PWA
Backend     : (4) accounts + sync MVP → (5) billing → (9) asset sync
Growth/paid : (7) share links → (6) delta sync + history → (10) collab
```

Refactors from §2 (stroke engine, selection-commands split, shortcut table, tool controller) can be done opportunistically whenever you touch those areas — none of them block the roadmap, but each one you do makes the next feature in that area cheaper.
