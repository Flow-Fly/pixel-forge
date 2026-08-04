# Pixel Forge current feature-contract evidence matrix

Research ticket: [#433](https://github.com/Flow-Fly/pixel-forge/issues/433)

Baseline: [`origin/develop` at `d737ac42`](https://github.com/Flow-Fly/pixel-forge/tree/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c)

Researched: 2026-08-04

## Executive result

Pixel Forge already has a broad browser editor: local projects and tabs, drawing and selection tools, pixel-art transforms, image/text/reference layers, indexed palettes, cel animation, semantic session history, Guided Drawing, PWA plumbing, Aseprite interchange, and several raster/project export paths.

The 1.0 base should be consolidated before adding another large feature family. Five confirmed contract defects can lose data or make exported output disagree with the editor:

1. canvas resize changes only the project dimensions;
2. the saved project schema omits layer lock, group hierarchy, and cel opacity;
3. raster composition omits blend mode and cel opacity;
4. several visible layer/tag mutations bypass history, and therefore also bypass autosave's only dirty trigger;
5. autosave failures remain dirty but are only logged.

The repository has substantial automated coverage, but it is Vitest/happy-dom coverage. It is not current proof of real canvas pixels, IndexedDB quota/failure behavior, PWA lifecycle, browser file handling, responsive layout, touch authoring, or keyboard/screen-reader operation. Missing evidence below means **unproven**, not failed.

## Evidence notation and method

- **A** — automated source-level, unit, structural, or component evidence exists.
- **L** — a dated owner browser playtest is recorded in GitHub.
- **M** — required live evidence was not found.
- **Partial** — a visible feature exists, but its exposed control, persistence, interchange, or verification contract is incomplete.
- **Block** — confirmed correctness, data-safety, recovery, export, accessibility, or responsive issue that should prevent 1.0.

The inventory traces the implementation, shared persisted contract, tests, verification documents, and live GitHub issue/PR comments. A passing component test is not upgraded to browser proof. The PWA checklist is a procedure, not a completed playtest record.

Verification on the exact baseline: `npm run test:run` passed 116 test files / 744 tests plus the shared Node import test. No Playwright, Cypress, or other real-browser E2E suite was found.

## Current feature-contract matrix

### Projects, files, persistence, and recovery

| Surface | Current user-visible contract | Persisted / exported contract | Evidence | 1.0 disposition |
| --- | --- | --- | --- | --- |
| New project | Named 1–2048 px canvas; presets from 16×16 through 256×256. | New UUID-backed local project with default DB32 palette. | **A**: [dimension contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/project-defaults.ts#L1-L30), `pf-new-project-dialog.test.ts`. **M** live. | Keep; live desktop and narrow-screen dialog proof missing. |
| Project library | Create, list with thumbnail/metadata, open, rename, delete, and restore the last workspace. | IndexedDB database `pixel-forge-db`; project records and settings/workspace records. | **A**: `project-repository.test.ts`, `project-library.test.ts`, `pf-project-browser.test.ts`. **L**: project-integrity playtest in [#337](https://github.com/Flow-Fly/pixel-forge/issues/337#issuecomment-5032500596). | Keep. Re-prove destructive deletion and reload on current head. |
| Project tabs | Up to eight open projects; active project isolation; close/restore; overflow imports can remain in the library. | Workspace item IDs/order/active item persist separately from project data. | **A**: [8-tab contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/workspace.ts#L22-L27), `workspace.test.ts`, `pf-project-tabs.test.ts`, `active-context-actions.test.ts`. **L**: isolation/save ordering in [#337](https://github.com/Flow-Fly/pixel-forge/issues/337#issuecomment-5032500596). | Keep; current-head reload/order proof still required. |
| Local autosave | History-backed edits save after 2 seconds and on blur/hidden; explicit save flush exists. | Serialized project plus thumbnail overwrites the latest local record; queued revisions prevent older writes winning. No checkpoints. | **A**: [dirty trigger and flush](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/auto-save.ts#L21-L59), `auto-save.test.ts`. **L**: save-ordering proof in [#337](https://github.com/Flow-Fly/pixel-forge/issues/337#issuecomment-5032500596). | **Block**: non-history mutations are not marked dirty; failures are log-only; quota/exhaustion recovery is unproved. |
| Import | File picker, drag/drop, launch queue and PWA file handling accept `.pf`, legacy `.json`, `.ase`, `.aseprite`; multiple files become projects/tabs subject to the limit. | Imported projects are normalized/migrated to current project data and saved locally; source file handles are not retained. | **A**: `project-file-handling.test.ts`, `project-file-import.test.ts`, `pwa-file-handling.test.ts`. **M**: [manual checklist](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/docs/verification/pwa.md#L40-L54) is not completed evidence. | Keep supported suffixes truthful; run real multi-file/browser launch matrix. No editable PNG/JPEG/WebP project import. |
| Export | Current/all/range export to PNG, WebP, animated WebP, horizontal/vertical/grid sprite sheet plus JSON, Aseprite, or Pixel Forge project. Optional scale/background and CRT view-effect export. | Raster paths flatten exportable artwork; `.pf` preserves the project subset described below; `.ase` is an RGBA subset. | **A**: [format registry](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/dialogs/pf-export-dialog.ts#L28-L35), `pf-export-dialog.test.ts`, `file-service.test.ts`, `aseprite-writer.test.ts`, view-effect tests. **M** visual round trip. | **Block** until preview/export parity and real-file round trips are proven. |
| Storage budget / recovery history | No product-level 50 MB project budget, usage meter, quota warning, checkpoint list, or cross-reload undo. | Browser quota is implicit. Only the latest project record persists. | Source review; history explicitly remains in memory. **M** all live quota/recovery proof. | Define a 1.0 local-storage contract and recovery UX before monetization limits. Do not paywall basic crash/data-loss recovery. |

### Drawing, colors, selection, and transforms

| Surface | Current user-visible contract | Persistence / output | Evidence | 1.0 disposition |
| --- | --- | --- | --- | --- |
| Pencil / eraser | Size 1–50, opacity, pixel-perfect strokes, spacing, constrained/continued strokes, palette lightness shortcuts; eraser and custom brush capture/editor. | Pixel RGBA and indexed palette buffer are stored per cel; strokes are commands. | **A**: [pencil options](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/tools/tool-registry.ts#L14-L75), drawing, stroke-session, pixel-perfect, eraser, command tests. **M** real pointer/canvas proof. | Keep; establish mouse, pen, and touch stroke fixtures. |
| Eyedropper / fill | Foreground/background sampling; flood fill; Guided Drawing region fill. UI advertises contiguous fill. | Result pixels/index buffer persist through command history. | **A**: fill/eyedropper tests. **Partial**: [implementation always flood-fills a connected region](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/tools/fill-tool.ts#L94-L107) and does not read the advertised contiguous option. | **Block** false control: wire non-contiguous fill or remove the option. |
| Gradient | Foreground-to-background drag; UI advertises linear/radial and Shift angle constraint. | Pixels are drawn into the active cel. | **A** active-context/shape tests. **Partial**: [tool always creates a linear gradient](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/tools/gradient-tool.ts#L49-L61); it reads neither radial type nor Shift. | **Block** false controls before adding gradient-map effects. |
| Shapes | Line, rectangle, and ellipse with thickness; documented angular/aspect modifiers. | Pixel result in active cel, command-backed where drawing session commits. | **A** drawing algorithms and tool-controller tests. **M** real canvas and modifier proof. | Keep, then add golden pixel fixtures for modifiers. |
| Selection | Marquee, lasso, polygonal lasso, magic wand; replace/add/subtract/intersect; invert/reselect; cut/copy/paste/delete/fill; floating selection. | Selection itself is session state; committed pixels and palette-index remapping persist. | **A** selection commands/store/tool and clipboard remap/index tests. **M** browser clipboard permission/round trip. | Keep; repair dead Edit menu actions and prove keyboard/menu parity. |
| Move / scale / rotate | Floating selection can move, scale from eight handles, rotate, preserve aspect with Shift, and snap rotation. | Commit writes transformed pixels; no algorithm choice is exposed. Draft scale is nearest-neighbor, final scale CleanEdge/area average; rotation is CleanEdge at 2× draft and 4× final. | **A**: [transform pipeline](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/selection/store.ts#L528-L618), [CleanEdge rotation](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/rotation/clean-edge.ts#L195-L225), CleanEdge/transform tests. **M** visual quality corpus. | Keep current algorithm until the separate rotation benchmark supplies comparative visual evidence; add deterministic sprite corpus and dimensions/alpha acceptance tests. |
| Zoom / pan / preview | Wheel/buttons/number shortcuts, fit/100%, hand/pan, preview overlay. | Viewport is editor state, not project artwork. | **A** viewport keyboard/pan/wheel/store and preview tests. **M** touch gestures/responsive proof. | Keep; explicitly define touch gestures. |

### Layers, guides, palette, and specialized modes

| Surface | Current user-visible contract | Persisted / exported contract | Evidence | 1.0 disposition |
| --- | --- | --- | --- | --- |
| Image layers | Add/delete/duplicate/rename/reorder, select, visibility, lock, opacity, continuity; runtime blend modes exist. | Name/type/visibility/opacity/blend/continuous and pixels serialize. Lock does not. Raster export currently ignores blend. | **A** layer command/timeline/context tests. **M** end-to-end layer round trip. | **Block** lock persistence, autosave coverage, and blend export parity. Blend-mode UI was not found, so treat it as latent rather than a supported editing control. |
| Group layers | Group/ungroup commands and `parentId` runtime hierarchy exist; shortcuts group the one active layer. | Shared file schema and serializer omit `parentId`; load creates generic image layers for group records. | **A** layer-command tests. [Runtime/file mismatch](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/types/layer.ts#L7-L26) versus [saved layer schema](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L75-L86). | **Block / Partial**: hide/disable as unsupported or complete multi-select, hierarchy UI, rendering, persistence, migration, and round-trip proof. |
| Text layers | Text layer with a two-font choice, color, per-frame content/position and move behavior. | Text layer metadata and text cel data serialize; output rasterizes in normal exports. | **A** text active-context and structural serialization tests. **M** browser font/render parity. | Keep as a clearly limited text tool; prove reload/export. |
| Reference layers | Import PNG/JPEG/WebP as above/below artwork reference; position/scale/desaturate; excluded from artwork cels and exports; eyedropper guard. | Original bytes, MIME type, transform, desaturate and position serialize in `.pf`. | **A** broad reference import/render/transform/export-exclusion tests and structural round trip. **M** live large-image/memory/reload proof. | Keep; add file-size and decode-failure UX. |
| Palette / indexed color | Presets and saved palettes; create/rename/delete; palette extraction; used/new badges; delete replacement; up to 256 indexed colors; clipboard remapping. | Main project palette and per-cel index buffers persist; saved palette library is separate IndexedDB data. | **A** palette invariant/extraction/persistence/UI/command/remap tests. **L** saved-palette creation/selection accepted in [#383](https://github.com/Flow-Fly/pixel-forge/issues/383#issuecomment-5133408249). | Keep; #429's repair has automated evidence but the issue itself records that fresh live evidence belongs here. |
| Guides / symmetry | Rulers create at most one horizontal and one vertical guide; Shift+G visibility; their intersection enables four-way symmetry. Tile/pixel grids are visual guides with settings. | Guides are session-only and absent from the project file. Tile grid has no tile data/model. | **A** source behavior; no focused guide/ruler tests found. [Store contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/guides-store.ts#L3-L15). **M** live. | Add tests and decide persistence. A diagonal guideline does not exist; “diagonal mirror” in code means both axis mirrors, not a diagonal line. |
| Guided Drawing | Import source image, choose generated/restricted palette, color/luminance mapping and isolated-pixel simplification; numbered target, guided fill, progress and resume. | Versioned target/settings/source metadata persist in `.pf`; one fixed frame. | **A** generator/sampling/fill/progress/project/resume/store/dialog/overlay tests. **L** palette workflow evidence in [#383](https://github.com/Flow-Fly/pixel-forge/issues/383#issuecomment-5133408249), not a full Guided Drawing journey. | Keep; current-head desktop plus phone/tablet playtest remains required. |
| View effects | CRT is a nondestructive view effect and can be baked during supported exports. | Effect is view/editor state; exported effect result is raster. | **A** registry/pipeline/CRT/render tests. **M** visual parity. | Keep as effect architecture seed; do not call it a general effects stack. |

### Animation and history

| Surface | Current user-visible contract | Persisted / exported contract | Evidence | 1.0 disposition |
| --- | --- | --- | --- | --- |
| Timeline model | Layer × frame cel grid; add/duplicate/delete/reorder frames; current-frame navigation; multi-cel range selection. | Frames, order by array, per-frame duration, and cels persist. | **A** animation milestone, active-context, serialization and timeline tests. **M** current full browser journey. | Keep; add semantic/keyboard grid operation and real multi-frame round trip. |
| Timing / playback | Per-frame millisecond duration; play/stop, first/last; loop all frames or an active tag; forward wrapping only. | FPS/current frame and durations persist. Playback mode is session state. | **A** [duration-aware forward loop](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/playback.ts#L45-L63) and [tag boundaries](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/playback.ts#L89-L118), playback tests. **M** live timing. | Keep base. Reverse, ping-pong, once and repeat count are not current features. |
| Tags | Named/color frame ranges; resize/collapse; preview; loop selected tag. | Name/color/start/end/collapsed serialize. No direction or repeat metadata. | **A** tag/store/serialization tests. **M** right-click/drag/touch/keyboard proof. | Keep base, but tag mutations must enter history/autosave. |
| Cel links / continuity | Soft/hard linked cels; link/unlink selected cels; continuous layers hard-link new cels; per-cel opacity UI. | Link ID/type and continuous persist. **Cel opacity does not serialize.** | **A** animation/serialization tests, but the structural round-trip test does not assert opacity. [Cel schema omission](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L88-L95). | **Block** cel-opacity data loss and add linked-cel real-pixel round trip. |
| Onion skin | Previous/next frame counts, opacity step and tint. | Session-only UI state. | **A** store/canvas code; no focused browser visual proof found. | Keep, document session scope, add golden visual test or live proof. |
| Semantic history | Undo/redo command list; before/after pixel preview; revert to a point; selective “patch this out”; user attribution and nested contexts. | Session-only, capped at 100 commands or 50 MB; cleared on reload/new project. | **A** history and history-panel tests. [Explicit limits/session model](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/history-store.ts#L6-L8). **M** usability and assistive-technology proof. | Keep basic undo; redesign semantic history around understandable milestones/previews. Persistent recovery history is a separate product contract. |

### PWA and platform contract

| Platform | Current implementation evidence | Missing current live proof | 1.0 disposition |
| --- | --- | --- | --- |
| Desktop browser | Full three-column editor shell; mouse drawing/drag workflows; keyboard shortcuts; IndexedDB; import/export. Historical integrity and palette playtests exist. | Current-head full project journey, pixel/reload/export parity, browser matrix, quota/failure recovery. | Primary 1.0 platform, but complete the release playtest suite. |
| Installable desktop PWA | Manifest, service worker/update UI, install action, `.pf`/Aseprite file handlers and launch queue. | Install/update/offline/OS association checklist has no completion record. | Supported only after the [PWA checklist](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/docs/verification/pwa.md#L1-L54) passes on release head. |
| Tablet / touch | Some controls use pointer events and the menu has one ≤520 px rule. | Canvas drawing, transforms, rulers, timeline resizing/tagging/cel selection and layout have mouse-only paths; no tablet playtest or responsive suite found. | **Block if tablet is promised for 1.0**; otherwise label desktop-only and schedule a coherent touch slice. |
| Phone | Menu compaction CSS exists. No phone-specific editor information architecture was found. | No 375 px layout, touch target, virtual keyboard, orientation, project browser, drawing, animation, import/export, or reload proof. | Do not claim phone editing at 1.0 without a dedicated product/UX capability and live device matrix. |
| Native/store app | None found. PWA is the current packaging model. | No iOS/Android native shell, App Store/Play Store package, or Steam package/store compliance. | Post-1.0 packaging decision; do not let it expand the browser-editor base. |

## Confirmed 1.0 blockers

These are implementation defects or contract contradictions, not merely absent evidence.

### B1 — Canvas resize does not resize artwork

`resizeCanvas()` only changes the width/height signals ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/project-store.ts#L132-L140)). It does not crop/extend/re-anchor cel canvases or indexed buffers, does not enter history, and does not itself trigger autosave. A visible resize can therefore disagree with stored pixel surfaces and be lost. Define crop/extend/anchor semantics, make it one undoable command, migrate every cel/index buffer, and prove reload/export.

### B2 — The persisted project contract drops editing state

Runtime layers contain `locked` and `parentId`, and runtime cels contain opacity. The shared `ProjectLayerFile`/`ProjectCelFile` contain none of them ([schema](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L75-L95)); serialization also omits them ([serializer](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/project-store.ts#L64-L91)). Loading a group goes through generic `addLayer()` and restores neither lock nor parent ([hydrator](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/serialization/project-load.ts#L168-L213)). The structural round-trip test explicitly mocks pixels and currently asserts only the subset it serializes ([test scope](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/tests/stores/project-serialization.test.ts#L3-L6)). Add a versioned compatibility path and complete round-trip invariants before exposing groups/cel opacity as stable.

### B3 — Export composition can disagree with the editor

The canvas editor and project thumbnail combine layer and cel opacity and apply blend mode. Raster export composition only applies layer opacity and `drawImage()` ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/export-composition.ts#L44-L58)). Its tests assert that limited draw plan, not preview equivalence. Centralize one composition contract and test golden RGBA output for every supported blend/opacity/reference/text combination.

### B4 — Visible mutations bypass history and autosave

Autosave observes only `history.version` ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/auto-save.ts#L21-L52)). Timeline visibility, lock and continuity mutate stores directly, as does drag reorder ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/pf-timeline-layers.ts#L322-L342)); tag create/update/delete/collapse/resize also mutate animation state directly. Those actions are neither undoable nor guaranteed to save until an unrelated history command occurs. Establish one mutation/dirty contract and audit every exposed action against it.

### B5 — Recovery failures are silent

Autosave correctly keeps a failed revision dirty, but its background failure path only logs ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/auto-save.ts#L187-L209)). 1.0 needs durable visible status, reason-appropriate recovery/retry, quota guidance, and a way to export/rescue the live project before closing.

### B6 — Exposed controls promise behavior they do not execute

- Edit-menu Cut/Copy/Paste entries have no click actions ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/menu/pf-menu-bar.ts#L813-L823)), although keyboard paths exist.
- View displays `mod+G`/`mod+shift+G` for pixel/tile grids, while the registered shortcuts group/ungroup layers ([menu](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/menu/pf-menu-bar.ts#L866-L872), [registry](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/keyboard/register-shortcuts.ts#L936-L948)).
- Fill contiguous and gradient radial/constrain settings are not consumed by their tools.

Remove false affordances or finish them, then add a generated menu/shortcut parity test.

### B7 — Core editing surfaces are not operable across promised input modes

The semantic history rows are clickable/hoverable `div`s without focus or keyboard activation ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/ui/pf-undo-history.ts#L407-L439)). Transform handles are mouse-only empty `div`s ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/canvas/pf-transform-handles.ts#L543-L556)); timeline cels are mouse-only clickable `div`s ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/pf-timeline-grid.ts#L461-L479)); rulers/guides use mouse events and an unlabeled delete `div`. Keyboard and screen-reader users cannot reach essential exposed behavior, and touch support cannot be inferred from desktop mouse handlers.

## Aseprite interchange boundary

Pixel Forge should describe Aseprite support as a tested subset, not general round-trip compatibility.

- Import creates only normal image layers (`type === 0`), maps six blend modes, imports frame durations, linked cels, pixels and tag ranges ([source](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-service.ts#L41-L58)). Groups/tilemaps and unsupported blend modes are skipped or flattened; palette ownership, cel opacity, tag direction and repeat metadata are not restored.
- Export writes only layer and compressed cel chunks ([chunk contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-writer.ts#L9-L29)), all as normal image layers and full-opacity cels ([cel contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-writer.ts#L93-L159)). It does not emit linked-cel, tag, palette, group, slice or tilemap chunks.
- Unit tests parse generated structures, but no current Aseprite-open/edit/reimport live corpus was found.

For 1.0, publish a compatibility table and golden `.ase` corpus. Unsupported data must produce an explicit import/export summary or warning rather than disappearing silently.

## Known live evidence ledger

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| [Owner playtest complete, 2026-07-21](https://github.com/Flow-Fly/pixel-forge/issues/337#issuecomment-5032500596) | Project isolation, save ordering, active-context actions/export, frame isolation, and listed round-trip gates on the tested build. | Current release head, whole editor, tablet/phone, accessibility, quota failure, or every export format. |
| [Owner palette playtest accepted, 2026-07-31](https://github.com/Flow-Fly/pixel-forge/issues/383#issuecomment-5133408249) | Saved-palette selection/creation UX for PR #427; identified follow-up defects. | Whole palette/editor journey or current #429 repair. |
| [#429 resolution note](https://github.com/Flow-Fly/pixel-forge/issues/429#issuecomment-5181123684) | Automated repair evidence exists and explicitly delegates independent/live evidence to #433. | It is not itself a fresh owner browser playtest. |
| [PWA verification document](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/docs/verification/pwa.md#L1-L54) | A good manual procedure exists. | No completion result was found; checklist text is not evidence that it passed. |

No current tablet or phone playtest record was found. No Playwright, Cypress, or other real-browser E2E suite was found in the baseline.

## Explicit non-features on this baseline

The following roadmap ideas are not current editor contracts: diagonal guidelines, clipping masks, a general nondestructive effects/layer-effects graph, gradient-map/shadow tools, 3D layers, tilemap data/layers/editor, audio tracks/layers, reverse/ping-pong/once animation playback, persistent undo/checkpoints, cloud sync, public/editor automation API, public plugin API, native mobile packages, or Steam packaging.

Calling these out prevents latent types, visual grids, CRT view rendering, or PWA installation from being mistaken for shipped feature families.

## Minimum current-head 1.0 proof suite

1. Add contract tests for the seven blocker families above, including a versioned `.pf` round-trip with real pixel bytes and a preview/export RGBA oracle.
2. Build a small permanent fixture corpus: transparent/indexed artwork, every blend/opacity combination, linked cels/tags, text/reference layers, resize anchors, and supported/unsupported Aseprite files.
3. Run one recorded desktop journey on Chromium plus import/export checks on Firefox and Safari: create → draw → layers → animate → save → close/reload → undo boundary → every export → reimport/open externally.
4. Run failure journeys: IndexedDB unavailable/quota exhausted, failed thumbnail, corrupt/unsupported file, update while dirty, tab limit, and deletion cancellation/recovery.
5. Run keyboard and screen-reader paths for project browser, menus, drawing alternatives, selection transforms, layer/timeline grid, history and dialogs.
6. If tablet or phone is part of the 1.0 promise, define the supported creation journey first, then prove it at representative touch viewports/devices. CSS breakpoints alone are not acceptance evidence.

This matrix should be the inventory boundary for 1.0 issue slicing: fix and prove the current contracts first; evaluate new effects, masks, tile/audio/3D layers, diagonal guides and API/plugin surfaces as separate capabilities afterward.
