# Tilemap, audio-track, and 3D workflow fit

Research ticket: [#437](https://github.com/Flow-Fly/pixel-forge/issues/437)

Pixel Forge baseline: [`origin/develop` at `d737ac42`](https://github.com/Flow-Fly/pixel-forge/tree/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c)

Researched: 2026-08-04

## Decision summary

These are three separate product decisions, not an “advanced layers” bundle.

| Capability | Real fit for the primary solo creator | Recommendation | Why not 1.0? |
| --- | --- | --- | --- |
| Tilemap authoring | Strong for game tilesets, repeated environments, and in-context tile iteration. | **Post-1.0** | It introduces shared tilesets, tile-index cels, tile transforms, editing modes, a tiles panel, and map/tileset exports while the base layer/persistence/export contracts still need consolidation. |
| Animation audio tracks | Real but narrower for dialogue, impacts, rhythm, and timing animation to a reference track. | **Post-1.0, conditional** | A trustworthy feature needs audio persistence, deterministic scrubbing/playback, browser/mobile policy handling, and a video/muxing export decision. None belongs in the 1.0 image/sprite contract by accident. |
| 3D reference/layer support | Useful for pose, perspective, lighting, and turnarounds, but native editable scenes redefine the product. | **Reject as a core layer type** | A real 3D layer requires a scene graph, model/material import, cameras, lights, gizmos, depth rendering, new exports, and a large cross-device test surface. Use raster references now and external/plugin integration later. |

No capability in this ticket should enter the 1.0 feature baseline. That is not a judgment that the workflows have no value; it is a judgment about what can be made durable, interoperable, mobile-aware, and automatable without weakening the editor's current contract.

## Pixel Forge boundary used for the evaluation

Pixel Forge is currently a local-first browser/PWA editor whose shared project format is a pixel canvas with image/group/text/reference layers, frame cels, palette, tags, and Guided Drawing data ([project contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts#L1-L117)). The animation clock advances raster frames using per-frame millisecond durations ([playback](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/playback.ts#L29-L118)). Exports are PNG, still/animated WebP, sprite sheets, a limited Aseprite file, and `.pf` ([export formats](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/components/dialogs/pf-export-dialog.ts#L28-L60)).

The repository has no public editor/plugin automation API. The cost estimates below therefore include defining stable, project-scoped commands and serializable identifiers—not merely exposing whatever UI implementation happens to exist.

The rubric is the same for each capability:

1. Does it solve a frequent solo static-art or frame-animation workflow?
2. Can its document model survive local save, future sync, migration, import/export, undo, and recovery?
3. Can the UI remain understandable on desktop and have an intentional tablet/phone story?
4. Can automation drive it deterministically without simulating pointer gestures?
5. Is the permanent maintenance surface proportional to the primary workflow?

## 1. Tilemap authoring

### Workflows it would unlock

- Draw a reusable door, wall, grass edge, terrain transition, or prop once and update every placed instance.
- Paint a small room/level mockup while editing the tileset, catching seams and context problems without switching applications.
- Stamp single tiles or multi-tile patterns; rotate/flip variants without duplicating pixels.
- Build animated water, torches, or environmental tiles using the existing frame timeline.
- Import an existing tilesheet as a tileset, arrange a preview/map, then export both texture pixels and stable tile IDs for a game pipeline.

This is more than Pixel Forge's current visual tile grid. A tilemap cel stores tile references and transform bits, while the tileset owns the reusable pixels. Editing one tile can intentionally affect many map cells.

### What other tools actually implement

**Aseprite.** Its official [tilemap documentation](https://www.aseprite.org/docs/tilemap/) uses a tilemap layer backed by a tileset and separates **Draw Pixels** from **Draw Tiles**. Pixel editing then has Manual, Auto, and Stack policies because changing a reused tile is a shared-data decision. Aseprite exposes tilesets and tiles through its [scripting API](https://www.aseprite.org/api/tileset), can [export tilesets through its CLI](https://www.aseprite.org/docs/cli/#export-tileset), and stores tilemap layers, compressed tilemap cels, transform masks, and tileset chunks in the [`.ase` specification](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md#cel-chunk-0x2005).

**Pixelorama.** Its [tilemap workflow](https://pixelorama.org/user_manual/tilemaps/) similarly makes tilesets project resources shared by tilemap layers. It adds rectangular, isometric, and hexagonal shapes, a dedicated tiles panel, draw-pixels/draw-tiles modes, Manual/Auto/Stack mutation behavior, place-only maps, random placement from a multi-tile selection, and cell rotation/flips. Its [Aseprite importer](https://pixelorama.org/user_manual/Import/#importing-aseprite-files) explicitly preserves tilemap layers, tilesets, offsets, and cell transforms.

**Tiled.** Tiled shows where “just a tilemap” grows when the product becomes a level editor: stamp memory, random/terrain painting, orthogonal/isometric/hex maps, tile/object/image/group layers, collision shapes, custom properties, infinite maps, and engine-oriented JSON/TMX output ([introduction](https://doc.mapeditor.org/en/stable/manual/introduction/), [layer model](https://doc.mapeditor.org/en/stable/manual/layers/), [JSON format](https://doc.mapeditor.org/en/stable/reference/json-map-format/)). Pixel Forge should not absorb that level-design surface.

### Pixel Forge contract and cost

| Surface | Minimum credible tilemap contract | Cost / risk |
| --- | --- | --- |
| Document | Versioned `tilesets[]` with stable IDs, tile dimensions/shape, image/index data and ownership; tilemap layer/cel with grid origin/size, tile IDs, empty value, X/Y/diagonal transforms, and link/copy semantics across frames. | **High.** Shared mutable tiles make deletion, reindexing, palette changes, resize, copy/paste, undo, recovery, and sync conflicts materially different from raster cels. |
| UI | Create/import/manage tilesets; tiles panel; draw-pixels vs draw-tiles mode; explicit Manual/Auto/Stack behavior; tile picker/stamp; transform/random controls; warnings for destructive tileset replacement. | **High.** This is a second editing grammar inside the same canvas and timeline, not another layer menu entry. |
| Export | Flattened image/sprite exports plus a deliberate machine-readable tilemap contract and tileset image export. Aseprite export/import needs layer type 2, tilemap cel type 3, and tileset chunk support. | **High.** Tile IDs and transform flags must remain stable; Tiled/engine formats cannot be promised generically because their object/property models exceed the scoped feature. |
| Mobile | Select tiles, switch pixel/tile mode, pan a map, and place stamps without hover/right-click/modifier dependence; panel must not crowd the drawing viewport. | **Medium-high.** A tablet layout is plausible; a phone layout needs a purpose-built tiles drawer and large-target mode switcher. Pixelorama itself describes its Android build as tablet-oriented and not adapted to phones ([installation](https://pixelorama.org/user_manual/installation/#android)). |
| Automation API | List/create/import tilesets; stable tile IDs; read/write tile cells in bounded regions; create stamps; edit tile pixels with an explicit shared-mutation policy; export tileset/map. All operations must be undoable transactions. | **High initially, good payoff later.** Tilemap operations are naturally structured and testable once the domain exists. Aseprite's API demonstrates that tileset/tile/layer objects and tool-mode parameters are required, not just `useTool("pencil")` ([tool API](https://www.aseprite.org/api/app#appusetool)). |
| Maintenance | Golden round trips, tile mutation/reference integrity, large sparse map performance, every palette/index migration, Aseprite compatibility, responsive/touch input, and export fixtures. | **High and permanent.** Pixelorama's 2026 release notes record a tilemap refactor that changed isometric handling and advised backups, illustrating the migration risk ([releases](https://github.com/Orama-Interactive/Pixelorama/releases)). |

Pixel Forge's current Aseprite parser knows that layer type `2` means tilemap but parses no tileset chunk or compressed tilemap cel, and the importer keeps only normal layers ([parser boundary](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-parser.ts#L8-L18), [import filter](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/aseprite-service.ts#L41-L58)). That compatibility gap must not be mistaken for a nearly finished feature.

### Recommendation: post-1.0

Tilemap authoring has the strongest product fit of these three ideas, but it is a **post-1.0 capability**. Its first approved scope should be narrower than Tiled:

- orthogonal rectangular tiles only;
- one embedded tileset per tilemap layer, with deliberate later sharing;
- tile pixels plus tile placement, X/Y flip and 90° rotation;
- tileset image export and one documented JSON map schema;
- raster flattening for all current image/animation exports;
- no objects, collisions, terrain rules, infinite maps, isometric/hex projection, engine-specific exporters, or world editor.

Before that capability, 1.0 should only become truthful about unsupported Aseprite tilemaps: preserve safely, flatten with an explicit warning, or reject without silently dropping them. Tiled/seamless canvas preview may be a small independent drawing aid, but it is not tilemap authoring.

## 2. Animation audio tracks

### Workflows it would unlock

- Time mouth shapes to dialogue by scrubbing frame-by-frame.
- Align attacks, footsteps, impacts, or effects to sound cues.
- Animate a loop against music/rhythm and check its cadence without another editor.
- Preview a short cutscene or emote with synchronized sound, then render a shareable video.

The useful scope is reference synchronization, not audio production. Trimming, mixing, effects, recording, noise reduction, and multitrack mastering belong in an audio/video editor.

### What other tools actually implement

**Pixelorama.** An [audio layer](https://pixelorama.org/concepts/layer/#audio-layers) holds MP3/WAV data, a start frame, and mute-through-visibility; exporting the project as video includes the audio. Pixelorama stores project audio inside its `.pxo` archive ([project format](https://pixelorama.org/concepts/project/)) and delegates video output to an external FFmpeg executable ([save/export](https://pixelorama.org/user_manual/save_and_export/#export-a-video)).

**Krita.** Krita chooses a smaller reference-track model: load/remove one audio file, mute/volume, synchronized playback and frame scrubbing, optional inclusion in rendered video, no waveform, and only the external file path is saved ([audio manual](https://docs.krita.org/en/reference_manual/audio_for_animation.html)). The same manual states video export is unavailable on Android, showing that audio preview and final media export are separate platform commitments.

**Aseprite.** Aseprite's official document model is layers × frames/cels plus tags and tilesets ([sprite structure](https://www.aseprite.org/docs/sprite/)); its published `.ase` chunks define no audio track. Audio would therefore be Pixel Forge-only state and must be omitted with a warning—or exported only through a new media format—when writing Aseprite.

### Pixel Forge contract and cost

| Surface | Minimum credible audio contract | Cost / risk |
| --- | --- | --- |
| Document | Stable audio asset ID, MIME/codec, bytes or external-reference policy, start time/frame, offset, trim range, volume/mute, and derived waveform cache rules. | **High.** Embedding is portable/offline but can dominate the intended local storage budget and future sync. Referencing a path is smaller but unreliable in a browser/PWA and across devices. |
| UI | Import/remove; one or more timeline rows; play/mute/volume; offset/trim; waveform or cue visualization; scrub audio for the selected frame; clear behavior under tag loops and variable frame durations. | **Medium-high.** Pixelorama proves a minimal no-waveform design; dependable synchronization still requires an audio clock rather than treating `requestAnimationFrame` as authoritative. |
| Export | Existing PNG/WebP/sprite-sheet/Aseprite outputs remain silent. A complete share path needs a video container, audio/video codecs, muxing, progress/cancel, memory limits, and failure recovery. | **Very high.** Browser WebCodecs exposes low-level encoding but does not write playable containers; a muxing library is still required, and codec support varies by device/browser ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API#encoding_and_decoding)). |
| Mobile | Explicit user gesture to start/resume audio, interruptions/headphones/background handling, compact timeline controls, memory limits, and a stated video-export matrix. | **High.** Web Audio playback is subject to autoplay/user-activation policy ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)); peer products also narrow mobile video export. |
| Automation API | Import/replace asset bytes, set offset/trim/mute/volume, query duration, seek deterministically, and render/inspect synchronization markers. Media export must be asynchronous, cancellable, and report codec/container support. | **Medium for metadata; very high for deterministic media render.** Headless/browser automation cannot depend on audible playback to verify timing. |
| Maintenance | Decode/browser matrix, audio-context suspension/resume, clock drift, variable frame durations, waveform generation/cache, large binary persistence/sync, corrupt media, muxer/codec changes, and accessibility for audible status. | **High and permanent.** It adds a media subsystem to an image editor. |

### Recommendation: post-1.0, conditional

Do not add audio layers to 1.0. Revisit them after the base timeline has persistent, fully autosaved mutations and after product evidence shows that users are making dialogue/cutscene/rhythm animations rather than primarily game sprite loops.

If validated, the first slice should be **one read-only embedded reference track per project** with WAV plus one broadly decoded compressed format, start offset, mute/volume, frame-accurate scrub, and no waveform editing or mixing. Decide before implementation whether the feature is:

1. reference-only and intentionally absent from current exports; or
2. paired with one supported video container and a bounded browser/desktop export matrix.

That decision cannot be deferred to implementation. Multiple layer rows, recording, effects, mixing, and DAW-like editing remain non-goals. Because a referenced external path will not survive device sync, a syncable paid feature cannot use Krita's path-only model without an explicit missing-media relink workflow.

## 3. 3D reference or layer support

### Workflows it would unlock

- Pose a primitive/model and use it as perspective or anatomy reference under pixel artwork.
- Hold a camera and lighting setup constant across a character turnaround or animated frames.
- Render low-resolution lighting/shadow guides before painting over them.
- Preview a pixel texture on a model or build pixel-textured low-poly objects.

The first three are reference-generation workflows. The fourth is 3D asset creation. They share a renderer but not a small product contract.

### What other tools actually implement

**Pixelorama.** Its 3D layer is not a lightweight image reference. Every 3D cel stores mesh, lighting, camera, and environment data, rasterized to the project canvas; layers support directional/spot/point lights, primitive meshes, text, and imported OBJ models ([layer model](https://pixelorama.org/concepts/layer/#3d-layers)). A dedicated 3D Shape Edit tool is enabled for those layers ([tools](https://pixelorama.org/user_manual/tools/#transformation-tools)). This is an embedded scene editor.

**Blockbench.** Blockbench demonstrates the domain surface for model-oriented pixel work: UV generation, 2D and direct-on-model texture painting, outliner, model formats, rigging/keyframe animation, and plugin-defined formats ([product](https://www.blockbench.net/), [format matrix](https://www.blockbench.net/wiki/blockbench/formats/)). It can keep an external image editor in the loop and refresh the texture, which is a cleaner boundary for Pixel Forge than duplicating the model editor.

**Crocotile 3D.** Crocotile turns 2D tilesets into 3D scenes and owns draw/edit modes, 3D axes/placement planes, UVs, scene objects, cameras, lights, animation, rigging, and OBJ/glTF/GLB/DAE import/export ([official overview](https://www.crocotile3d.com/), [documentation](https://www.crocotile3d.com/howto.html)). The breadth is evidence that editable 3D is a product category, not a reference-layer increment.

**Aseprite.** Its file format's layer types are normal, group, and tilemap; the separate reference flag still refers to a 2D layer ([format](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md#layer-chunk-0x2004)). There is no interoperable Aseprite 3D layer to target, so round-trip requires flattening.

### Pixel Forge contract and cost

| Surface | Minimum credible 3D-layer contract | Cost / risk |
| --- | --- | --- |
| Document | Scene graph; stable node IDs; primitives and imported model buffers; transforms; camera/projection; lights/environment; materials/textures; per-frame ownership/links; renderer/version metadata. | **Extreme.** Model bytes and textures expand local/sync storage, and renderer changes can change the raster result of an unchanged project. |
| UI | 3D viewport navigation; object selection/outliner; translate/rotate/scale gizmos; camera and projection controls; lights/materials; model import errors; raster/reference mode; interaction with the 2D timeline and layer stack. | **Extreme.** These controls compete with the pixel canvas, selection transform, timeline, and narrow-screen layout. |
| Export | Deterministic raster flatten for every frame, plus an explicit choice to reject or support model export. Aseprite and current image outputs cannot preserve editable 3D state. | **High even when raster-only.** Camera, depth, alpha, lighting, texture filtering, color space, and GPU variance become output contracts. Model export would add a second product. |
| Mobile | One-/two-finger camera navigation, object picking and gizmos without hover/modifiers; GPU/memory fallback; context-loss recovery; usable properties/outliner layout. | **Extreme.** A phone cannot inherit the desktop scene UI, while inconsistent GPU output undermines reference/reload trust. |
| Automation API | Create/import nodes and assets; traverse scene graph; set transforms/camera/lights/materials; render deterministically; select and inspect objects; dispose resources. | **Extreme.** This is a versioned 3D scene API, not exposing the existing drawing tools. |
| Maintenance | Model parser security/compatibility, WebGL resource lifetime/context loss, shaders, depth/transparency, camera math, GPU/browser/device variance, large fixtures, performance budgets, and 2D/3D undo integration. | **Extreme and weakly shared with the core editor.** |

Pixel Forge's current WebGL2 code is a full-canvas 2D post-processing pipeline: depth and stencil are disabled, one 2D source texture is uploaded, and an effect shader renders it ([pipeline](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/view-effects/pipeline.ts#L12-L49), [initialization](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/view-effects/pipeline.ts#L68-L93)). It is useful for CRT/effects, but it is not a latent scene graph, camera, depth renderer, or model loader.

### Recommendation: reject as a core layer type

Reject editable 3D layers from the Pixel Forge core roadmap. The permanent cost is disproportionate to the solo sprite creator and would duplicate tools whose primary job is 3D.

Keep the existing 2D reference-layer workflow—currently embedded PNG/JPEG/WebP bytes with position, scale, desaturation, and above/below placement ([reference import](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/reference-import-action.ts#L4-L41))—and improve it with multiple references, opacity, pinning, grouping, and frame-aware reference sets if user evidence supports those needs.

After the editor automation/plugin API exists, a separate integration can ask Blockbench, Crocotile, Blender, or another renderer for a raster snapshot/turnaround and insert that output as a normal reference layer. The integration boundary should exchange image bytes plus source metadata; Pixel Forge should not own the foreign scene or promise to round-trip it. That is an alternative to the rejected core feature, not a deferred 3D layer.

## Roadmap consequences

These verdicts should remain independent issues and milestones:

1. **1.0:** no authoring scope from this ticket. Make unsupported Aseprite data non-destructive and truthful; consolidate current persistence/export/history/accessibility/mobile contracts.
2. **Post-1.0 tilemap capability:** strongest of the three, scoped as tile artwork plus a small orthogonal placement preview—not a level editor.
3. **Post-1.0 audio decision gate:** require evidence of sound-synchronized animation and decide reference-only versus video export before slicing implementation.
4. **Rejected core 3D layer:** keep external-tool raster reference/plugin integration as the escape hatch, without a core scene model.

The public editor API should be designed from the accepted domain commands. Tilemap operations can eventually become structured API methods; audio adds asynchronous media jobs; 3D should remain an external integration that returns a raster reference. Do not make the API generic enough to imply all three are supported just because they can all be called “layers.”

## Primary sources

- Pixel Forge: [shared project contract](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/shared/src/project.ts), [animation playback](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/stores/animation/playback.ts), [Aseprite parser/import](https://github.com/Flow-Fly/pixel-forge/tree/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services), [view-effect pipeline](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/services/view-effects/pipeline.ts).
- Aseprite: [Tilemap](https://www.aseprite.org/docs/tilemap/), [CLI](https://www.aseprite.org/docs/cli/), [Lua API](https://www.aseprite.org/api/), [file specification](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md).
- Pixelorama: [Tilemaps](https://pixelorama.org/user_manual/tilemaps/), [Layer types](https://pixelorama.org/concepts/layer/), [Import compatibility](https://pixelorama.org/user_manual/Import/), [Save/export](https://pixelorama.org/user_manual/save_and_export/), [CLI](https://pixelorama.org/user_manual/cli/), [mobile status](https://pixelorama.org/user_manual/installation/).
- Tiled: [Introduction](https://doc.mapeditor.org/en/stable/manual/introduction/), [Layers](https://doc.mapeditor.org/en/stable/manual/layers/), [tile-layer editing](https://doc.mapeditor.org/en/stable/manual/editing-tile-layers/), [JSON format](https://doc.mapeditor.org/en/stable/reference/json-map-format/).
- Krita: [Audio for Animation](https://docs.krita.org/en/reference_manual/audio_for_animation.html).
- Blockbench: [Product capabilities](https://www.blockbench.net/), [formats](https://www.blockbench.net/wiki/blockbench/formats/), [pixel-texture workflow](https://www.blockbench.net/wiki/guides/bedrock-modeling/#texturing).
- Crocotile 3D: [Product capabilities](https://www.crocotile3d.com/), [documentation](https://www.crocotile3d.com/howto.html).
- Browser media: [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), [Web Audio autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
