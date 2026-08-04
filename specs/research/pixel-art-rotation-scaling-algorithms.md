# Pixel-art rotation and scaling algorithms

**Status:** Research decision for [issue #435](https://github.com/Flow-Fly/pixel-forge/issues/435)  
**Map:** [Pixel Forge 1.0 trustworthy creative editor and automation plan](https://github.com/Flow-Fly/pixel-forge/issues/432)  
**Investigated:** 2026-08-04  
**Pixel Forge baseline:** [`origin/develop` at `d737ac4`](https://github.com/Flow-Fly/pixel-forge/tree/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c)

## Decision

For 1.0, **keep and harden Pixel Forge's existing CleanEdge-based transform** instead of integrating a second production algorithm now. Keep nearest-neighbor as the literal-pixel control and use exact, lossless paths for quarter turns and integer scaling.

Before calling the transform production-ready:

1. restore the upstream CleanEdge MIT notice and record the local modifications;
2. make alpha and palette behavior explicit and testable;
3. add exact 90/180/270-degree paths;
4. move expensive previews off the main thread while keeping a deterministic committed result;
5. establish a checked-in visual corpus, invariant tests, and browser performance budgets.

Prototype **Aseprite's MIT RotSprite implementation** and **Pixelorama's MIT Rotxel implementation** against that corpus. Adopt one only if it wins a defined visual or performance use case. Do not expose an algorithm picker merely because several implementations exist.

Treat **OmniScale** as a possible later RGBA reconstruction effect, not the default pixel-preserving transform. Treat **MMPX** as a possible later exact-2x scaling option, not a rotation replacement.

## Why scaling and rotation need separate decisions

CleanEdge, OmniScale, Scale2x, and MMPX are reconstruction or scaling algorithms. They decide what a source pixel grid means between pixel centers. RotSprite and Pixel Forge's current rotation pipeline combine an enlargement algorithm with a geometric rotation and a reduction step.

That distinction matters because a good integer upscaler does not automatically define:

- the inverse mapping used during rotation;
- the pivot and output bounds;
- how an enlarged result is reduced;
- whether the result may introduce colors;
- how partial alpha is handled;
- whether repeated committed transforms drift.

The 1.0 contract should specify the complete transform pipeline, not just name an upscaler.

## What Pixel Forge currently does

### Rotation pipeline

Pixel Forge contains a TypeScript CPU port of torcado's CleanEdge shader. For each destination pixel, it inspects a neighborhood and chooses among inferred edge slices. The current committed rotation then:

1. enlarges the source with CleanEdge at 2x for draft or 4x for final quality;
2. inverse-maps an arbitrary-angle rotation with nearest-neighbor sampling;
3. area-averages blocks back down by the same factor.

Sources:

- [`clean-edge.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/rotation/clean-edge.ts#L25-L225)
- [`clean-edge-core.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/rotation/clean-edge-core.ts)
- [`basic-rotation.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/rotation/basic-rotation.ts)

This is not simply "CleanEdge rotation." CleanEdge reconstructs the enlarged grid; Pixel Forge owns the rotation, reduction, alpha, bounds, and performance behavior around it.

### Scaling pipeline

Draft scaling uses nearest-neighbor. Final scaling uses different branches:

- integer uniform enlargement: CleanEdge directly;
- fractional or non-uniform enlargement: CleanEdge to a ceiling integer, then resize to the requested dimensions;
- integer uniform reduction: block area averaging;
- other reduction: weighted area averaging followed by a hard alpha threshold.

Source: [`scaling.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/scaling.ts#L20-L233).

### Current strengths

- Preview is recalculated from the original selection rather than repeatedly transforming the last preview, so dragging the control does not accumulate intermediate damage.
- The final transform is represented as one undoable command.
- Draft and final quality are separated.
- The implementation is local, deterministic JavaScript with no runtime dependency or network boundary.
- CleanEdge is specifically designed to keep thin pixel-art diagonals connected during enlargement.

### Correctness and product gaps

#### Palette and alpha are not preserved

The final reduction averages RGB values from all samples whose alpha is greater than zero, regardless of alpha magnitude. It then emits alpha 255 when at least half the block is nontransparent, otherwise alpha 0. Fractional scaling similarly averages RGB and thresholds alpha at 127.

Consequences:

- adjacent source colors can produce a new color;
- semitransparent source pixels become fully opaque or transparent;
- hidden RGB in low-alpha pixels can influence the result;
- indexed/palette-constrained art cannot rely on a source-palette invariant.

This is visible in [`downscaleAreaAverage`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/rotation/clean-edge.ts#L130-L180) and [`downscaleToSize`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/src/utils/scaling.ts#L156-L233).

#### Quarter turns take the lossy arbitrary-angle path

Only a normalized zero-degree rotation is special-cased. A 90-degree transform still enlarges, rotates, and averages down even though it can be implemented as an exact pixel permutation. The same applies to 180 and 270 degrees.

#### The final path is synchronous and allocation-heavy

A final rotation creates a 4x image, whose pixel count is 16 times the source, then another rotated buffer and a reduced result. A 512x512 RGBA selection's 4x enlargement alone is about 16 MiB, before the source, rotated bounds, and result. The loops run on the browser main thread; animation-frame throttling does not make the work nonblocking.

#### Transform UX is narrower than the reference tools

Pixel Forge exposes arbitrary degrees and 15-degree Shift snapping, but rotation is around a fixed center. It does not offer Aseprite's movable pivot or algorithm choice. An algorithm choice should remain deferred; a movable pivot is an independent, user-facing capability worth considering.

#### Existing tests prove survival, not fidelity

The current suite covers identity, angle normalization, broad opaque-area survival, option smoke tests, and the absence of blue on one red/green edge. It does not prove:

- exact source-palette membership;
- preservation of partial alpha;
- exact orthogonal rotations;
- golden visual output;
- repeated-transform stability;
- equality of preview and committed semantics;
- scaling behavior;
- latency or memory budgets.

Source: [`clean-edge.test.ts`](https://github.com/Flow-Fly/pixel-forge/blob/d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c/tests/utils/rotation/clean-edge.test.ts).

### License gap to fix independently of the algorithm decision

The local file credits torcado and says MIT, but it does not carry the complete copyright and permission notice required by the upstream license. Pixel Forge's package manifest also has no declared license, and this baseline has no repository-level LICENSE or NOTICE file.

The [upstream CleanEdge source at the investigated revision](https://gist.github.com/torcado194/e2794f5a4b22049ac0a41f972d14c329/91c809a60664baddc91abc151f4bf71a82b7891a) states that the notice must be included in substantial copies. This is a release-compliance issue regardless of whether CleanEdge remains the chosen algorithm. Legal interpretation and Pixel Forge's own project license remain owner decisions.

## Candidate comparison

| Candidate | What it actually is | Output properties | Browser integration | Provenance and license | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Pixel Forge CleanEdge pipeline | CleanEdge enlargement, nearest-neighbor arbitrary rotation, area reduction | Good edge continuity; current reduction introduces colors and binary alpha | Already TypeScript; large synchronous buffers | torcado CleanEdge is MIT; local notice is incomplete | **Keep and harden for 1.0** |
| Nearest-neighbor | Direct destination-to-source sampling | Source colors and alpha values preserved; arbitrary angles can produce jaggies, gaps, and uneven line widths | Trivial CPU or canvas implementation | No external dependency | **Keep as literal/fast control and exact orthogonal path** |
| RotSprite | Three Scale2x stages to 8x, rotation, then reduction | Designed for pixel-art rotations; Aseprite implementation supports indexed and RGBA formats | Port maintained MIT C++ logic to TypeScript/WASM; 8x means 64x pixel count before rotation | Aseprite's implementation file is explicitly MIT | **Benchmark challenger; do not integrate yet** |
| OmniScale | Arbitrary-factor shader reconstruction inspired by HQx patterns | Smooth diagonals and gradients; interpolation can create colors; alpha needs care | Natural GPU shader path; deterministic final output and GPU readback require design | SameBoy and Godot ports are MIT | **Possible post-1.0 RGBA effect, not default transform** |
| Rotxel | Pixelorama-specific 3x neighborhood rotation | Selects neighboring colors and can remain palette-safe; less published evidence | Portable CPU/GDScript logic, but Pixel Forge would own a new port | Pixelorama is MIT | **Low-cost prototype challenger only** |
| MMPX | Rule-based exact 2x upscaler | Preserves palette, transparency, and single-pixel features by design | Reference JavaScript, C++, and GLSL are available | Paper and reference implementations are MIT | **Post-1.0 exact-2x scaling candidate** |

## Candidate notes

### CleanEdge

[torcado's CleanEdge page](https://torcado.com/cleanEdge/) presents the algorithm as an arbitrary-factor pixel-art upscaler designed to support clean rotations. The [technical explanation](https://torcado.com/blog/cleanEdge/) focuses on preserving thin 1:1 and 2:1 diagonals, supports cleanup and color-priority controls, and acknowledges unusual scaling cases and a performance cost.

The [reference shader](https://gist.github.com/torcado194/e2794f5a4b22049ac0a41f972d14c329/91c809a60664baddc91abc151f4bf71a82b7891a) uses exact similarity by default and an explicit color-priority rule. Pixel Forge's packed TypeScript implementation is a modified port, so equivalence should be established with fixtures rather than assumed from the shared name.

**Fit:** strongest incumbent because it is already integrated and its edge model matches the product. The priority is to repair the surrounding transform contract, not swap algorithms on intuition.

### RotSprite, using Aseprite as the authoritative implementation

[Aseprite's rotation documentation](https://www.aseprite.org/docs/rotate/) exposes Fast Rotation and RotSprite and supports a movable pivot. Its [RotSprite implementation at the investigated revision](https://github.com/aseprite/aseprite/blob/717ab76b2ed9b814fda4b65eb388f6ad480ca4ee/src/doc/algorithm/rotsprite.cpp) performs three successive Scale2x passes, reaching 8x before rotation and reduction. The file carries its own MIT notice and handles RGB, grayscale, indexed, and bitmap pixel formats.

The 8x intermediate has 64 times the source pixel count, versus 16 times for Pixel Forge's final 4x CleanEdge enlargement. Exact performance still depends on the implementation, output bounds, and runtime, so memory ratio is not a latency conclusion.

**Fit:** the best benchmark reference because it is established in Aseprite, has a clear maintained implementation, supports indexed pixels, and has usable licensing. Avoid pulling an unrelated wrapper solely for convenience; an implementation should trace to the reviewed MIT source and retain its notice.

### OmniScale

[SameBoy's OmniScale shader at the investigated revision](https://github.com/LIJI32/SameBoy/blob/213a12ce93d66b105a113debd9396306066a7cfc/Shaders/OmniScale.fsh) describes an arbitrary-factor reconstruction derived from HQx-style pattern detection, with smoother gradient handling and a 16-pixel sample neighborhood. SameBoy's [license](https://github.com/LIJI32/SameBoy/blob/213a12ce93d66b105a113debd9396306066a7cfc/LICENSE) covers that shader under an MIT/Expat-style grant.

The maintained [Godot OmniScale port](https://github.com/nobuyukinyuu/godot-omniscale/tree/eec556df5bb3c735bc62c02f3a81568e6646f243) is MIT and explicitly warns that the input works best unfiltered and without alpha blending. OmniScale's interpolation is useful when smooth reconstruction is desired, but it is not a source-palette-preserving promise.

Pixelorama uses a modified no-antialiasing OmniScale shader for rotation. That is evidence that it can be adapted, not evidence that it should replace Pixel Forge's default.

**Fit:** defer until Pixel Forge has an explicit RGBA effect mode and a GPU-preview/final-output contract. It should not silently change the semantics of indexed or palette-constrained art.

### Rotxel

Rotxel appears to be a Pixelorama-specific algorithm rather than a paper or independently standardized method. The [initial Pixelorama commit](https://github.com/Orama-Interactive/Pixelorama/commit/8fd8a9db08c69cf58dbf24f39a482c0063e75f23) adds a 3x neighborhood-based rotation that chooses among source-neighborhood colors. Current behavior lives in Pixelorama's [drawing algorithms](https://github.com/Orama-Interactive/Pixelorama/blob/5abfd4d270f636696a102ca8d4611e0e1eef216a/src/Autoload/DrawingAlgos.gd); Pixelorama is [MIT licensed](https://github.com/Orama-Interactive/Pixelorama/blob/5abfd4d270f636696a102ca8d4611e0e1eef216a/LICENSE).

Pixelorama's image-effect rotation dialog offers several algorithms, but its ordinary selection transform exposes only nearest-neighbor, CleanEdge, and OmniScale in [`BaseSelectionTool.gd`](https://github.com/Orama-Interactive/Pixelorama/blob/5abfd4d270f636696a102ca8d4611e0e1eef216a/src/Tools/BaseSelectionTool.gd). That separation is a useful product signal: an effect laboratory and the everyday transform surface do not need identical menus.

"Rotxel with Smear" in Pixelorama is a temporal smear effect, not a more accurate single-angle rotation algorithm. It should be evaluated separately if Pixel Forge later adds transform effects.

**Fit:** small enough to prototype and likely palette-safe, but the evidence base is narrow. Adoption would mean maintaining another custom port. Require a visible win on named fixtures.

### MMPX

Morgan McGuire's [MMPX project page](https://casual-effects.com/research/McGuire2021PixelArt/index.html) and [peer-reviewed JCGT paper](https://jcgt.org/published/0010/02/04/paper.pdf) define a style-preserving exact-2x upscaler. The authors provide JavaScript, C++, and GLSL reference implementations under MIT and design the method to preserve the palette, transparency, and single-pixel features.

**Fit:** credible future scaling option and a useful quality benchmark. It does not define arbitrary-angle rotation, so chaining it into a rotation pipeline would be a new Pixel Forge design requiring its own evidence.

## What Pixelorama does differently

At the investigated revision, Pixelorama separates three concerns:

- its general image rotation effect exposes nearest-neighbor, Rotxel, Rotxel Smear, CleanEdge, OmniScale, and other experimental paths in [`RotateImage.gd`](https://github.com/Orama-Interactive/Pixelorama/blob/5abfd4d270f636696a102ca8d4611e0e1eef216a/src/UI/Dialogs/ImageEffects/RotateImage.gd);
- ordinary selection transforms narrow the choice to nearest-neighbor, CleanEdge, and OmniScale;
- CleanEdge and OmniScale run as shaders, while Rotxel has CPU logic.

Pixelorama also lets the effect choose a pivot and animate the angle. Recent code history includes alpha-related repairs around transforms, reinforcing that shader adoption does not remove the need for an explicit alpha contract.

The useful lesson is not to copy the full algorithm list. It is to keep experimental effects separate from the predictable everyday transform and to make pivot, alpha, palette, and preview/commit behavior first-class decisions.

## Proposed 1.0 transform contract

### User-visible modes

Keep the everyday surface small:

1. **Pixel-perfect / Nearest:** literal source-pixel sampling, exact quarter turns, integer scaling without new colors.
2. **Clean rotation:** the hardened CleanEdge pipeline for arbitrary angles, with its palette/alpha behavior stated in the UI or project mode.

Do not add an Advanced algorithm dropdown for 1.0 unless the prototype demonstrates two materially different, understandable outcomes that creators can choose between reliably.

### Data invariants

- Quarter turns are exact and reversible modulo canvas-bound changes.
- Indexed or palette-locked transforms emit only colors from the allowed palette.
- RGBA transforms use premultiplied-alpha math and retain partial alpha when the mode promises RGBA fidelity.
- Transparent pixels do not leak hidden RGB into visible edges.
- The same source, pivot, bounds, algorithm version, and parameters produce byte-identical committed output on supported browsers.
- Preview can reduce quality for responsiveness, but committing recomputes from the original source with final settings.
- Undo and redo store or reproduce the same committed bytes; they do not re-run a mutable future algorithm version against old state.

### Performance architecture

- Put arbitrary-angle preview and final computation in a worker when supported.
- Cancel or ignore stale preview requests when newer transform parameters arrive.
- Keep a pure CPU reference implementation for deterministic tests and committed output.
- Consider WebGL/WebGPU only as a preview accelerator until cross-device output equivalence is measured.
- Benchmark memory as well as elapsed time; enlarged temporary buffers dominate large selections.

## Prototype and verification gate

No candidate should be selected from screenshots chosen by its own author. Build one common, checked-in corpus and runner.

### Fixture corpus

Include small sprites that isolate:

- 1:1, 2:1, 3:1, shallow, and steep one-pixel diagonals;
- single-pixel highlights, isolated pixels, corners, holes, and concave shapes;
- outlines with both darker and lighter edge colors;
- two-color borders, limited palettes, ramps, checkerboards, and dithering;
- transparent edges, hidden RGB, and alpha values such as 1, 64, 127, 128, 192, and 254;
- indexed/palette-locked and unrestricted RGBA documents;
- odd and even dimensions and pivots on a pixel, edge, and half-pixel;
- representative 16x16, 32x32, 64x64, 256x256, and 512x512 selections.

### Transform matrix

At minimum test:

- angles 0, 1, 15, 22.5, 30, 45, 89, 90, 91, 135, 180, 270, 359, and negative equivalents;
- integer, fractional, uniform, and non-uniform scaling;
- scale then rotate, rotate then scale, repeated previews, and repeated commits;
- CleanEdge with each supported cleanup/color-priority option;
- nearest-neighbor, current CleanEdge, hardened CleanEdge, RotSprite prototype, and Rotxel prototype.

### Automated assertions

- dimensions, pivot placement, and transparent bounds are correct;
- quarter-turn output matches an exact reference permutation;
- palette mode's output set is a subset of the allowed palette;
- alpha-mode expectations are exact;
- transformations are deterministic across repeated runs;
- preview and final differences are intentional and bounded;
- golden images change only through explicit review;
- peak temporary bytes and elapsed time stay within separately approved desktop and tablet budgets.

### Human review

Render every candidate in a side-by-side contact sheet at 1x and a fixed nearest-neighbor zoom. Ask reviewers to rank named properties—line continuity, silhouette, detail retention, palette discipline, and unwanted smoothing—rather than choose a vague favorite. Include the source and nearest-neighbor control.

The gate should yield one of three outcomes per candidate:

- **integrate:** named fixture class and measurable benefit justify ownership;
- **keep as experiment/effect:** visually useful but not predictable enough for default transforms;
- **reject:** no material win over the hardened incumbent.

## Roadmap classification

### Pixel Forge 1.0

- harden the current CleanEdge and nearest-neighbor transform contract;
- add exact orthogonal paths;
- fix CleanEdge attribution and decide Pixel Forge's repository license/notice policy;
- add palette, partial-alpha, determinism, golden-image, scaling, and performance tests;
- move heavy preview work off the main thread;
- decide whether movable pivots belong in the base transform UX;
- run the RotSprite and Rotxel benchmark prototype before freezing the algorithm version.

### Post-1.0 candidates

- MMPX as an explicit exact-2x export/scale mode;
- OmniScale as an RGBA reconstruction or image effect;
- GPU preview acceleration after output-equivalence measurement;
- Rotxel Smear or animated-angle transforms as creative effects;
- an advanced algorithm menu only if real user workflows justify it.

### Not recommended now

- replacing CleanEdge based on library popularity alone;
- shipping every Pixelorama effect in the everyday selection transform;
- using a shader as the only authoritative committed-output path before determinism is measured;
- claiming palette preservation while averaging RGB;
- introducing a wrapper with a more restrictive license when reviewed MIT reference code is available;
- treating Rotxel Smear as a quality upgrade for ordinary rotation.

## Remaining uncertainties

- This research inspected source and documentation; it did not run a live visual benchmark across Pixel Forge, Aseprite, and Pixelorama.
- Rotxel has no independent specification or paper located in the primary sources reviewed here. Its identity is tied to Pixelorama's implementation history.
- Browser performance cannot be inferred from algorithmic scale factors alone. It requires the proposed corpus on supported desktop and tablet hardware.
- CleanEdge's upstream shader and Pixel Forge's modified TypeScript port have not been proven output-equivalent.
- The correct free/paid boundary is not an algorithm question. Base transforms and project readability should not depend on a paid server capability; premium effects can be decided separately.

## Primary sources

- torcado: [CleanEdge demo and license](https://torcado.com/cleanEdge/), [technical explanation](https://torcado.com/blog/cleanEdge/), [source revision](https://gist.github.com/torcado194/e2794f5a4b22049ac0a41f972d14c329/91c809a60664baddc91abc151f4bf71a82b7891a)
- Aseprite: [rotation documentation](https://www.aseprite.org/docs/rotate/), [preferences](https://www.aseprite.org/docs/preferences/), [MIT RotSprite implementation](https://github.com/aseprite/aseprite/blob/717ab76b2ed9b814fda4b65eb388f6ad480ca4ee/src/doc/algorithm/rotsprite.cpp)
- SameBoy: [OmniScale shader](https://github.com/LIJI32/SameBoy/blob/213a12ce93d66b105a113debd9396306066a7cfc/Shaders/OmniScale.fsh), [license](https://github.com/LIJI32/SameBoy/blob/213a12ce93d66b105a113debd9396306066a7cfc/LICENSE)
- Godot OmniScale: [source and MIT license](https://github.com/nobuyukinyuu/godot-omniscale/tree/eec556df5bb3c735bc62c02f3a81568e6646f243)
- Pixelorama: [MIT repository revision](https://github.com/Orama-Interactive/Pixelorama/tree/5abfd4d270f636696a102ca8d4611e0e1eef216a), [rotation effect](https://github.com/Orama-Interactive/Pixelorama/blob/5abfd4d270f636696a102ca8d4611e0e1eef216a/src/UI/Dialogs/ImageEffects/RotateImage.gd), [selection transform](https://github.com/Orama-Interactive/Pixelorama/blob/5abfd4d270f636696a102ca8d4611e0e1eef216a/src/Tools/BaseSelectionTool.gd), [drawing algorithms](https://github.com/Orama-Interactive/Pixelorama/blob/5abfd4d270f636696a102ca8d4611e0e1eef216a/src/Autoload/DrawingAlgos.gd), [Rotxel introduction](https://github.com/Orama-Interactive/Pixelorama/commit/8fd8a9db08c69cf58dbf24f39a482c0063e75f23)
- MMPX: [project and reference implementations](https://casual-effects.com/research/McGuire2021PixelArt/index.html), [JCGT paper](https://jcgt.org/published/0010/02/04/paper.pdf)
