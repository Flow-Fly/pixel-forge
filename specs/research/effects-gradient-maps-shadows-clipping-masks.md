# Effects, gradient maps, shadows, and clipping masks

Research date: 2026-08-04

Pixel Forge baseline: [`d737ac4`](https://github.com/Flow-Fly/pixel-forge/tree/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c)

## Decision

**Ship a hybrid effects model in 1.0: first make one canonical compositor serve the editor, previews, thumbnails, and every raster export; then add deterministic destructive pixel effects and a simple clipping-to-below layer flag. Keep live effect stacks, adjustment layers, masks, custom shaders, and animated effect parameters for post-1.0.**

This boundary gives Pixel Forge useful pixel-art workflows without turning 1.0 into a rendering-graph and file-format project. It also creates the stable command surface that the planned Editor Command API and later plugin API need.

The immediate ordering matters:

1. Repair composition and persistence contracts.
2. Establish a shared, transaction-safe destructive-effect framework.
3. Add gradient map, hard-edged shadow/outline, palette-step shading, and the missing gradient-fill behavior.
4. Add clipping-to-below on top of the same compositor.
5. Expose those semantic operations through the Editor Command API.

Do not implement a layer-effect stack before steps 1 and 2. Pixel Forge currently has divergent rendering paths, so a live-effect feature would multiply existing inconsistencies.

## Product vocabulary

These features look similar in a menu but have different persistence, history, and export contracts.

| Model | Stored as | Undo/history | Export behavior | 1.0 decision |
| --- | --- | --- | --- | --- |
| Destructive tool/effect | Resulting cel pixels | One command per apply | Pixels already contain result | Yes |
| Live layer effect | Parameters attached to one layer | Parameter edits | Evaluated during composition | Post-1.0 |
| Adjustment layer | Effect node affecting content below | Layer and parameter edits | Evaluated during composition | Post-1.0 |
| Mask | Grayscale/alpha content controlling visibility/effect scope | Pixel and structure edits | Evaluated during composition | Post-1.0 |
| Clipping-to-below | Boolean relationship between sibling layers | Layer property edit | Evaluated during composition | Yes, narrowly |
| Preview | Temporary pixels or render result | No history until Apply | Never serialized by itself | Yes |
| Display/export look | Global presentation transform, such as CRT | Preference edit, outside project history | Only when explicitly requested | Keep, clarify |

“Effect” should not be the persisted catch-all noun. The implementation and UI should say which category an operation belongs to.

## What Pixel Forge has today

### Project and layer contracts

The native project schema is version 4.1.0. It recognizes image, group, text, and reference layers and only six blend modes: normal, multiply, screen, overlay, darken, and lighten ([project contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L1-L18)). A serialized layer stores visibility, opacity, blend mode, continuity, and type-specific data, but no parent, lock, clipping, mask, or effect data ([serialized layer](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L75-L86)).

The runtime layer type does have `locked` and `parentId` ([runtime layer](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/types/layer.ts#L7-L28)), but save omits both ([save path](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/project-store.ts#L142-L183)) and load reconstructs a flat layer list ([load path](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/serialization/project-load.ts#L168-L213)). Group hierarchy therefore cannot yet be a dependable basis for clipping or adjustment scopes.

The stored cel contract also has no cel opacity ([cel contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L88-L95)). Any new composition work should not add another runtime-only property.

### Composition is already inconsistent

The editor canvas composites visible layers with layer opacity multiplied by cel opacity and applies the layer blend mode through `globalCompositeOperation` ([editor compositor](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/canvas/pf-drawing-canvas.ts#L321-L369)). The preview renderer follows the same broad rule ([preview compositor](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/preview-renderer.ts#L16-L56)).

The clean export compositor does not: it applies layer opacity, but not the layer blend mode or cel opacity ([export compositor](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/export-composition.ts#L14-L58)). PNG, WebP, animated WebP, and spritesheet routes all depend on that clean composition path ([export dialog](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/dialogs/pf-export-dialog.ts#L312-L525)). A project containing a non-normal blend mode or partial cel opacity can therefore look different after export.

No new effects contract is safe until one compositor defines ordering, opacity, blending, clipping, group behavior, and effect application for all consumers.

### The current gradient is a partial destructive tool

The gradient tool captures the current canvas, restores it during dragging, and fills the entire active canvas with a browser `CanvasGradient` between primary and secondary colors ([gradient implementation](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/tools/gradient-tool.ts#L3-L62)). It is not a gradient map. It also:

- ignores the exposed radial setting;
- ignores selections;
- has no pixel-art dithering or explicit indexed-palette policy;
- writes arbitrary interpolated RGBA colors;
- never marks a dirty rectangle.

The generic stroke commit requires dirty bounds before it records a drawing command ([stroke commit](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/canvas/pf-drawing-canvas.ts#L742-L780)). Because the gradient tool never calls the base tool's dirty-region method ([dirty region contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/tools/base-tool.ts#L53-L64)), the generic history path cannot create a usable undo command for it. This is a base-feature defect, not a reason to build a second effect architecture.

### Indexed color and history impose real constraints

Indexed buffers reserve zero for transparency and use one-based palette indices ([indexed color contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/indexed-color.ts#L1-L7)). Canvas-to-index conversion can either add missing colors or choose the closest match ([conversion path](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/indexed-color.ts#L90-L137)). Save currently rebuilds index buffers because canvas-only commands can leave them stale ([save repair](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/project-store.ts#L142-L145)).

An effect must update RGBA pixels and palette indices atomically. It must not rely on save-time repair. Every application must choose and report a palette policy:

- `existing-palette`: emit only existing palette entries;
- `extend-palette`: add deterministic colors until the 256-entry limit;
- `rgba`: retain exact RGBA for non-indexed projects.

History is in-memory, capped at 100 commands and approximately 50 MB, and explicitly not persistent ([history store](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/history-store.ts#L6-L18), [persistence note](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/history-store.ts#L54-L83)). A preview must not add commands. Apply should add one reversible command no matter how many pointer moves or parameter changes preceded it.

### CRT is a display/export transform, not project content

The view-effect system registers only passthrough and CRT ([registry](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/view-effects/index.ts#L1-L15)). It uploads a composed canvas to a WebGL2 texture for each render and runs one effect ([pipeline](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/view-effects/pipeline.ts#L18-L52), [texture upload](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/view-effects/pipeline.ts#L126-L144)). Its selection and parameters live in global local-storage settings, not the project ([settings](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/settings.ts#L67-L139)).

The exporter can generate a separate 4x-or-larger effect copy while retaining the clean export ([effect export](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/dialogs/pf-export-dialog.ts#L408-L548)). That is a coherent feature, but calling both this and project editing operations “effects” invites false expectations. Label CRT as a **display effect** or **export look** and keep it outside project history and project-layer semantics.

## How established editors divide the space

### Aseprite: pixel-first, mostly destructive

Aseprite's current model is a useful 1.0 reference because it keeps editing operations direct:

- [Adjustments](https://www.aseprite.org/docs/adjustments/) such as brightness/contrast, hue/saturation, and curves modify selected cels or the selected timeline range.
- [FX](https://www.aseprite.org/docs/fx/) such as outline and convolution filters are applied operations rather than persistent effect nodes.
- The [shading ink](https://www.aseprite.org/docs/shading/) walks through colors in an ordered palette ramp to shade or lighten pixels.
- [Lock Alpha ink](https://www.aseprite.org/docs/ink/) preserves alpha while recoloring existing pixels, which covers many sprite-shading workflows without a clipping stack.
- The [gradient tool](https://www.aseprite.org/docs/context-bar/) supports linear and radial shapes and Bayer 2x2, 4x4, and 8x8 dithering.

Aseprite's public roadmap lists mask layers and real-time FX layers for a later release rather than as part of the current layer model ([roadmap](https://www.aseprite.org/roadmap/)). This is strong evidence that excellent pixel-art effects do not require a Photoshop-like live graph at the base-feature stage.

Its scripting API exposes the same operations as semantic commands, including adjustment and FX commands with optional UI ([command API](https://www.aseprite.org/api/app_command/)). Pixel Forge should adopt the semantic-command shape, not Aseprite implementation code. Aseprite's source distribution is governed by its own EULA, which does not permit redistribution as though it were a permissive dependency ([Aseprite EULA](https://github.com/aseprite/aseprite/blob/main/EULA.txt)).

The Aseprite file format stores layers, groups, blend modes, layer and cel opacity, links, and pixel data, but defines no interoperable persistent effect-stack or modern mask-layer chunk ([file specification](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md)). Pixel Forge cannot round-trip native live effects through `.aseprite` without flattening or private extension data.

### Pixelorama: destructive effects plus a live layer stack

Pixelorama demonstrates both sides of the boundary:

- Its [image effects](https://pixelorama.org/user_manual/image_effects/) are destructive, previewable operations with scopes ranging from selected cel to multiple frames. Gradient map, drop shadow, outline, palettize, posterize, and linear/radial gradients are part of this family.
- Its [layer effects and clipping masks](https://pixelorama.org/concepts/layer/) are non-destructive. Effects are ordered per layer and evaluated for preview/export. A clipping mask uses the nontransparent pixels of the layer directly below.
- Its [shading tools](https://pixelorama.org/user_manual/shading/) include value changes, hue shifting, and walking through ordered palette colors.

Pixelorama persists clipping, hierarchy, opacity, effect enablement, shader identity, and effect parameters in its project model ([current layer serialization](https://github.com/Orama-Interactive/Pixelorama/blob/master/src/Classes/Layers/BaseLayer.gd#L323-L395)). That is not a small UI toggle: it is a rendering and serialization system. The stable manual says live layer effects cannot be animated; current source contains animated-parameter structures, so that capability should be treated as evolving rather than copied into Pixel Forge's 1.0 promise.

Pixelorama is MIT-licensed ([license](https://github.com/Orama-Interactive/Pixelorama/blob/master/LICENSE)), but its Godot/GDScript shader architecture does not directly fit Pixel Forge's browser/TypeScript canvases. Published behavior is the valuable reference. A code port would still require attribution, provenance review, tests, and a deliberate Pixel Forge license policy.

### Photoshop and Krita: powerful graphs with a large contract surface

Photoshop's [clipping masks](https://helpx.adobe.com/photoshop/using/revealing-layers-clipping-masks.html) use a base layer's nontransparent content to constrain consecutive layers above. [Adjustment layers](https://helpx.adobe.com/ie/photoshop/desktop/create-manage-layers/color-adjustment-fill-layers/work-with-adjustment-and-fill-layers.html) apply non-destructive color transforms, including gradient maps, and [masks](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/color-adjustment-fill-layers/use-layer-masks-to-target-adjustment-or-fill-layers.html) control their spatial scope.

Krita separates [filter layers](https://docs.krita.org/en/reference_manual/layers_and_masks/filter_layers.html), which affect content below, from [filter masks](https://docs.krita.org/en/reference_manual/layers_and_masks/filter_masks.html), which affect a chosen layer. Its broader [layer and mask model](https://docs.krita.org/en/user_manual/layers_and_masks.html) includes group and pass-through behavior, alpha inheritance, transparency masks, and transform masks.

These are useful long-term models, but adopting them means defining a render graph, group isolation, mask coordinate systems, cache invalidation, serialization compatibility, thumbnails, animation behavior, GPU fallback, and export flattening. That is post-1.0 architecture, not a collection of menu items.

## Options considered

### A. Destructive effects only

Add preview-and-apply effects and leave layers unchanged.

Advantages: smallest persistence surface, straightforward history, reliable Aseprite export, and easy automation.

Costs: clipping remains unavailable, repeated edits degrade pixels, and users cannot revise parameters later.

This is safe but undershoots a useful base layer workflow.

### B. Full non-destructive graph now

Add live effect stacks, adjustment layers, masks, clipping, groups, and custom shaders together.

Advantages: maximum creative flexibility and parity with general image editors.

Costs: requires a new compositor, native-file versioning, cache graph, GPU/CPU parity, animation rules, mobile interaction design, export compatibility policy, and much larger automated testing surface.

This is not credible for 1.0 while basic composition and hierarchy persistence are incomplete.

### C. Canonical compositor plus destructive effects and clipping

Fix composition first; add a reusable destructive-effect transaction and narrowly defined sibling clipping. Defer parameter-bearing live nodes.

Advantages: delivers the highest-value pixel-art workflows, establishes API semantics, protects file/export fidelity, and leaves a clean path to live effects.

Costs: clipping still adds one persistent relation, and destructive parameters cannot be edited after Apply.

**Choose C.**

## 1.0 scope

### 1. One canonical compositor

Create a pure composition service used by:

- the editing canvas;
- preview and animation playback;
- project thumbnails;
- PNG and WebP export;
- animated WebP and spritesheet export;
- the Editor Command API's offscreen render command.

Its input must be an explicit project/frame snapshot, never ambient active-editor state. It must define, in order:

1. sibling and group ordering;
2. visibility;
3. cel opacity multiplied by layer opacity;
4. clipping alpha;
5. blend mode;
6. optional display/export look, only when requested.

Before clipping ships, persist current hierarchy and lock state or explicitly remove unsupported hierarchy behavior from the contract. Add versioned migration coverage for every new native field. Existing projects default to unclipped layers and preserve their current appearance.

### 2. Destructive-effect transaction

Build one framework shared by dialogs, tools, automation, and later plugins. An effect definition contains:

- stable effect ID and schema version;
- typed, bounded, serializable parameters;
- allowed targets;
- indexed/RGBA palette policies;
- deterministic implementation;
- preview cost hint;
- compatibility metadata.

The transaction captures source pixels, selection, explicit target IDs, and palette revision at start. Preview renders from the captured source rather than accumulating changes. Apply writes RGBA and index buffers together and creates one history command. Cancel restores the exact source and creates no command. A stale preview result must not overwrite a newer request.

Supported targets for 1.0 should be explicit and modest:

- current selection or entire current cel;
- selected cels/frames when already expressible by timeline selection;
- never a hidden implicit “all project content” default.

For multi-frame effects, process frames sequentially with progress and cancellation. One Apply remains one semantic command, even if the command stores multiple cel diffs.

### 3. Pixel-art effect set

#### Gradient map

Map source luminance to an ordered list of palette stops. Provide reverse and editable stop order. Indexed projects default to existing-palette output. If interpolation falls between stops, use either a constant nearest stop or deterministic Bayer dithering; never silently create hundreds of colors.

This is a destructive image effect, distinct from drawing a spatial gradient.

#### Hard-edged shadow and outline

Ship a combined pixel-outline/shadow family with:

- integer X/Y offset;
- integer thickness/radius;
- palette color or index;
- outside, and inside only if its semantics remain simple;
- no blur, glow, or fractional offset in 1.0.

Operate from source alpha and write hard pixels. This is useful for sprite readability and UI assets without requiring convolution or multi-pass GPU filters.

#### Palette-step shading

Let the artist designate or order a palette ramp, then move affected pixels one or more steps darker/lighter. This should be available as a direct shading ink/tool; applying it to a selection can reuse the same semantic effect definition. Preserve transparency and make edge behavior explicit: clamp or wrap, with clamp as the default.

#### Complete spatial gradient fill

Repair the existing tool rather than creating another:

- linear and radial modes;
- selection-aware bounds;
- constant, Bayer 2x2, 4x4, and 8x8 output;
- explicit palette policy;
- correct dirty bounds, undo, RGBA/index synchronization, and animation-cel targeting.

### 4. Simple clipping-to-below

Add a persisted `clippedToBelow` layer property with these rules:

- only renderable image/text siblings can be clipped in 1.0;
- the base is the nearest preceding non-clipped renderable sibling in the same parent;
- consecutive clipped layers share that base;
- clipping uses the base's effective alpha before the clipped layer's blend operation;
- moving, deleting, hiding, or changing the base must produce deterministic behavior;
- an invalid or missing base makes the layer unclipped and raises a visible validation warning rather than hiding artwork silently.

Do not imply full mask support. Group-as-mask, pass-through/isolation subtleties, cross-group clipping, and clipping an adjustment layer remain post-1.0.

### 5. Native-file and export fidelity

Increment the native project schema for persisted hierarchy, lock, cel opacity, and clipping fields. The exact split can be multiple compatible migrations, but every migration must preserve old projects and provide round-trip tests.

All raster exports use the canonical compositor. Native Pixel Forge files retain clipping as editable structure.

The Aseprite writer currently exports flat normal-type layer chunks, child level zero, and cel opacity 255 ([writer layer chunks](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-writer.ts#L96-L159)). For `.aseprite` export:

- destructive effects need no special representation because pixels contain the result;
- unclipped structures use supported native layer data;
- clipping must be flattened into a compatible exported copy or block with a clear compatibility explanation;
- never silently omit clipping, effects, masks, opacity, or blend behavior.

Add a preflight compatibility report before writing any format that cannot preserve project semantics.

### 6. Editor Command API contract

The public automation/plugin direction should expose product actions, not DOM clicks or tool-internal pointer events. Suggested first contracts:

```ts
effects.listDefinitions()
effects.apply({ projectId, effectId, target, params, palettePolicy })
effects.beginPreview({ projectId, effectId, target, params, palettePolicy })
effects.updatePreview({ previewId, params })
effects.commitPreview({ previewId })
effects.cancelPreview({ previewId })

layers.setClipping({ projectId, layerId, clipped })
render.compositeFrame({ projectId, frameId, includeDisplayEffect: false })
exports.analyzeCompatibility({ projectId, format })
```

Every mutating command must accept explicit project/layer/frame/cel IDs, validate effect and parameter schema versions, return normalized parameters and affected IDs, and emit one semantic history event. Dither/noise algorithms must accept a deterministic seed. The UI should call the same commands used by automation, making live testing evidence representative of the product.

Raw shader source is not a 1.0 plugin API. A future plugin effect should first declare its input/output, parameter schema, deterministic behavior, palette contract, execution budget, and serialization identifier.

### 7. Tablet, phone, and performance contract

Pixel Forge's current drawing and timeline input contains mouse-specific paths, so effect UI must not reproduce those limitations. Use pointer events, native controls, keyboard focus, and large touch targets. A tablet can receive the full effect sheet with a canvas preview and fixed Apply/Cancel actions. A phone should initially expose focused edits and preset application, not promise the complete desktop workspace.

CPU output is canonical and must work without WebGL2. GPU preview is an optimization. The current view-effect pipeline performs a full texture upload per render and supports one effect, so it is not a ready-made project compositor.

Performance rules:

- throttle preview changes and abort stale work;
- cache by source revision, target, effect ID/version, and normalized parameters;
- use dirty bounds when an algorithm permits;
- show progress/cancel for multiple frames;
- fall back from GPU/context loss without corrupting pixels;
- benchmark before moving work to a worker.

`OffscreenCanvas` can run 2D, WebGL, and WebGL2 contexts in workers ([HTML standard](https://html.spec.whatwg.org/multipage/canvas.html)), making it a possible measured optimization. It is not required for the first correct implementation.

## Post-1.0

Sequence these only after the 1.0 compositor and effect definitions prove stable:

1. per-layer live effect stacks with enable/reorder/edit controls;
2. grayscale layer masks and effect masks;
3. adjustment/filter layers with group-scoped evaluation;
4. group isolation and pass-through semantics;
5. animated or keyframed live-effect parameters;
6. soft shadow, blur, glow, and general convolution;
7. safe plugin-provided effect definitions;
8. transform masks and other non-destructive geometry;
9. 3D-layer integration, if separately validated as a Pixel Forge outcome.

Custom shader files, arbitrary effect graphs, and renderer replacement are explicitly rejected for 1.0. PixiJS and its filter ecosystem are permissively licensed, but filters add GPU and memory cost and adopting Pixi would introduce a second scene/rendering architecture rather than solve Pixel Forge's contract divergence ([PixiJS filter guidance](https://pixijs.com/8.x/guides/components/scene-objects)).

## Licensing and dependency rule

Pixel Forge currently declares no package license and has no repository license file at the baseline commit. Resolve the product's own license before copying third-party implementation code.

For this work:

- do not integrate Aseprite source;
- prefer clean-room implementations from documented behavior and algorithms;
- consider small MIT-licensed code only after license compatibility, notices, provenance, maintenance, and browser-bundle cost are reviewed;
- do not add a rendering-engine dependency for the 1.0 effects slice;
- keep the deterministic CPU algorithm as the portable source of truth.

## Acceptance evidence for the eventual delivery slices

The implementation plan should require automated contract tests plus manual live tests.

Automated evidence:

- editor, preview, thumbnail, and every raster export produce identical pixels for a fixture matrix of opacity, blend mode, cel opacity, and clipping;
- every destructive effect preview is cancel-safe and Apply creates exactly one undoable command;
- RGBA and indexed buffers remain synchronized across apply, undo, redo, save, and reload;
- old native projects migrate without appearance changes;
- `.aseprite` incompatibilities are flattened explicitly or blocked, never dropped;
- command API calls are deterministic and do not depend on active UI focus;
- touch/pointer interaction tests cover effect controls where practical.

Manual evidence on representative desktop, tablet, and phone viewports:

- compare on-canvas result to PNG, animated export, and spritesheet output;
- apply/cancel/undo each effect on one cel and a multi-frame target;
- reorder, hide, delete, and regroup clipped/base layers;
- test indexed palettes at normal size and at the 256-color boundary;
- stress a large canvas and a long selected frame range, including cancellation;
- disable or lose WebGL and confirm the canonical result remains available;
- drive the same scenarios through the Editor Command API and compare pixels.

## Roadmap classification

| Capability | Classification | Dependency |
| --- | --- | --- |
| Canonical editor/preview/export compositor | 1.0 foundation | None; do first |
| Persisted hierarchy, lock, cel opacity, clipping migration | 1.0 foundation | Canonical layer contract |
| Destructive-effect transaction and preview | 1.0 | History and indexed-buffer repair |
| Gradient map | 1.0 | Effect transaction |
| Hard-edged shadow and outline | 1.0 | Effect transaction |
| Palette-step shading | 1.0 | Ordered palette-ramp UX |
| Linear/radial dithered gradient repair | 1.0 | Tool/history repair |
| Clipping-to-below | 1.0 | Canonical compositor and persisted hierarchy |
| CRT display/export look clarification | 1.0 cleanup | Export fidelity |
| Editor Command API for effects/render/preflight | 1.0 | Same semantic commands as UI |
| Live layer effect stacks | Post-1.0 | Cacheable render graph |
| Adjustment layers and masks | Post-1.0 | Live effects, groups, mask model |
| Animated live-effect parameters | Post-1.0 | Stable live effects and timeline contract |
| Soft/multi-pass effects | Post-1.0 | Performance architecture |
| Plugin/raw custom shaders | Post-1.0 or rejected unless sandboxed | Plugin security and compatibility policy |
| Pixi/second renderer adoption | Rejected for 1.0 | Would widen architecture rather than consolidate it |

## Recommended issue slicing

Keep the work as capabilities and delivery slices rather than one “effects” epic:

1. **Composition fidelity:** one compositor and parity tests across editor, preview, thumbnails, and exports.
2. **Persisted composition state:** hierarchy, lock, cel opacity, clipping fields, migration, and round trips.
3. **Effect transaction:** typed definitions, targets, preview lifecycle, one-command history, indexed synchronization.
4. **Gradient foundations:** repair gradient fill and add gradient map.
5. **Sprite finishing:** hard shadow/outline and palette-step shading.
6. **Clipping UX:** sibling rule, reorder/delete validation, command API, and export preflight.
7. **Automation surface:** explicit-ID render/effect/clipping commands and a browser-driven conformance suite.
8. **Post-1.0 discovery:** live stacks, adjustment layers, masks, and plugin execution model, only after the above is live-tested.

This ordering consolidates the base instead of treating every attractive effect as an independent idea. Each visible feature lands on a tested composition, persistence, history, mobile, export, and automation contract.
