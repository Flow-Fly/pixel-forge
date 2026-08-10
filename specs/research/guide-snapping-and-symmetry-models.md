# Guide, snapping, and symmetry models in drawing tools

Research date: 2026-08-04

## Decision in one paragraph

Other tools do **not** generally make an ordinary guide double as a mirror axis. The durable pattern is three related but distinct systems:

1. **Guides** are non-printing references, usually horizontal or vertical, with optional object/selection snapping.
2. **Drawing assistants or rulers** constrain strokes to arbitrary lines, curves, or perspective systems.
3. **Symmetry systems** duplicate strokes across explicit axes or around a center.

Pixel Forge should keep variant B's arbitrary-angle interaction, but define it as an **angled drawing guide/assistant**, not as an automatically mirrored guide. It is useful when it can constrain or snap a stroke; a passive arbitrary line alone is a smaller, more situational feature. For 1.0, visibility, snapping/assistance, and mirroring should be independent state, and arbitrary-angle reflection should remain out of scope until Pixel Forge has an explicit pixel-coverage policy.

## Terminology used here

- **Ordinary guide:** a non-exported alignment line used to position content. It may be a passive reference or a snapping target.
- **Drawing assistant/ruler:** geometry that changes the path of a stroke, such as an arbitrary straightedge, parallel ruler, ellipse, or perspective system.
- **Symmetry axis:** geometry that produces one or more additional strokes or pixels. The visible line is a representation of an active transformation, not an ordinary guide.
- **View mirror:** a non-destructive flipped canvas preview. It changes neither pixels nor input geometry and is outside this comparison.

This distinction matters because several products reuse words such as “guide” and “ruler” across these systems while preserving different behavior underneath.

## Comparison

| Tool | Ordinary guide geometry and lifecycle | Snap or drawing-assist behavior | Mirror/symmetry behavior | Visibility versus behavior |
| --- | --- | --- | --- | --- |
| **Aseprite** | The documented persistent alignment primitive is a rectangular grid; the official manual does not document freely placed ordinary guides. Grid settings can target the active document, and grid bounds are stored in the `.aseprite` header. | Grid snapping is separately toggleable. Tools also have transient angle constraints, including line angle snap and selection-rotation angle snap. | Symmetry is a separate drawing mode with movable horizontal, vertical, left-diagonal, and right-diagonal axes. Diagonal symmetry shipped in the 1.3 line; no arbitrary-angle mirror axis is documented. | Grid display and Snap to Grid are separate commands. Symmetry is toggled as a mode rather than inferred from grid visibility. ([preferences](https://www.aseprite.org/docs/preferences/), [file format](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md#header), [symmetry](https://www.aseprite.org/docs/symmetry/), [command API](https://www.aseprite.org/api/app_command), [release notes](https://www.aseprite.org/release-notes/), [keyboard and angle snapping](https://www.aseprite.org/docs/keyboard-shortcuts/)) |
| **Pixelorama** | Ordinary guides are horizontal or vertical references dragged from rulers, moved by dragging, and removed by dragging outside the canvas. The project serializer stores ordinary guide type and position. | The manual describes ordinary guides as alignment references, not stroke-snapping constraints. Rectangular and isometric grids are separate. | Drawing tools have horizontal, vertical, and, since v1.1.6, two diagonal mirror modes. Current source models the diagonal axes as fixed `x=y` / `x=-y` directions and rounds the reflected pixel back to the grid. | Mirror enablement (`Tools.*_mirror`) is separate from global guide/axis visibility (`Global.show_guides`), so axes can be hidden without disabling mirrored drawing. ([canvas manual](https://pixelorama.org/user_manual/user_interface/canvas/), [drawing manual](https://pixelorama.org/user_manual/drawing/), [v1.1.6 release](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.1.6), [guide source](https://github.com/Orama-Interactive/Pixelorama/blob/master/src/UI/Canvas/Rulers/Guide.gd), [mirror transform source](https://github.com/Orama-Interactive/Pixelorama/blob/master/src/Autoload/Tools.gd#L631-L676), [project serialization](https://github.com/Orama-Interactive/Pixelorama/blob/master/src/Classes/Project.gd#L281-L290)) |
| **Krita** | Ordinary guides are horizontal/vertical ruler drags and are saved per document. A separate assistant system supports arbitrary rulers, infinite and parallel rulers, splines, ellipses, and multiple perspective constructions; assistant sets can also be saved to `.paintingassistant` files. | Ordinary guide snapping is optional and can work while the guide is hidden. Freehand brushes separately expose Snap to Assistants. | Horizontal/vertical Mirror Tools duplicate strokes across movable axes. Rotated-axis symmetry belongs to the separate Multibrush Tool rather than ordinary guides. | Explicitly decoupled: grids/guides need not be visible for snapping, assistants may be preview-only or active, and mirror-axis lines can be hidden while mirroring remains active. ([grids and guides](https://docs.krita.org/en/reference_manual/dockers/grids_and_guides.html), [snapping](https://docs.krita.org/en/user_manual/snapping.html), [assistants](https://docs.krita.org/en/user_manual/painting_with_assistants.html), [assistant tool](https://docs.krita.org/en/reference_manual/tools/assistant.html), [mirror tools](https://docs.krita.org/en/user_manual/mirror_tools.html), [Multibrush](https://docs.krita.org/en/reference_manual/tools/multibrush.html)) |
| **GIMP** | Ordinary guides are horizontal/vertical lines created from rulers or menu commands, moved with the Move tool, and removed by dragging outside. XCF persists them as `PROP_GUIDES`. | Snap to Guides is an independent View option used for moving layers and selections. | A separate Symmetry Painting dialog supports horizontal, vertical, and central mirror modes, plus tiling and mandala modes. It does not turn ordinary guides into axes. | Show Guides and Snap to Guides are separate options. Symmetry activation is also separate from ordinary guide display. ([guides](https://docs.gimp.org/3.0/en/gimp-concepts-image-guides.html), [snap to guides](https://docs.gimp.org/3.0/en/gimp-view-snap-to-guides.html), [XCF guide data](https://developer.gimp.org/core/standards/xcf/#prop-guides-editing-state), [symmetry painting](https://docs.gimp.org/3.2/en/gimp-symmetry-dialog.html)) |
| **Photoshop** | Ordinary guides are horizontal/vertical, non-printing lines created from rulers or numeric commands, movable and lockable. PSD stores their direction and document coordinate in a Grid and Guides resource. | Snap and Snap To Guides are independent controls for selections, crops, shapes, paths, and other positioned content. Ordinary guides do not constrain freehand brush paths. | Paint Symmetry is separate and supports vertical, horizontal, diagonal, radial, mandala, and arbitrary path-based symmetry. | Ordinary guide visibility is independent from Snap. Symmetry has distinct “Off/Last Used” and “Hide/Show Symmetry” commands. ([create guides](https://helpx.adobe.com/photoshop/desktop/use-grids-measurement-guides/alignment-grids-guides/create-guides.html), [snapping](https://helpx.adobe.com/photoshop/using/positioning-elements-snapping.html), [PSD guide resource](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/), [paint symmetry](https://helpx.adobe.com/photoshop/using/paint-symmetry.html)) |
| **Procreate** | Procreate's “Drawing Guide” is a canvas-level typed system rather than a list of ruler-dragged lines. It remembers the previous setup for the current canvas and offers rotatable 2D/isometric grids and one- to three-point perspective. | Drawing Assist is an optional, per-layer constraint that aligns strokes to the selected guide system. | Symmetry is one Drawing Guide type, with vertical, horizontal, quadrant, and radial modes. Its vertical or horizontal axis can be rotated to an arbitrary angle; assist is enabled by default for symmetry. | Guide appearance (including zero opacity) and per-layer Drawing Assist are separate. A guide can be a visual cue without assistance, and assistance can be toggled without deleting its setup. ([guide creation and persistence](https://help.procreate.com/procreate/handbook/guides/guide-create), [rotatable 2D grid](https://help.procreate.com/procreate/handbook/guides/guides-2D), [perspective](https://help.procreate.com/procreate/handbook/guides/guides-perspective), [symmetry](https://help.procreate.com/procreate/handbook/guides/guides-symmetry), [Drawing Assist](https://help.procreate.com/procreate/handbook/guides/guides-drawing-assist)) |
| **Clip Studio Paint** | Horizontal/vertical Guides are one ruler subtype. The broader ruler system has arbitrary straight and curved rulers, hand-drawn rulers, parallel/radial/concentric rulers, and perspective rulers. Rulers are created on the editing layer or a new ruler-bearing layer. | Drawing follows rulers when the relevant Snap to Ruler/Special Ruler control is active. Arbitrary linear rulers support 45-degree creation constraints; perspective directions can be enabled independently. | A Symmetrical Ruler is a distinct ruler type that mirrors a stroke across one or more radial axes. It is not an ordinary Guide with an incidental mirror switch. | A ruler can remain visible while snapping is off, and its active layer/folder/canvas range is configurable. Perspective directions can also have snapping toggled individually. ([ruler overview](https://help.clip-studio.com/en-us/manual_en/510_ruler/510_ruler.htm), [ruler and guide types](https://help.clip-studio.com/en-us/manual_en/510_ruler/Basics_of_creating_rulers.htm), [perspective rulers](https://help.clip-studio.com/en-us/manual_en/510_ruler/Perspective_Rulers.htm), [perspective snap controls](https://help.clip-studio.com/en-us/manual_en/510_ruler/Drawing_along_a_perspective_ruler.htm)) |

### A useful vector-editor contrast

Illustrator permits any vector object—not just a horizontal or vertical ruler line—to be converted into a non-printing guide, and snapping targets its anchors. Its arbitrary-angle Mirror Repeat is still a separate live object feature. This is a useful precedent for a future general guide graph, but a vector engine does not face Pixel Forge's requirement that reflected pixel centers stay on a square lattice. ([Illustrator guide objects](https://helpx.adobe.com/content/dam/help/en/pdf/illustrator_reference.pdf), [Mirror Repeat axis](https://helpx.adobe.com/illustrator/desktop/paint-and-fill/create-and-edit-patterns/set-mirror-repeat-options.html))

## What the comparison says about variant B

### An arbitrary-angle line is useful, but “guide” undersells the useful part

Krita's arbitrary Ruler and Parallel Ruler, Clip Studio Paint's Linear and Parallel rulers, Procreate's rotatable grids, and Photoshop's path-based symmetry all show real demand for non-axis-aligned construction geometry. Their strongest uses are:

- drawing a clean line or repeated parallel lines at an architectural angle;
- constructing isometric/dimetric assets and perspective planes;
- retaining a slope across separated parts of a sprite or across animation frames;
- aligning transforms, selections, or shape endpoints to a shared direction;
- keeping the reference visible without baking it into exported pixels.

Variant B is therefore more valuable if its modes are explicit:

- **Reference:** passive non-exported line.
- **Snap/assist:** constrain a line tool, shape endpoint, transform handle, or optionally a freehand stroke to the guide.
- **Parallel assist:** draw at the guide's angle anywhere on the canvas; this is often more useful than forcing every stroke onto the literal visible line.

A passive arbitrary line is still useful for composition and checking a slope, but that alone probably does not justify making it a headline 1.0 feature. The 1.0 value comes from a small, predictable drawing constraint.

### “Guide + mirror” is the exception, not the default contract

Procreate calls a symmetry axis a “Symmetry Guide,” and Clip Studio Paint puts symmetry inside its Ruler family. Those are typed modes with distinct behavior, not evidence that every guide should be mirror-capable. Photoshop, GIMP, Krita, Aseprite, and Pixelorama expose symmetry separately from ordinary alignment guides. Even in Procreate, appearance and Drawing Assist are separate controls.

Pixel Forge should follow that behavioral distinction in its data model and UI vocabulary, even if both objects share rendering and drag-handle code.

## Pixel-grid constraint: arbitrary reflection is not a free extension

For square-grid pixel art, the center of every pixel lies on a translated integer lattice. Reflecting that lattice across an arbitrary-angle line usually produces non-integer coordinates. The editor must then round, resample, or spread coverage, and each choice can create gaps, collisions, asymmetry, or a different result depending on stroke order.

The lattice-preserving reflection directions are the dihedral symmetries of the square grid:

- horizontal and vertical axes at correctly quantized offsets;
- `y = x + c` and `y = -x + c` diagonal axes, where the offset is anchored so pixel centers map exactly to pixel centers.

This is why the closest pixel-editor precedents stop at those cases:

- Aseprite exposes horizontal, vertical, left-diagonal, and right-diagonal symmetry—not a freely rotatable axis. ([command API](https://www.aseprite.org/api/app_command), [1.3 release notes](https://www.aseprite.org/release-notes/))
- Pixelorama exposes the same four directions. Its source defines the diagonal normals at 45 degrees and rounds the reflected coordinate, while its symmetry-guide movement snaps the axis offset in half-pixel steps. ([mirror transform](https://github.com/Orama-Interactive/Pixelorama/blob/master/src/Autoload/Tools.gd#L631-L676), [symmetry guide](https://github.com/Orama-Interactive/Pixelorama/blob/master/src/UI/Canvas/Rulers/SymmetryGuide.gd))

Procreate and Photoshop do support arbitrary rotated/path symmetry, but they are general raster-painting applications with subpixel brush sampling. They are not evidence that arbitrary-angle reflection has an unambiguous pixel-perfect result.

Therefore:

- **Arbitrary angle is safe for a passive or snapping guide.** The guide changes input direction, then Pixel Forge's existing pixel-line rasterizer decides which pixels form the stroke.
- **Arbitrary angle is not automatically safe for mirroring.** Mirroring transforms already-rasterized pixel centers and needs a documented quantization/coverage policy.
- **45-degree mirror axes are safe only with quantized anchors.** The UI must prevent offsets that move reflected centers off-lattice.

## Recommended Pixel Forge 1.0 contract

### 1. Separate guide and symmetry entities

Use shared low-level line geometry, but distinct product types:

```ts
type Guide = {
  id: string;
  kind: 'horizontal' | 'vertical' | 'angled';
  anchor: { x: number; y: number };
  angleDegrees: number;
  visible: boolean;
  snapEnabled: boolean;
  assist: 'none' | 'on-line' | 'parallel';
};

type Symmetry = {
  kind: 'horizontal' | 'vertical' | 'diagonal-down' | 'diagonal-up';
  anchor: { x: number; y: number };
  visible: boolean;
  enabled: boolean;
};
```

The exact persistence schema should follow the project's existing versioned project contract; the important part is that `visible` never implies `enabled`.

### 2. Make these controls independent

- `visible`: render the overlay and handles.
- `snapEnabled`: make transforms/endpoints eligible to snap.
- `assist`: constrain newly drawn geometry on-line or parallel to the line.
- `enabled` on `Symmetry`: duplicate drawing input.

Do not call symmetry `mirrorEnabled` on a generic guide. A user should be able to:

- hide a guide while its snapping remains active;
- show a guide as a passive reference;
- hide a symmetry axis while mirrored drawing remains active;
- disable symmetry without deleting or moving its stored axis.

### 3. Keep the 1.0 geometry deliberately small

- Multiple persistent horizontal and vertical guides.
- One or more arbitrary-angle straight guides created with variant B's direct manipulation.
- Angle readout plus useful pixel-slope presets such as `1:1`, `2:1`, and `1:2`; display both ratio and degrees.
- Optional on-line or parallel assistance for tools whose rasterization is already deterministic.
- Horizontal, vertical, and the two quantized 45-degree symmetry axes.
- No arbitrary-angle mirror, radial symmetry, curved ruler, or perspective system in the base 1.0 contract.

This combines B's flexibility with C's pixel-slope vocabulary: arbitrary angles remain available, while pixel-native ratios are fast, understandable presets rather than a separate guide type.

### 4. Fix the current coupling before adding geometry

Pixel Forge's current `GuidesStore` treats guide visibility as mirror activation: `getMirrorPositions()` returns no mirrored positions when `visible` is false, and only one horizontal plus one vertical guide is available. That makes a display preference change drawing output and differs from the prevailing contracts above.

Before adding angled guides, establish these invariants:

1. Hiding guides never changes pixels produced by an already-enabled symmetry mode.
2. Creating a guide does not silently enable mirrored drawing.
3. Enabling symmetry does not require keeping its axis visible.
4. Ordinary guides and symmetry settings persist with the project through a versioned, backward-compatible schema.
5. Import/export and automation APIs expose the same explicit distinctions.

## Decision proposal for issue #440

Adopt **B, refined**:

> Add directly manipulable arbitrary-angle guides as reference and drawing-assist geometry. Keep symmetry as a separate mode. For 1.0, symmetry axes are horizontal, vertical, or lattice-safe 45-degree diagonals only. Visibility, snapping/assistance, and symmetry enablement are independent, persistent settings.

This gives B a concrete use beyond visual decoration, incorporates C's pixel-aware slope presets, matches the dominant behavior in established tools, and avoids promising arbitrary-angle pixel reflection before its raster contract is defined.
