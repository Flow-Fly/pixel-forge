# Animation timeline models: Pixel Forge, Aseprite, and Pixelorama

Status: research input for the Pixel Forge 1.0 Wayfinder map  
Research ticket: [Research the Pixel Forge 1.0 animation timeline model](https://github.com/Flow-Fly/pixel-forge/issues/434)  
Pixel Forge source snapshot: [`d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c`](https://github.com/Flow-Fly/pixel-forge/tree/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c) (`origin/develop`)  
External sources checked: 2026-08-04

## Question

How does Pixel Forge's current animation timeline and data model compare with current Aseprite and Pixelorama, and which differences materially improve a solo creator's frame-based sprite workflow?

This research supplies options and a recommended direction. It does not record a product decision, classify the separate audio-layer capability, or authorize implementation.

## Executive finding

Pixel Forge already has the right primary metaphor for 1.0: a layer-by-frame grid of cels, stable frame IDs, individual frame durations, linked cels, range tags, onion skinning, and a detached preview. Replacing that model with a general-purpose keyframe or media timeline would add complexity without improving the primary frame-based sprite workflow.

The current implementation is not yet a trustworthy contract, however. Important state is transient or lost across save/export, several timeline actions bypass undoable commands, playback only loops forward, the timing engine drifts after delayed frames, and the timeline is mouse/modifier/context-menu dependent. Those are consolidation problems, not reasons to replace the frame/cel model.

The strongest direction to take into a human decision is:

1. Keep the frame/cel grid as the 1.0 animation model.
2. Make all current timeline semantics durable, undoable, accessible, testable, and automatable.
3. Adopt a deterministic absolute-time playback core underneath frame durations, without exposing a motion-graphics timeline.
4. Leave property keyframes and audio tracks as later consumers of that clock and command surface, pending their own Wayfinder decisions.

## Current Pixel Forge contract

### Data and persistence

| Area | Current behavior | Evidence | Consequence |
| --- | --- | --- | --- |
| Frames | A frame has a stable ID, mutable order, and duration in milliseconds. | [`src/types/animation.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/types/animation.ts#L6-L11) | Stable IDs are a good command/API boundary. `order` duplicates array order and should not be an independently mutable source of truth. |
| Cels | Cels are addressed by `layerId:frameId` and carry a canvas, optional indexed buffer, link metadata, opacity, and optional text data. | [`src/types/animation.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/types/animation.ts#L27-L37), [`src/stores/animation/types.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/types.ts#L5-L16) | The coordinate is simple and deterministic, but the string key should remain internal rather than become the public API identity. |
| Linking | Explicit hard links propagate edits. Frame duplication uses soft copy-on-write links on ordinary layers; continuous layers create hard links. Empty cels share a transparent canvas internally. | [`src/stores/animation/store.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/store.ts#L244-L320), [`src/stores/animation/cel-linking.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/cel-linking.ts#L1-L53) | Hard links are a user concept. Soft and empty links are useful implementation details but should not leak as equivalent user-facing states. |
| Tags | Tags store an index range, name, color, and a `collapsed` UI flag. Overlap is prohibited. Insert/delete adjusts ranges. | [`shared/src/project.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L22-L29), [`src/stores/animation/tag-manager.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/tag-manager.ts#L13-L89) | The contiguous range is appropriate. Playback direction, repeat policy, and export identity are missing. Persisting `collapsed` mixes document semantics with one device's view state. |
| Native save | Frame duration, cels, links, tags, global FPS, and current frame are saved. Onion skin and playback state are not. | [`shared/src/project.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L88-L117), [`src/stores/project-store.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/project-store.ts#L168-L205) | The document can recover most structural animation state, but not the whole visible timeline setup. |

### Confirmed contract breaks

These are source-level findings, not claims from a live playtest:

1. **Cel opacity is not durable.** Runtime cels have `opacity`, and the UI can edit it, but `ProjectCelFile` has no opacity field and serialization does not write one. Reloading a native project therefore restores the default opacity. See [`shared/src/project.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L88-L95), [`src/stores/project-store.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/project-store.ts#L64-L91), and [`pf-timeline-grid.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/pf-timeline-grid.ts#L247-L287).
2. **Aseprite tag semantics are parsed and then discarded.** The parser reads direction and repeat count, but import creates only a range/name/color tag. Export writes no tag chunks. See [`aseprite-parser.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-parser.ts#L339-L363), [`aseprite-service.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-service.ts#L140-L147), and [`aseprite-writer.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-writer.ts#L193-L239).
3. **Aseprite cel semantics are lossy.** Import reads cel opacity but never applies it. Export rasterizes each visible cel independently at opacity 255 and does not emit linked-cel chunks. See [`aseprite-parser.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-parser.ts#L280-L315), [`aseprite-service.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-service.ts#L80-L101), and [`aseprite-writer.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-writer.ts#L124-L179).
4. **Global FPS and frame duration are competing concepts.** Playback uses only each frame's absolute duration; new frames always receive 100 ms; the persisted `fps` signal is not consulted by the engine. See [`playback.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/playback.ts#L45-L60), [`store.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/store.ts#L244-L256), and [`project-store.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/project-store.ts#L199-L203).
5. **Playback is forward and infinitely wrapping only.** It can constrain playback to one tag, but has no reverse, ping-pong, or play-once mode. It resets its timestamp after one advance rather than consuming accumulated elapsed time, so throttled frames slow playback instead of catching up. See [`playback.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/playback.ts#L29-L117).
6. **Not all timeline mutations are commands.** Frame add/delete/duration/reorder and cel link/unlink/opacity have command classes. Tag creation/edit/delete/collapse, onion settings, playback mode, navigation, and layer reorder call stores directly from UI components. See [`animation-commands.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/commands/animation-commands.ts#L8-L227), [`pf-timeline-header.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/pf-timeline-header.ts#L150-L327), and [`pf-onion-skin-controls.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/pf-onion-skin-controls.ts#L81-L98).

### Interaction and preview

Pixel Forge supports rectangular cel selection with Shift and additive toggle with Control/Command. Selected cels can be linked, unlinked, or assigned a shared opacity. It does not expose moving/copying cels through the timeline, selecting all cels through frame/layer headers, or applying canvas transforms to the selected cel set. [`cel-selection.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/cel-selection.ts#L17-L137) defines the selection model, while [`pf-context-bar.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/toolbar/pf-context-bar.ts#L596-L742) shows its current operations.

The grid uses 32 px `div` cells with click, hover, and context-menu handlers. Frame and layer reordering use HTML drag-and-drop; timeline pan, tag resize, and opacity scrubbing use mouse events. The cells have no button/grid semantics or keyboard handlers. This is not a complete tablet or keyboard contract. See [`pf-timeline-grid.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/pf-timeline-grid.ts#L22-L39), [`pf-timeline-frame-cells.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/timeline-header/pf-timeline-frame-cells.ts#L15-L28), and [`pf-timeline.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/pf-timeline.ts#L133-L217).

Onion skinning displays configurable previous/next frames with optional red/blue tint, but only for the active layer. It does not wrap inside a tag, offer per-layer exclusion, or persist its settings. [`pf-drawing-canvas.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/canvas/pf-drawing-canvas.ts#L401-L470) owns the rendering path.

The floating main preview correctly uses frame duration, layer blend mode, layer opacity, and cel opacity. Collapsed tags also have a hover-only animated preview. These are useful foundations, though the tag preview duplicates the playback loop and inherits its delayed-frame drift. See [`pf-preview-overlay.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/preview/pf-preview-overlay.ts#L611-L679) and [`pf-tag-preview.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline/pf-tag-preview.ts#L269-L317).

## Primary-source comparison

### Aseprite

Aseprite uses the same basic frame/layer/cel matrix. Its timeline supports moving and copying layers, frames, and cels, copying those structures between documents, and focusing or looping a tag. [Aseprite timeline documentation](https://www.aseprite.org/docs/timeline/)

Its user-facing linked-cel model is deliberately hard linking: linked cels share both image and position, and editing one propagates to all. The continuous-layer preference controls whether future copied cels are linked. [Linked cels](https://www.aseprite.org/docs/linked-cels/) and [continuous layers](https://www.aseprite.org/docs/continuous-layers/)

Aseprite tags carry a contiguous range, name, color, playback direction, repeat count, and user data. Its public API exposes forward, reverse, ping-pong, and reverse ping-pong directions plus finite repeat semantics. [Aseprite Tag API](https://aseprite.org/api/tag)

The file format makes per-frame duration, cel position, cel opacity, linked-cel references, cel z-index, tag direction, and tag repeat count durable. [Aseprite file format: frames and cels](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md#frames) and [tags](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md#tags-chunk-0x2018)

Onion skinning exposes previous/next extent and red/blue tint. Timeline preferences also include rewind-on-stop, retained timeline selection, selection by click/Shift/drag, and edge-based drag-and-drop. [Onion skinning](https://www.aseprite.org/docs/onion-skinning/) and [timeline preferences](https://www.aseprite.org/docs/preferences/#timeline)

Aseprite's scripting boundary is instructive for the Editor Command API: it exposes high-level commands, typed frame/cel/tag objects, active selection queries, before/after command events, transactions that form one undo step, and direct tool invocation with explicit cel/layer/frame targets. [Aseprite `app`](https://www.aseprite.org/api/app), [`app.command`](https://www.aseprite.org/api/app_command), and [`Sprite`](https://www.aseprite.org/api/sprite)

The inspected official timeline, public API, and `.ase` file specification do not define an audio-track object. That is evidence about the public contract, not a claim that audio can never be used alongside Aseprite.

### Pixelorama

Pixelorama keeps the same frame/layer/cel matrix but exposes a broader timeline workflow. It provides forward and backward preview, cycle/ping-pong/no-loop playback, per-frame duration multipliers over a base FPS, frame reversal, cel thumbnails, drag-and-drop of layers/frames/cels, multi-selection through cel/frame/layer buttons, and per-layer onion-skin exclusion. [Pixelorama timeline manual](https://pixelorama.org/user_manual/user_interface/timeline/)

Pixelorama tags are named export ranges, can be moved and resized, and can limit preview to the tag containing the selected frame. Its export UI can select frame ranges or tags, layers, and forward/backward/ping-pong direction. [Timeline](https://pixelorama.org/user_manual/user_interface/timeline/#frame-tags) and [save/export](https://pixelorama.org/user_manual/save_and_export/)

Pixelorama has extended the timeline beyond raster cels. Its current manual describes an optional keyframe view for animating layer opacity and effect properties with easing. It also models audio as a layer containing an MP3 or WAV, anchored to a chosen start frame; hiding the layer mutes it, and video export includes audio. [Keyframe timeline](https://pixelorama.org/user_manual/user_interface/timeline/#keyframe-timeline) and [layer types](https://pixelorama.org/concepts/layer/#audio-layers)

That breadth comes with a more general project model: groups, 3D, tilemap, and audio layers coexist with raster layers, while only pixel cels can be linked. [Pixelorama layer model](https://pixelorama.org/concepts/layer/)

Pixelorama offers a desktop-only headless CLI for project inspection and exports, but not the in-editor semantic command and state-query surface proposed for Pixel Forge. [Pixelorama CLI](https://pixelorama.org/user_manual/cli/)

Pixelorama is useful tablet evidence, but not a finished phone-timeline reference. Its Android build is explicitly described as experimental, mostly intended for tablets, with the UI not properly adapted to phones. [Pixelorama installation](https://pixelorama.org/user_manual/installation/#android)

## Gap matrix

Legend: **keep** means the existing concept is a sound 1.0 basis; **change** means current exposed behavior should not be considered consolidated; **later** means preserve an architectural seam but do not fold the feature into this decision.

| Capability | Pixel Forge now | Aseprite | Pixelorama | Candidate direction |
| --- | --- | --- | --- | --- |
| Frame/layer/cel grid | Present | Core model | Core model | **Keep for 1.0.** |
| Empty vs duplicate frame creation | UI primarily adds a duplicate | Supports multiple new-frame content modes | Exposes add/clone workflows | **Change:** make Empty and Duplicate explicit first-class commands. |
| Per-frame duration | Absolute ms | Absolute ms | Base FPS × frame multiplier | **Keep absolute `durationMs`;** demote global FPS to a display/default preference. |
| Playback directions | Forward infinite loop | Tag direction and repeats | Forward/backward, cycle/ping-pong/no-loop | **Change for 1.0:** forward, reverse, ping-pong, once/loop with exact endpoint rules. |
| Playback clock | One frame per RAF threshold; drops overdue elapsed time | Mature preview behavior | Drives frame and audio playback | **Change for 1.0:** injectable absolute clock with deterministic catch-up and seek. |
| Hard linked cels | Present | Present | Present for pixel cels | **Keep.** |
| Soft copy-on-write links | Persisted and visualized | Ordinary copies are independent | Auto-link is explicit layer behavior | **Change:** retain copy-on-write internally, but present duplicated cels as independent unless explicitly hard-linked. |
| Cel opacity | Editable but lost on native save and Aseprite round trip | Durable | Durable | **Repair before consolidation.** |
| Cel position/z-index | Pixels live on full-size canvas; no per-cel position/z-index model | Durable position and z-index | Durable opacity/z-index | **Research after core repair:** position can save memory and improve interchange; z-index is lower-value than layer clarity. |
| Multi-selection | Rectangle/toggle; opacity and link operations | Move/copy/transform selected cels | Applies through cel/frame/layer headers; cel drag/drop | **Change:** make selection a reusable command target and add frame/layer selection plus move/copy/delete. |
| Frame/cel reordering | Frame drag only | Frame and cel move/copy | Frame/layer/cel drag | **Change:** cel move/copy is a material solo-animation workflow. Provide non-drag commands too. |
| Tags | Range/name/color/collapse; forward loop | Direction/repeat/data | Export range and focused playback | **Change:** add direction/loop policy and export by tag. Decide whether collapse is device view state. |
| Onion skin | Active layer, prev/next, tint | Prev/next and tint | Prev/next, tint, per-layer exclusion | **Keep and harden:** persist project preference or define it as workspace state; add layer exclusion; test linked cels and tag boundaries. |
| Cel/frame preview | Dot cells, hover cel thumbnail, main preview, collapsed-tag hover preview | Optional timeline thumbnails and preview | Cel thumbnails | **Prototype:** optional timeline thumbnails and density sizes are more discoverable than hover-only previews. |
| Touch/tablet | 24–32 px targets; mouse, modifiers, right-click, HTML DnD | Desktop-oriented | Tablet-capable but still desktop-derived | **Change for 1.0 tablet:** pointer events, 44 px comfortable mode, explicit selection mode, accessible action menu, long-press only as a shortcut. |
| Keyboard/accessibility | Timeline cells are non-focusable clickable `div`s | Extensive keyboard workflow | Configurable shortcuts | **Change for 1.0:** semantic grid/button contract, roving focus, named controls, keyboard move/copy/select. |
| Native persistence | Structural state mostly durable | Rich `.ase` contract | Rich `.pxo` contract | **Change:** save every document semantic and keep device-only view state separate. |
| Aseprite interchange | Partial and lossy | Source format | Imports many Aseprite semantics with stated limits | **Change:** publish and test the supported subset; warn before lossy import/export. |
| Animation export | Range/current/all; animated WebP and spritesheet; infinite loop | GIF, sequences, sheets, tag/CLI export | PNG/APNG/GIF/video, ranges/tags/direction | **Change:** export by tag and loop policy first; format breadth is a separate portfolio choice. |
| Property keyframes | Absent | Not part of the sprite timeline model | Optional property/effect keyframe view | **Later:** do not make this a 1.0 timeline prerequisite. |
| Audio alignment | Absent | No public audio-track contract found | Frame-anchored audio layers and video export | **Later:** sibling research owns classification; build the clock seam now. |
| Automation | Store methods and partial command classes | Commands, objects, events, transactions, tool calls | Export-oriented CLI | **Change for 1.0 foundation:** one semantic command/query/event surface consumed by UI and automation. |

## Options for the 1.0 timeline direction

### Option A — Freeze the current model and repair only data loss

Keep the visible timeline as-is; persist cel opacity; fix Aseprite import/export; add tests.

Advantages:

- Smallest scope.
- Removes the most dangerous silent loss quickly.

Costs:

- Leaves forward-only playback, missing cel move/copy, mouse-only interactions, direct store mutations, and ambiguous FPS semantics in the supposed consolidated baseline.
- Does not establish the command/API surface that future automation needs.

This is insufficient for the approved 1.0 consolidation gate.

### Option B — Adopt Pixelorama's generalized timeline now

Introduce layer property tracks, effect keyframes, audio layers, curves, and a generalized time cursor as part of the base timeline rewrite.

Advantages:

- A single UI could eventually host animation, audio, and non-destructive effects.
- Avoids a later visual redesign if those capabilities are all selected.

Costs:

- Turns frame-based sprite animation into a motion/media editor before current behavior is trustworthy.
- Couples this ticket to unresolved audio, effect, 3D, and plugin decisions.
- Increases mobile density, persistence, export, undo, and automation scope at once.

This is premature and should not be the default 1.0 plan.

### Option C — Consolidate the frame/cel timeline on an extensible clock

Keep the visible frame/cel grid. Normalize document semantics, route them through commands, and replace the playback timer with a deterministic time engine derived from ordered frame durations. Expose an internal `TimelineClock`/playback contract that can later coordinate audio or property tracks without adding those tracks now.

Advantages:

- Directly improves the solo sprite workflow.
- Creates a trustworthy Editor Command API foundation.
- Preserves a path to audio and keyframes without pre-selecting them.
- Separates document truth, session selection/playback, and device view preferences.

Costs:

- More than a cosmetic timeline pass.
- Requires schema migration and explicit decisions about tag playback, selection, and touch behavior.

**Recommended research outcome:** take Option C into Wayfinder decision/prototype work. This is a recommendation, not an approved classification.

## Candidate 1.0 contract

### Keep

- Ordered frames with stable IDs and one positive integer `durationMs` per frame.
- Layer-by-frame cel addressing.
- Explicit hard-linked cels.
- Contiguous named tag ranges.
- Active-layer onion skin with previous/next extent and optional tint.
- A detached preview that matches export composition.
- Multi-cel selection as a reusable operation target.

### Change before calling the timeline consolidated

1. Persist cel opacity and round-trip it through native files.
2. Define absolute `durationMs` as timing truth; make FPS a view/default-new-frame preference rather than parallel document truth.
3. Define forward, reverse, ping-pong, once, and loop endpoint sequences with table-driven tests.
4. Give tags playback direction and repeat/loop policy, or explicitly separate reusable export tags from playback ranges.
5. Route every document mutation through undoable commands. Route session/navigation actions through the same command dispatcher without necessarily adding them to undo history.
6. Add empty-frame creation, cel move/copy/delete, frame/layer-header selection, and non-drag alternatives.
7. Make Aseprite import/export capability-aware: preserve supported semantics and present explicit warnings for unsupported ones.
8. Separate document state (frames/cels/tags) from session state (selection/current frame/playback) and device view state (density, collapsed presentation, onion display preference if chosen).
9. Replace the RAF threshold loop with an injectable absolute clock that can seek, step, account for accumulated elapsed time, and expose a stable current time/frame.
10. Redesign input around pointer and keyboard semantics: comfortable tablet density, explicit multi-select mode, focusable cells, and accessible action menus.

### Leave for later decisions

- Audio layer admission and product classification.
- Property/effect keyframes and easing curves.
- Cel z-index as a first-class editing workflow.
- A general motion-graphics timeline or DAW-style waveform editor.
- 3D and tilemap layer interaction with the animation timeline.

The separate [Research tilemap, audio-track, and 3D workflow fit](https://github.com/Flow-Fly/pixel-forge/issues/437) ticket owns whether audio belongs in 1.0, post-1.0, or is rejected. This timeline research only recommends the clock and command seams audio would need.

## Editor Command API implications

The Editor Command API should not expose store objects, DOM elements, string-composed cel keys, or real-time click simulation as its semantic contract.

### Command groups

Document mutations, undoable and revision-producing:

- `frame.create({ afterFrameId, content: "empty" | "duplicate", sourceFrameId? })`
- `frame.delete({ frameIds })`
- `frame.move({ frameIds, beforeFrameId? })`
- `frame.setDuration({ frameIds, durationMs })`
- `cel.copy`, `cel.move`, `cel.clear`
- `cel.link`, `cel.unlink`, `cel.setOpacity`
- `tag.create`, `tag.update`, `tag.delete`

Session commands, observable but normally not part of undo:

- `timeline.select({ cels | frames | layers, mode })`
- `timeline.seek({ frameId | timeMs })`
- `playback.start`, `playback.stop`, `playback.step`
- `onionSkin.configure`

Queries:

- `timeline.getSnapshot()` with ordered frame/layer/cel IDs, durations, tags, selection, playback state, and a document revision.
- `timeline.getFrameAtTime(timeMs)` and `timeline.getTimeForFrame(frameId)`.
- `timeline.getCapabilities()` so automation can avoid unsupported operations or lossy exports.

Events:

- `command.started`, `command.committed`, `command.failed`
- `document.changed` with revision and affected IDs
- `selection.changed`, `currentFrame.changed`, `playback.changed`
- `export.completed` or `export.failed`

### Required properties

- Explicit project ID on every operation; never re-resolve the active tab mid-command.
- Stable object IDs and validated inputs.
- Transactions that group several commands into one semantic undo entry and roll back atomically on failure.
- Structured results describing created IDs and affected ranges.
- An injectable clock for deterministic `advanceBy(ms)` tests.
- Capability/version negotiation before the same core is exposed through a public Plugin API.
- UI and automation both call the same commands; browser tests still exercise the visible UI path separately.

This follows the useful parts of Aseprite's public boundary—commands, typed objects, events, explicit tool targets, and transactions—while adding deterministic state queries needed for browser automation and an LLM skill.

## Verification plan for the eventual execution initiative

### Model and persistence

- Native round-trip fixture containing varied durations, hard links, cel opacity, tags, indexed cels, text cels, hidden layers, and blend modes.
- Migration fixtures for every prior `.pf` version affected by the timeline schema.
- Property tests or table-driven invariants for insert/delete/reorder across tags and links.
- Explicit test that session and device view state do not silently mutate document bytes.

### Playback

- Fake-clock sequences for forward, reverse, ping-pong, once, loop, and tag-bounded playback.
- Variable-duration frames, zero/invalid input rejection, large elapsed jumps, background-tab throttling, stop/resume, and seek.
- Exact endpoint tests so ping-pong does not accidentally duplicate or omit terminal frames.
- Audio-clock integration tests only if the sibling audio decision admits that capability.

### Interchange and export

- Licensed or generated golden `.aseprite` fixtures for duration, hard links, cel opacity, tag direction/repeat, groups, and unsupported chunks.
- Import -> native save -> reload comparisons.
- Native -> Aseprite -> parse comparisons for every claimed supported semantic.
- Warnings and opt-in flattening tests for intentionally lossy operations.
- Frame/tag-range exports whose pixels, order, duration, and loop metadata match preview.

### UI and live browser coverage

- Desktop mouse and keyboard flows: create empty/duplicate frames, range-select, link/unlink, move/copy cels, edit duration/tag, play each mode, undo/redo, reload, export.
- Tablet pointer flows at the target viewport: explicit multi-select, drag alternative, long-press/action menu, horizontal/vertical navigation, and no accidental canvas gesture capture.
- Screen-reader/focus pass over the timeline grid and controls.
- Real playback observation with mixed durations, onion skin, linked cels, hidden/locked layers, and tag boundaries.
- Visual comparison of main canvas, detached preview, tag preview, static export, animated export, and sprite sheet.

### Automation acceptance

One end-to-end scenario should create a multi-layer tagged animation through the Editor Command API, draw via semantic tool commands, set timings and links, query and assert the timeline snapshot, deterministically advance playback, export it, and compare the exported pixels/metadata. A sibling scenario should perform the representative workflow through the actual UI and compare the resulting semantic snapshot. Neither scenario substitutes for the other.

## Open human decisions exposed by the research

1. Do tags own playback direction/repeats, or are tags organization/export ranges while playback ranges are a separate concept?
2. Should ordinary frame duplication appear completely independent, leaving soft copy-on-write as invisible storage optimization?
3. Is tag collapse worth keeping after a tablet/desktop prototype, and if so is it per-device view state or document state?
4. Which timeline density modes and thumbnail behavior work at desktop and tablet sizes?
5. Is per-layer onion-skin exclusion enough for 1.0, or is all-visible-layers onion skin needed?
6. Does 1.0 require cel move/copy only within a project, or also across open project tabs?
7. Which exact Aseprite subset will Pixel Forge promise to preserve rather than merely parse or flatten?

## Source index

### Pixel Forge

- [Animation runtime types](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/types/animation.ts)
- [Shared project schema](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts)
- [Animation store](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/store.ts)
- [Playback engine](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/playback.ts)
- [Timeline UI](https://github.com/Flow-Fly/pixel-forge/tree/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/timeline)
- [Native serialization](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/project-store.ts)
- [Aseprite importer](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-service.ts)
- [Aseprite writer](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-writer.ts)

### Aseprite primary sources

- [Timeline](https://www.aseprite.org/docs/timeline/)
- [Linked cels](https://www.aseprite.org/docs/linked-cels/)
- [Tags](https://www.aseprite.org/docs/tags/)
- [Onion skinning](https://www.aseprite.org/docs/onion-skinning/)
- [Preferences](https://www.aseprite.org/docs/preferences/)
- [File format specification](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md)
- [Scripting API](https://www.aseprite.org/api/)

### Pixelorama primary sources

- [Timeline](https://pixelorama.org/user_manual/user_interface/timeline/)
- [Layer model](https://pixelorama.org/concepts/layer/)
- [Save and export](https://pixelorama.org/user_manual/save_and_export/)
- [Import](https://pixelorama.org/user_manual/Import/)
- [CLI](https://pixelorama.org/user_manual/cli/)
- [Installation and Android status](https://pixelorama.org/user_manual/installation/)
