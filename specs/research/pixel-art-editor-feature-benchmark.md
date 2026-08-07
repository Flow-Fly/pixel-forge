# Pixel Forge core editor audit and pixel-art workflow benchmark

**Research date:** 2026-08-04  
**Pixel Forge baseline:** `origin/develop` at `d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c`  
**Scope:** Current Pixel Forge product capabilities, live GitHub roadmap state, and a first-party-source comparison with Aseprite, Pixelorama, and Piskel.

## Executive conclusion

Pixel Forge does not have a feature-count problem. It already has a credible browser-native pixel editor: a broad drawing and selection toolset, layers and cel animation, strong palette workflows, local project persistence, multiple open projects, Aseprite import/export, sprite-sheet export, and several unusual features such as Guided Drawing, reference layers, and visual history.

The product is least mature at the seams where users must trust it:

- a few visible controls do not affect the tool behavior;
- Canvas Resize changes document dimensions without resizing or cropping the underlying cel canvases;
- raster export does not reproduce layer blend modes shown by the editor;
- save failure is logged but not surfaced as a recoverable user-facing state;
- Aseprite support is a useful subset, but the compatibility boundary is not made explicit;
- common image, palette, and animated-output interchange is thinner than the competitors.

The roadmap is therefore upside down. Its native hierarchy is dominated by accounts, cloud sync, billing, sharing, collaboration, plugins/AI, and mobile work, while no current initiative defines when the local editor itself is trustworthy and complete. The next milestone should consolidate the editor baseline, not add another expansion idea.

## Pixel Forge today

### Capability inventory

| Workflow area                 | What Pixel Forge currently offers                                                                                                                                                                         | Audit assessment                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser and document workflow | Installable PWA; browser-local project library with thumbnails, rename, duplicate, and delete; up to eight open project tabs; workspace restoration; debounced autosave and dirty-exit protection         | Strong browser-native foundation. Save failure needs visible recovery, not only a log entry.                                                                                                     |
| Canvas and navigation         | New documents up to 2048×2048; pan, zoom, fit, pixel grid, tile grid, rulers, guides, transparency checker, and guide-based mirrored drawing                                                              | Competitive foundation. Tile grid is a guide, not a tileset or tilemap document model.                                                                                                           |
| Drawing                       | Pencil, eraser, eyedropper, fill, gradient, line, rectangle, ellipse, text, custom brushes, pixel-perfect strokes, opacity, spacing, and shape fill/thickness                                             | Broad enough for a base editor, but Fill's Contiguous option and Gradient's Radial/angle-constrain options are not honored by their tool implementations.                                        |
| Selection and transform       | Marquee, lasso, polygonal lasso, magic wand; replace/add/subtract/intersect; copy/cut/paste/invert/delete/fill; move, CleanEdge scale/rotate, and flip                                                    | Stronger than a minimalist browser editor. Precision/numeric transform and shear/skew remain Aseprite/Pixelorama-level depth, not baseline blockers.                                             |
| Layers                        | Image, text, reference, and group types in the model; visibility, lock, opacity, rename, reorder, duplicate, delete, and continuous-animation behavior; several blend modes in rendering/import           | Basic layer workflow is present. Group creation and blend-mode selection were not found as complete user-facing workflows, and raster export does not reproduce blend modes.                     |
| Animation                     | Frames and cels, add/duplicate/delete/reorder, per-frame duration, playback and preview, onion skinning, multi-cel selection, linked/unlinked cels, frame tags, and continuous layers                     | A credible animation baseline, already materially deeper than Piskel's simple global-FPS frame strip. Tag playback direction/modes and audio are advanced scope.                                 |
| Palette and color             | Presets and saved custom palettes; add/edit/reorder/delete/search; drawing-color extraction; indexed buffers up to 256 colors; used/new color markings; lightness variations; clipboard palette remapping | A product strength. Common palette-file import/export and explicit document color modes are the main interoperability gaps.                                                                      |
| Import/export                 | Native `.pf`; `.ase`/`.aseprite` import and export; PNG, WebP, animated WebP, horizontal/vertical/grid sprite sheets, optional JSON metadata                                                              | Useful but incomplete. Common images cannot become a normal editable project directly; GIF/APNG and common palette interchange are absent; Aseprite round trips do not preserve the full format. |
| Differentiators               | Guided Drawing/Paint by Number, reference images, visual/semantic undo history, palette-aware clipboard remapping, CRT view/export effects                                                                | Keep and harden these. Do not expand them until the base editor trust gaps are closed.                                                                                                           |
| Cloud/platform                | Backend health/readiness, storage/database walking skeleton, and optional telemetry foundations                                                                                                           | There is no current user-facing account, cloud sync, share, collaboration, or billing workflow. These are platform expansion, not editor consolidation.                                          |

### Confirmed trust gaps

These are not inferred competitor differences; they are current code-path findings:

1. **Canvas Resize is unsafe as a product promise.** [`resizeCanvas()`](../../src/stores/project-store.ts#L137-L140) changes only the width and height signals. It does not resize, crop, anchor, or resample cel storage and does not create history. This should be treated as a data-integrity issue until Canvas Size versus Sprite Size semantics are defined and tested.
2. **Export can disagree with the editor.** [`composeExportFrame()`](../../src/services/export-composition.ts#L46-L54) applies visibility and opacity but not each layer's blend mode. PNG, WebP, animated WebP, and sprite-sheet output can therefore differ from the live composition.
3. **Some tool settings are decorative.** The registry exposes [Contiguous Fill and Linear/Radial Gradient](../../src/tools/tool-registry.ts#L123-L162), but Fill always calls connected flood fill and [Gradient always creates a linear gradient](../../src/tools/gradient-tool.ts#L49-L61). The advertised Shift angle constraint is also not consumed by the tool.
4. **Autosave failures are silent in the interface.** The failure path [updates dirty state and logs the error](../../src/services/auto-save.ts#L205-L208), but does not give the user a visible retry/recovery path.
5. **Aseprite compatibility is a subset.** Import retains normal image layers, visibility/opacity/common blend modes, durations, linked cels, and tags, but [filters out non-image layers](../../src/services/aseprite-service.ts#L41-L58). Groups, tilemaps, palette semantics, tag playback metadata, and full export round-trip fidelity are not a supported end-to-end contract.

The live GitHub corpus contains no owning issue for the first four gaps. Aseprite tag and linked-cel import were intentionally shipped in [PR #17](https://github.com/Flow-Fly/pixel-forge/pull/17), but broader fidelity was explicitly outside [issue #331](https://github.com/Flow-Fly/pixel-forge/issues/331) and never received a follow-up.

## Feature position against the market

| Area                        | Pixel Forge's current position                                                                                         | Product decision                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fast browser creation loop  | At or above the Piskel baseline in drawing, selection, animation, palettes, and local project management               | Consolidate and make every visible control truthful.                                                        |
| Serious sprite animation    | Strong base: cels, per-frame timing, tags, links, onion skin, preview                                                  | Stabilize before adding advanced playback or timeline effects.                                              |
| Layer composition           | Behind Aseprite and Pixelorama in complete group, blend, merge/flatten, and export semantics                           | Finish a coherent small layer contract; do not add more layer types yet.                                    |
| File interchange            | Behind all three in ordinary image/palette import and behind Aseprite/Pixelorama in documented project-format fidelity | Make compatibility explicit and test representative round trips.                                            |
| Animated delivery           | Spritesheets and animated WebP are useful, but GIF/APNG are common competitor paths                                    | Pick one broadly expected animated format for the base milestone; do not build every export target at once. |
| Tile workflow               | Grid guidance only; no reusable tileset/tilemap model                                                                  | Defer unless game-map production is the next deliberate product outcome.                                    |
| Extensibility and pipelines | No Aseprite-style scripting/CLI or plugin ecosystem                                                                    | Defer. It does not repair the creation loop.                                                                |
| Unique assistance           | Guided Drawing, reference layers, semantic history, and CRT treatment are distinctive                                  | Preserve as differentiators; freeze feature expansion while hardening their existing paths.                 |

This is not a recommendation to copy Aseprite feature for feature. Piskel is the useful minimum loop, Aseprite is the mature production north star, and Pixelorama shows how quickly import, tilemap, and configurable-workspace breadth can expand. Pixel Forge should first become a trustworthy version of its own current editor.

## Live roadmap audit

At the audit date, GitHub has **36 open issues and no open pull requests**. The native tree under [roadmap issue #72](https://github.com/Flow-Fly/pixel-forge/issues/72) has 24 open descendants, principally:

- accounts and cloud foundation: [#132](https://github.com/Flow-Fly/pixel-forge/issues/132) through #137, plus deployment #264;
- billing: [#138](https://github.com/Flow-Fly/pixel-forge/issues/138) through #140;
- asset sync: [#141](https://github.com/Flow-Fly/pixel-forge/issues/141) through #143;
- sharing: [#144](https://github.com/Flow-Fly/pixel-forge/issues/144) through #147;
- delta sync/history: [#148](https://github.com/Flow-Fly/pixel-forge/issues/148) through #151;
- collaboration, plugins/AI, and mobile expansion: [#152](https://github.com/Flow-Fly/pixel-forge/issues/152), [#303](https://github.com/Flow-Fly/pixel-forge/issues/303), and [#382](https://github.com/Flow-Fly/pixel-forge/issues/382).

Another 11 open issues sit outside that native tree. They mix editor work, launch work, and maintenance. The resulting problems are structural:

1. **There is no base-editor roadmap.** The tracker describes distant platform capabilities in detail but does not define “Pixel Forge 1.0 core editor complete.”
2. **Completed work and available work are confused.** [#388](https://github.com/Flow-Fly/pixel-forge/issues/388) and [#429](https://github.com/Flow-Fly/pixel-forge/issues/429) are the only issues carrying `ready-for-agent`, but their implementation PRs #431 and #430 are already merged into `develop`. There is no genuinely ready, unimplemented delivery slice.
3. **The canonical status is stale.** The roadmap summary still describes old branch heads and an open PR that has since merged.
4. **Relationships are inconsistent.** Several launch/observability issues claim parents only in prose; auth direction is split between #134 and #404; large capability issues are described as if they were delivery slices.
5. **Human gates are not consistently labeled.** Issues that require visual acceptance, an architecture decision, or product/privacy choices do not consistently carry `needs-human`.
6. **Core correctness gaps are unowned.** Resize safety, export composition parity, Radial Gradient, and Fill's Contiguous behavior have no durable tracker item.

## Recommended consolidation

### 1. Define one editor baseline initiative

Create one initiative named **Pixel Forge 1.0 — trustworthy core editor** with five outcome-level capabilities:

1. **Edit precisely:** drawing, selection, transforms, and every visible option behave as labeled.
2. **Preserve work:** resize, undo, autosave, reopen, and failure recovery cannot silently lose or misrepresent work.
3. **Animate reliably:** frames, cels, links, tags, timing, onion skin, and preview/export agree.
4. **Interoperate honestly:** native, image, palette, Aseprite, and published animation contracts are explicit and tested.
5. **Use the editor accessibly:** keyboard, pointer, touch, focus, and critical manual playtest paths are verified.

Link already completed palette, project-library, multi-tab, reference-layer, PWA, CRT, and Guided Drawing work as evidence. Do not recreate completed features as open backlog.

### 2. Make the first repair slices boring and risk ordered

1. **Make Canvas Resize safe and undoable.** Define Canvas Size versus Sprite Size, anchor/crop behavior, history, autosave, and regression tests.
2. **Make export match the editor.** Preserve supported blend and cel/layer opacity semantics across PNG, WebP, animated WebP, and sprite sheets.
3. **Make visible tool options truthful.** Implement or remove Contiguous Fill, Radial Gradient, and Shift angle constraint, with focused behavior tests.
4. **Surface save failure and recovery.** Keep dirty state visible, explain the failure, and provide retry/export escape paths.
5. **Publish an Aseprite support contract.** State what imports, what exports, what flattens or drops, and prove the supported subset with round-trip fixtures.
6. **Then choose one interoperability slice:** direct editable image import, palette-file interchange, or a common animated export. Choose from user workflow evidence rather than implementing all three together.

### 3. Clean the tracker before dispatching another worker

- close or relabel #388 and #429 as completed and record their remaining human-playtest limits;
- refresh #72 against current `develop` and separate editor, launch, cloud/growth, and deferred expansion;
- reconcile #134 with #404 and create native parent/child links for launch issues;
- label the real human decisions;
- turn only the first approved core repair into `risk:low` + `ready-for-agent` atomic issues.

### 4. Pause expansion without deleting it

Keep accounts/cloud sync, billing, public sharing, real-time collaboration, plugin/AI APIs, mobile, tilemaps, new CRT fidelity, and further Guided Drawing features visible as future capabilities. Remove them from the active execution horizon until the core milestone passes automated checks and a representative manual playtest.

## Research basis

This is a workflow benchmark, not an exhaustive feature catalogue. It concentrates on the path from opening a document to drawing, organizing, animating, saving, recovering, and exporting it. Claims are based only on first-party product sites, manuals, repositories, and release notes.

The product snapshots are:

- **Aseprite 1.3.18.1**, released 2026-07-23. The release is primarily a stability patch on the 1.3 line, so the current manual is the main feature source. ([release](https://github.com/aseprite/aseprite/releases/tag/v1.3.18.1), [manual](https://www.aseprite.org/docs/))
- **Pixelorama 1.2**, released 2026-07-29. The 1.2 release adds keyframed layer opacity/effects and autotiling on top of the documented 1.1-era core. ([release](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2), [documentation](https://pixelorama.org/introduction/))
- **Piskel's current web product and first-party `master` source**, reviewed at commit [`a6b9c02`](https://github.com/piskelapp/piskel/tree/a6b9c02daefceb10093f71e92d52d16920ccb16e). Piskel's latest packaged GitHub release is old, so this note uses the current site and current source rather than treating the 2018 release tag as the live web feature boundary. ([site](https://www.piskelapp.com/), [repository](https://github.com/piskelapp/piskel))

When an official source does not document a capability, this note says **not documented** or describes the narrower model that is visible in the first-party source. It does not turn missing documentation into a categorical claim of impossibility.

## Why these comparisons

- **Aseprite** is the mandatory reference and the deepest mature implementation of the conventional pixel-art workflow: local documents, a cel timeline, palette-aware editing, tilemaps, production export, and recovery.
- **Pixelorama** is the most strategically relevant broad comparison for a local-first browser editor. It is open source, ships on desktop and the web, uses the same project in both contexts, and covers advanced creation areas such as indexed color, tilemap layers, animation tags, and imports from other editors. ([installation](https://pixelorama.org/user_manual/installation/), [project model](https://pixelorama.org/concepts/project/))
- **Piskel** is the useful opposite boundary: a browser-native, intentionally simple editor centered on quick sprite drawing, a frame strip, live preview, browser-local persistence, and direct export. ([product site](https://www.piskelapp.com/), [repository README](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/README.md))

LibreSprite was not included because its Aseprite lineage makes it less differentiated for this question than the combination of Pixelorama's broad web-capable workflow and Piskel's focused browser-native workflow.

## At-a-glance comparison

| Workflow area           | Aseprite                                                                                                                                                                                                                                                                                                                    | Pixelorama                                                                                                                                                                                                                                                                                                                                                    | Piskel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document model          | Pixel-sized sprite; RGB, indexed, or grayscale; layers × frames = cels; color profile. ([sprite](https://www.aseprite.org/docs/sprite/), [color modes](https://www.aseprite.org/docs/color-mode/))                                                                                                                          | Project with size, FPS, RGBA or indexed mode, layers, frames/cels, palettes, brushes, guides, tags, and tilesets; multiple projects can be tabbed. ([project](https://pixelorama.org/concepts/project/), [color modes](https://pixelorama.org/concepts/color_mode/))                                                                                          | Width, height, one FPS value, descriptor, and synchronized layer/frame arrays in the current model. ([model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Piskel.js#L8-L55))                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Core drawing            | Pencil/custom brushes, erasing through ink/color behavior, fill, gradient, line/shape/text tools, pixel-perfect mode, dynamics, symmetry, tiled drawing. ([context bar](https://www.aseprite.org/docs/context-bar/), [brushes](https://www.aseprite.org/docs/brushes), [symmetry](https://www.aseprite.org/docs/symmetry/)) | Pencil, eraser, bucket, shading, line, Bézier curve, rectangle, ellipse, text, brushes and patterns; pixel-perfect and mirrored drawing; independent left/right tool mapping. ([tools](https://pixelorama.org/user_manual/tools/), [drawing](https://pixelorama.org/user_manual/drawing/))                                                                    | Pen, mirror pen, bucket, global color replace, eraser, line, rectangle, circle, move, lighten/darken, dithering, and picker. ([tool registry](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/controller/ToolController.js#L5-L21))                                                                                                                                                                                                                                                                                                                                                                                                           |
| Selection and transform | Replace/add/subtract/intersect selections; move, scale, rotate, skew; numeric position, size, rotation, and skew. ([selecting](https://www.aseprite.org/docs/selecting/), [moving selections](https://www.aseprite.org/docs/move-selection/))                                                                               | Rectangle, ellipse, polygon, color, magic wand, freehand, and painted selections; move, scale, rotate, and shear with on-canvas gizmos and pixel-art rotation algorithms. ([selecting](https://pixelorama.org/user_manual/selecting/), [transforming](https://pixelorama.org/user_manual/transforming/))                                                      | Connected-color shape, rectangle, and lasso selections with cut/copy/paste/delete/commit; move plus whole-frame/layer flip, 90° rotate, center, clone, and crop. ([shortcuts](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/keyboard/Shortcuts.js#L30-L76), [transform registry](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/controller/TransformationsController.js#L5-L13))                                                                                                                                                                                                          |
| Layers and animation    | Layer stack/groups plus frame columns and cels; linked cels, tags, per-frame durations, onion skinning, playback, and separate live preview. ([sprite](https://www.aseprite.org/docs/sprite/), [linked cels](https://www.aseprite.org/docs/linked-cels/), [onion skin](https://www.aseprite.org/docs/onion-skinning/))      | Layer/frame/cel matrix with visibility, lock, opacity, blend modes, linked cels, tags, per-frame duration, onion skinning, cycle/ping-pong/no-loop playback; v1.2 adds keyframed opacity/effects. ([timeline](https://pixelorama.org/user_manual/user_interface/timeline/), [1.2 release](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2)) | Named layers with opacity, reordering, merge and delete; frames can be added, duplicated, deleted, hidden and reordered; global FPS, live preview, and onion skin. ([layers UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/layers-list.html#L1-L82), [frame controller](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/controller/FramesListController.js#L100-L125), [preview](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/preview.html#L1-L75))                                                                                   |
| Palette and color       | Foreground/background colors; RGB, indexed, and grayscale projects; palette edit/load/save/generate, sorting, and palette gradients. ([color bar](https://www.aseprite.org/docs/color-bar/), [palette tutorial](https://www.aseprite.org/docs/tutorial/color-bar-tutorial/))                                                | Left/right colors; RGBA or indexed projects; global and project palettes, palette editing/reordering, image color extraction, and palette file import. ([color mode](https://pixelorama.org/concepts/color_mode/), [palettes](https://pixelorama.org/user_manual/palettes/))                                                                                  | Primary/secondary colors; editable HSV/RGB/hex palettes; imports from images and palette files and GPL export. ([palette dialog](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/dialogs/create-palette.html#L1-L84), [palette readers](https://github.com/piskelapp/piskel/tree/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/palette/reader))                                                                                                                                                                                                                                                                              |
| Tiles                   | Repeating tiled view plus true tilemap layers backed by tilesets; pixel and tile editing, with manual/auto/stack pixel modes. ([tiled mode](https://www.aseprite.org/docs/tiled-mode/), [tilemaps](https://www.aseprite.org/docs/tilemap/))                                                                                 | Repeating canvas tile mode plus rectangular, isometric, and hexagonal tilemap layers; manual/auto/stack editing, direct tile placement, transforms, probabilities, and autotiling. ([canvas](https://pixelorama.org/user_manual/user_interface/canvas/), [tilemaps](https://pixelorama.org/user_manual/tilemaps/))                                            | A repeating **tile preview mode** is present, but the reviewed first-party project and layer models do not expose a distinct tileset/tilemap layer system. ([tile preference](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/preferences/tile.html#L1-L17), [project model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Piskel.js#L8-L55))                                                                                                                                                                                                                                |
| Save, export, recovery  | Local `.aseprite` master file; PNG/GIF/image sequences/sprite sheets/JSON and CLI export; timed recovery sessions and reopen-closed-file support. ([files](https://www.aseprite.org/docs/files/), [export](https://www.aseprite.org/docs/exporting), [recovery](https://www.aseprite.org/docs/data-recovery/))              | Local `.pxo` master file; web builds download it; PNG/APNG/GIF, sequences, sprite sheets, optional video, tilesets, and CLI; opt-in automatic backups. ([save/export](https://pixelorama.org/user_manual/save_and_export/), [CLI](https://pixelorama.org/user_manual/cli/), [recovery guidance](https://pixelorama.org/troubleshooting/))                     | Browser save or `.piskel` download; GIF, PNG sprite sheet/single frame, per-frame ZIP, PixiJS JSON, and C export; local IndexedDB session snapshots plus unsaved-change warning, but no cloud/durable autosave guarantee. ([save UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/save.html#L18-L50), [export UI](https://github.com/piskelapp/piskel/tree/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/export), [backup service](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/BackupService.js#L1-L32), [terms](https://www.piskelapp.com/terms/)) |

## Aseprite: mature local production workflow

### Canvas and document

An Aseprite document is a sprite with a pixel width and height, one color mode and color profile, a layer stack, animation frames, and cels at layer/frame intersections. Frames carry durations in milliseconds. RGB, indexed, and grayscale modes are first-class; indexed sprites map each pixel to one of up to 256 palette entries. ([sprite structure](https://www.aseprite.org/docs/sprite/), [color mode](https://www.aseprite.org/docs/color-mode/))

The user can resize the sprite content or change the canvas size independently. The editor also exposes grids, zoom/pan, pixel aspect ratio, and multiple views/tabs of sprites as persistent workspace concepts rather than one-off dialogs. ([sprite size](https://www.aseprite.org/docs/sprite-size/), [workspace](https://www.aseprite.org/docs/workspace/))

### Drawing

The central loop is keyboard-and-mouse optimized: pencil on `B`, quick eyedropper with `Alt`, zoom keys or wheel, space-drag panning, and a context bar whose controls change with the active tool. Painting controls include brush shape/size/angle, custom brushes, dynamics, pixel-perfect strokes, opacity, and multiple ink behaviors such as normal compositing, exact alpha/color replacement, alpha lock, and palette-gradient shading. ([basics](https://www.aseprite.org/docs/basics/), [context bar](https://www.aseprite.org/docs/context-bar/), [ink](https://www.aseprite.org/docs/ink/))

The core tool surface covers freehand drawing, fill with tolerance/contiguous/connectivity options, linear or radial dithered gradients, line/shape tools, text, eyedropper, and move. Symmetry axes and repeating tiled mode support mirrored sprites and seamless patterns without changing the underlying document model. ([context bar](https://www.aseprite.org/docs/context-bar/), [symmetry](https://www.aseprite.org/docs/symmetry/), [tiled mode](https://www.aseprite.org/docs/tiled-mode/))

### Selection and transforms

Selections operate on the active cel. The user can replace, add, subtract, or intersect selection masks, reselect or invert them, then move, scale, rotate, or skew the selected pixels. The transform context includes numeric X/Y, width/height, rotation, and skew fields, which makes precise pixel placement part of the normal editing loop. ([selecting](https://www.aseprite.org/docs/selecting/), [move selection](https://www.aseprite.org/docs/move-selection/))

### Layers, frames, and animation

The timeline is a matrix: layer rows, frame columns, and cels at intersections. Layers can be named, shown/hidden, locked, grouped, reordered, and assigned opacity/blend behavior; background, transparent, reference, and tilemap layers cover different content roles. ([layers](https://www.aseprite.org/docs/layers/), [layer API](https://www.aseprite.org/api/layer))

Animation is not a separate mode. Users create and copy frames/cels in the same timeline, set frame duration, preview playback, organize ranges with tags, and reuse images through linked cels. Onion-skin settings choose how many earlier/later frames are visible and can tint them red/blue. A separate preview window updates while editing. ([animation](https://www.aseprite.org/docs/animation), [linked cels](https://www.aseprite.org/docs/linked-cels/), [onion skin](https://www.aseprite.org/docs/onion-skinning/), [preview](https://www.aseprite.org/docs/preview-window/))

### Palette and color

The color bar combines a palette, foreground/background colors, and a color picker. In indexed documents the palette is the pixel data's color authority; in RGB documents it is an editing aid. Users can create a palette from the sprite, load/save palettes and presets, reorder or duplicate entries, sort by color channels/attributes, and generate gradients across selected entries. ([color bar](https://www.aseprite.org/docs/color-bar/), [palette tutorial](https://www.aseprite.org/docs/tutorial/color-bar-tutorial/))

### Tiles and tilemaps

Aseprite distinguishes repeating **tiled drawing** from a true **tilemap layer**. A tilemap stores a tileset and grid cells that reference tile indices. The user can draw pixels inside tiles or place tile references directly. Pixel edits support manual mode (edit referenced tiles), auto mode (create/reuse/remove tiles to preserve the visual result), and stack mode (create new tiles without changing originals). ([tiled mode](https://www.aseprite.org/docs/tiled-mode/), [tilemap](https://www.aseprite.org/docs/tilemap/))

### Import, export, and pipeline

The `.aseprite`/`.ase` file is the editable master and preserves color mode, layers, frames, palettes, tags, slices, and related metadata. Normal publishing exports include GIF, PNG sequences, individual frames/layers, and sprite sheets. Sprite-sheet import accepts frame bounds, offsets, padding, and layout; export can filter layers and tags. ([files](https://www.aseprite.org/docs/files/), [exporting](https://www.aseprite.org/docs/exporting), [sprite sheets](https://www.aseprite.org/docs/sprite-sheet/))

The CLI extends the same workflow into asset pipelines: image conversion, tagged/layered export, packed sheets, PNG plus JSON metadata, slices, tilesets, scaling, trimming, extrusion, and filename templates. This is production workflow depth, but it sits after the interactive core rather than replacing it. ([CLI](https://www.aseprite.org/docs/cli/))

### Workflow UX, persistence, and platform

The default workspace centers the sprite editor, timeline, color bar, toolbar, and optional live preview. Tabs can be rearranged or duplicated, the UI can be docked, shortcuts are customizable, and extensions/Lua scripts are supported. The official workflow explicitly presents a short loop: create/open, draw, select, add layers/frames, edit in the timeline, save the master, then export. ([workspace](https://www.aseprite.org/docs/workspace/), [workflow](https://www.aseprite.org/docs/workflow/), [keyboard shortcuts](https://www.aseprite.org/docs/keyboard-shortcuts/))

Persistence is deliberately local: Aseprite documents state that saving does not involve a cloud or remote server. Recovery data is written periodically (two minutes by default), retained for a configurable period, and surfaced through **Recover Files**; closed sprites can also be reopened with their undo history for a default 15-minute window. ([files](https://www.aseprite.org/docs/files/), [data recovery](https://www.aseprite.org/docs/data-recovery/))

Official packages cover Windows, macOS, and Ubuntu/Linux. No first-party real-time collaboration workflow is documented; sharing is file-based or delegated to an external synchronized folder. ([FAQ](https://www.aseprite.org/faq/), [files](https://www.aseprite.org/docs/files/))

## Pixelorama: broad open-source workflow across desktop and web

### Canvas and project

Pixelorama calls the editable document a project. It contains size, FPS, color mode, frame/cel image data, layer/frame/cel properties, tags, guides, project palettes and brushes, and tilesets. Multiple projects can be open in tabs. Its `.pxo` file is a ZIP-like container with JSON metadata and per-cel image data, making the editable format explicit and inspectable. ([project](https://pixelorama.org/concepts/project/))

Projects support RGBA and indexed modes. Indexed pixels reference palette positions, so palette edits and reorderings immediately affect mapped pixels; free-picked colors are mapped to the nearest active palette entry. ([color mode](https://pixelorama.org/concepts/color_mode/))

The canvas supports unrestricted panning around fixed image bounds, zoom and 100%/fit views, rectangular and isometric grids, a one-pixel grid, repeating tile preview, rulers/guides, mirror view, and an optional second preview canvas. ([canvas](https://pixelorama.org/user_manual/user_interface/canvas/))

### Drawing

Pixelorama can bind separate tools and colors to the left and right mouse buttons. Its core tools include pencil, eraser, bucket, shading, line, Bézier curve, rectangle, ellipse, text, picker, move, and crop. Brushes, brush sizes, patterns, fill-inside, shape fill/thickness, snapped angles, symmetry/mirroring, alpha lock, dynamics, and pixel-perfect stroke cleanup deepen those tools without changing the core canvas interaction. ([tools](https://pixelorama.org/user_manual/tools/), [drawing](https://pixelorama.org/user_manual/drawing/))

The shading tool supports simple light/dark value changes, hue shifting, and palette-sequence color replacement. Destructive image effects and non-destructive layer effects extend color/shape correction, but they are secondary to the direct pixel tools. ([shading](https://pixelorama.org/user_manual/shading/), [image effects](https://pixelorama.org/user_manual/image_effects/))

### Selection and transforms

Selection tools cover rectangle, ellipse, polygon, all pixels of a color, contiguous magic wand, freehand lasso, and painted pixel selection. Selections constrain drawing and effects and support movement and scaling. ([tools](https://pixelorama.org/user_manual/tools/), [selecting](https://pixelorama.org/user_manual/selecting/))

Transformations can target selected content or whole active cels. Move supports axis/grid snapping and copy-drag; scale uses eight on-canvas handles; rotation and shear use on-canvas handles and offer pixel-art-specific algorithms including cleanEdge and OmniScale. Project-wide scale, canvas resize, and transparent-border crop are separate operations. ([transforming](https://pixelorama.org/user_manual/transforming/))

### Layers, frames, and animation

The timeline is a layer/frame/cel matrix. Core layer controls include add/remove/reorder/clone/merge, visibility, lock, opacity, blend mode, grouping, clipping, linked-cel defaults, and effects. Pixel, group, tilemap, and audio layers all participate in the project; the broader tool also documents 3D layers, though they are outside this benchmark's core emphasis. ([timeline](https://pixelorama.org/user_manual/user_interface/timeline/), [layers](https://pixelorama.org/concepts/layer/))

Frames can be added, removed, cloned, reordered, reversed, and assigned individual duration multipliers. Tags label animation ranges and can limit preview/export. Playback offers forward/backward controls and cycle, ping-pong, or no-loop behavior. Onion skinning can show configurable past/future counts with blue/red tint, and individual layers can opt out. ([timeline](https://pixelorama.org/user_manual/user_interface/timeline/))

Version 1.2 adds a keyframe-based timeline view for interpolating layer opacity and layer effects. That is a meaningful step beyond purely frame-by-frame bitmap timing, but the layer/frame/cel matrix remains the primary animation model. ([1.2 release](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2))

### Palette and color

Pixelorama distinguishes global palettes stored in the application data folder from project palettes stored in `.pxo`. Project palette edits are undoable; global palette edits are intentionally treated as persistent configuration, with a default preference that copies a global palette into the project before editing. The palette panel supports adding/removing/reordering/copying colors and sorting. ([palettes](https://pixelorama.org/user_manual/palettes/))

Palette import supports Pixelorama JSON, GIMP GPL, PAL, and common image formats, with unique-color extraction from an image. Combined with indexed mode and the palette-based shading mode, this makes palette position part of both authoring and document semantics. ([palettes](https://pixelorama.org/user_manual/palettes/), [color mode](https://pixelorama.org/concepts/color_mode/))

### Tiles and tilemaps

Pixelorama has a separate repeating canvas tile mode for seamless art and a true tilemap layer system for level-like layouts. Tilemaps reference reusable tilesets and can use rectangular, isometric, or hexagonal cells. Tilesets can be shared by multiple layers. ([canvas](https://pixelorama.org/user_manual/user_interface/canvas/), [tilemaps](https://pixelorama.org/user_manual/tilemaps/))

Like Aseprite, tilemap layers separate pixel editing from tile placement and offer manual, auto, and stack pixel modes. Direct tile drawing includes rotate/flip, multi-tile random placement with per-tile probabilities, grid-cell selection behavior, and—new in 1.2—neighbor-based autotiling. Tilesets export as images or Godot `TileSet` resources. ([tilemaps](https://pixelorama.org/user_manual/tilemaps/), [1.2 release](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2))

### Import, export, and pipeline

Pixelorama imports common image formats plus its own `.pxo`, OpenRaster, Aseprite, Krita, Photoshop, and Piskel projects with documented limits. An imported image can become a project, layer, reference image, palette, brush, pattern, or tileset. Aseprite import preserves pixel/group/tilemap layers, hierarchy, cels, linked cels, common layer properties, indexed mode, tags, frame duration, and tilesets, while explicitly listing unsupported data. ([import](https://pixelorama.org/user_manual/Import/))

Saving creates the editable `.pxo`; exporting produces PNG sequences, APNG/GIF animations, sprite sheets, or—through FFmpeg—video. Export can choose frames/tags, layers, direction, interpolation, and scale. Desktop CLI options cover project inspection, frame ranges, sprite sheets, JSON, scaling, and split-layer export. ([save/export](https://pixelorama.org/user_manual/save_and_export/), [CLI](https://pixelorama.org/user_manual/cli/))

### Workflow UX, persistence, and platform

The default workspace exposes toolbar, canvas tabs, timeline, global tool options, left/right tool options, color picker, and palettes. Panels can be hidden, docked, floated, rearranged, and saved as layouts. Shortcuts support keyboard, mouse, and gamepad events and can be stored in profiles. ([UI basics](https://pixelorama.org/user_manual/user_interface/user_interface_basics/), [shortcuts](https://pixelorama.org/user_manual/shortcut_settings/))

On desktop, save writes to a chosen path. In the web build, saving or exporting prompts for a name and downloads `.pxo` or output files through the browser. Automatic backups are opt-in under Preferences; the first-party troubleshooting guide still recommends explicit saves and independent backup copies. ([save/export](https://pixelorama.org/user_manual/save_and_export/), [troubleshooting](https://pixelorama.org/troubleshooting/))

Pixelorama ships for Windows, Linux, and macOS, has a web version, and documents an experimental Android build. No first-party real-time collaboration or shared-cloud document model is documented; the project-file workflow is local. ([installation](https://pixelorama.org/user_manual/installation/), [project](https://pixelorama.org/concepts/project/))

## Piskel: focused browser-native sprite workflow

### Canvas and document

Piskel's reviewed document model stores width, height, a single FPS value, a descriptor, and an array of synchronized layers; each layer contains the same number of same-sized frames. The resize surface can resize the canvas with an anchor, optionally scale content, maintain aspect ratio, and set a default size. ([project model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Piskel.js#L8-L55), [layer model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Layer.js#L8-L47), [resize UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/resize.html#L1-L58))

The first-party model does not expose an Aseprite/Pixelorama-style project color-mode field, tags, per-frame durations, groups, or typed tilemap layers. The deliberately smaller model is the main architectural distinction, not just a smaller toolbar. ([project model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Piskel.js#L8-L55), [frame model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Frame.js))

### Drawing

The current tool registry is compact and explicit: pen, vertical/horizontal mirror pen, connected paint bucket, all-pixels-of-one-color replacement, eraser, straight line, rectangle, circle, move, connected-color shape select, rectangle select, lasso, lighten/darken, dithering, and color picker. Pen size is exposed as 1–4 pixels. No separate text, curve, gradient, or configurable brush-library tool appears in that complete registry. ([tool registry](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/controller/ToolController.js#L5-L21), [drawing tools UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/drawing-tools.html#L1-L44))

This focuses the interaction on immediate pixel changes rather than tool configuration. Modifiers broaden a few operations across all layers or frames—for example color replacement and movement—without introducing a separate multi-selection timeline model. ([color replacement](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/tools/drawing/ColorSwap.js), [move tool](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/tools/drawing/Move.js))

### Selection and transforms

Piskel provides connected-color shape selection, rectangle selection, and lasso selection. Standard keyboard operations cover cut, copy, paste, delete, and commit, while the move tool relocates pixels. ([selection shortcuts](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/keyboard/Shortcuts.js#L62-L76), [selection tools](https://github.com/piskelapp/piskel/tree/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/tools/drawing/selection))

The transform toolbar offers horizontal/vertical flip, clockwise/counter-clockwise 90° rotation, clone-current-layer-to-all-frames, center, and crop-to-content-or-selection. Flip, rotation, and centering can be widened to all layers and/or frames with modifiers. The reviewed toolbar does not expose free-angle selection rotation, selection scaling handles, or skew. ([transform registry](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/controller/TransformationsController.js#L5-L13), [transform implementations](https://github.com/piskelapp/piskel/tree/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/tools/transform))

### Layers, frames, and animation

Layers have names and opacity. The layer surface supports add, reorder up/down, rename, merge down, delete, and toggling whether the layer participates in preview. There are no groups or per-layer blend-mode controls in the reviewed model/UI. ([layer model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Layer.js#L8-L47), [layers UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/layers-list.html#L1-L82))

Frames are shown as a vertical thumbnail strip. They can be added, duplicated, deleted, hidden from preview, and reordered by drag-and-drop. A live preview exposes original/best/full sizing, optional grid, pop-out view, onion skin, and a global FPS slider from 0–24. ([frame controller](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/controller/FramesListController.js#L100-L125), [frame reorder](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/controller/FramesListController.js#L194-L252), [preview](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/preview.html#L1-L75))

### Palette and color

Piskel exposes primary and secondary colors and editable palettes. The palette editor supports hex, HSV, and RGB controls; color add/remove/reorder; import from an image or palette file; and download as GPL. Palette readers exist for GPL, PAL, TXT, and images, while palettes are stored in browser local storage. ([palette editor](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/dialogs/create-palette.html#L1-L84), [palette readers](https://github.com/piskelapp/piskel/tree/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/palette/reader), [palette storage](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/palette/PaletteService.js))

### Tiles

The official product site says Piskel can design tiles, and the preferences expose a tile mode with adjustable mask opacity. In the reviewed source this is a repeating preview/edit aid rather than a separate tilemap document structure: the project model remains layers of bitmap frames with no tileset or tile-index layer type. ([site](https://www.piskelapp.com/), [tile preference](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/preferences/tile.html#L1-L17), [project model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Piskel.js#L8-L55))

### Import, export, and workflow UX

Import accepts browser-local saves, `.piskel` files, and PNG/JPG/BMP/animated GIF images; recent-session backups are reachable from the same surface. ([import UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/import.html#L1-L48))

Export covers animated GIF, scaled PNG sprite sheets with configurable columns, selected-frame PNG, PixiJS sprite sheet plus JSON, ZIP archives with a PNG per frame and optional layer splitting, and C arrays. ([export shell](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/export.html#L1-L25), [export panels](https://github.com/piskelapp/piskel/tree/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/export))

Piskel's defining UX is proximity: the frame thumbnails, live preview/FPS, tool icons, transforms, palette, and export are all direct surfaces. Keyboard shortcuts cover tool choice, undo/redo, pen size, frame navigation/creation, and preview sizes. ([product site](https://www.piskelapp.com/), [shortcuts](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/keyboard/Shortcuts.js))

### Persistence, recovery, platform, and collaboration

Users can save into the browser, download an editable `.piskel` file, and later load either. The service runs entirely in the browser and does not require an account or upload artwork to Piskel's servers. Its privacy page identifies localStorage and IndexedDB as the browser persistence mechanisms. ([save UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/save.html#L18-L50), [terms](https://www.piskelapp.com/terms/), [privacy](https://www.piskelapp.com/privacy/))

The current source also writes changed-project recovery data to IndexedDB every minute, creates a new snapshot at most every five minutes, retains up to 12 snapshots per session and 10 sessions, offers a backup browser, and warns before unloading dirty work. This is best understood as browser-local crash/session recovery, not a replacement for explicit save: the service terms explicitly disclaim autosave and cloud storage and warn that unsaved work may be lost. ([backup service](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/BackupService.js#L1-L32), [backup database](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/database/BackupDatabase.js#L1-L55), [unload warning](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/BeforeUnloadService.js#L28-L47), [terms](https://www.piskelapp.com/terms/))

The web app supports current Chrome, Firefox, Edge, and Brave under a stated canvas-fingerprinting condition; mobile/tablet is not supported. Offline desktop builds are available for Windows, macOS, and Linux. The first-party service model is explicitly local and serverless for artwork, so no real-time collaboration or cloud sharing workflow is provided. ([repository README](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/README.md), [terms](https://www.piskelapp.com/terms/))

## What the comparison says about the category

These are competitor-side observations, not a proposed implementation plan.

### The stable core shared by all three

1. **An editable project is separate from exported assets.** Each editor preserves layers and frames in its own local project representation, then produces simpler delivery formats such as PNG/GIF/sprite sheets. ([Aseprite files](https://www.aseprite.org/docs/files/), [Pixelorama save/export](https://pixelorama.org/user_manual/save_and_export/), [Piskel save UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/settings/save.html#L18-L50))
2. **The drawing minimum is more than a pencil.** Pencil/pen, eraser, fill, picker, straight lines/shapes, movement, zoom/pan, undo/redo, and primary/secondary color handling are the common creation loop. Pixel-perfect or pixel-specific behavior is surfaced directly rather than hidden behind a generic bitmap editor. ([Aseprite context bar](https://www.aseprite.org/docs/context-bar/), [Pixelorama drawing](https://pixelorama.org/user_manual/drawing/), [Piskel tools](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/controller/ToolController.js#L5-L21))
3. **Layers and animation frames are coequal document concepts.** Even Piskel's simpler vertical frame strip keeps layers synchronized across frames. Aseprite and Pixelorama scale this into a cel matrix with tags, linked cels, and timing controls. ([Aseprite sprite model](https://www.aseprite.org/docs/sprite/), [Pixelorama timeline](https://pixelorama.org/user_manual/user_interface/timeline/), [Piskel model](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/model/Piskel.js#L8-L55))
4. **Animation feedback is immediate.** All three expose live playback; all three expose onion-skin support; frame creation, duplication, deletion, and ordering stay adjacent to the canvas rather than in an export-only workflow. ([Aseprite animation](https://www.aseprite.org/docs/animation), [Pixelorama timeline](https://pixelorama.org/user_manual/user_interface/timeline/), [Piskel preview](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/preview.html#L1-L75))
5. **Palette handling is a primary surface.** All three keep editable palettes close to foreground/background color selection. Aseprite and Pixelorama go further by making palette indices part of document semantics. ([Aseprite color bar](https://www.aseprite.org/docs/color-bar/), [Pixelorama color mode](https://pixelorama.org/concepts/color_mode/), [Piskel palette UI](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/templates/dialogs/create-palette.html#L1-L84))
6. **Local recovery is part of the core trust model.** The implementations differ—disk sessions, opt-in backup files, or browser IndexedDB snapshots—but each acknowledges that explicit save alone is not sufficient protection during an editing session. ([Aseprite recovery](https://www.aseprite.org/docs/data-recovery/), [Pixelorama troubleshooting](https://pixelorama.org/troubleshooting/), [Piskel backup service](https://github.com/piskelapp/piskel/blob/a6b9c02daefceb10093f71e92d52d16920ccb16e/src/js/service/BackupService.js#L1-L32))

### Where the products deliberately diverge

- **Animation depth:** Piskel favors one project FPS and a direct frame strip. Aseprite and Pixelorama add per-frame timing, tags, linked cels, and a matrix timeline; Pixelorama 1.2 also interpolates layer properties.
- **Selection depth:** Piskel covers selection, copy/move, and fixed transforms. Aseprite and Pixelorama make on-canvas scale/rotate/skew or shear part of the ordinary pixel workflow.
- **Tile scope:** Piskel provides seamless tile preview. Aseprite and Pixelorama model reusable tile references in tilemap layers. Pixelorama currently reaches further into level-authoring concerns with cell shapes, probability, and autotiling.
- **Workflow scaling:** Piskel optimizes for opening the browser and drawing one sprite quickly. Aseprite adds a configurable desktop workspace and CLI asset pipeline. Pixelorama combines a dense configurable workspace with desktop/web portability and broad cross-editor import.
- **Persistence ergonomics:** Desktop apps can keep a stable file handle/path and update it. Browser builds commonly fall back to named downloads, browser storage, or both; Piskel's browser-local save/recovery model and Pixelorama's downloaded `.pxo` expose that platform constraint directly.

### Strategic reading of the three-product set

The comparison suggests three useful product levels without declaring which one any editor should pursue:

- **Fast-entry core:** Piskel's direct tool → frame → preview → export loop.
- **Serious sprite production:** Aseprite's cel/timing, selection, indexed palette, local recovery, and repeatable export depth.
- **Broad open workflow:** Pixelorama's web/desktop parity, cross-editor import, customizable workspace, and advanced tilemap system.

The strongest common pattern is not maximum feature count. It is a short, visible creation loop backed by an editable local project, predictable animation feedback, and a recovery story; deeper selection, palette, tilemap, and pipeline capabilities layer on top of that core.
