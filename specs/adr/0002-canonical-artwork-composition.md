# ADR 0002: Canonical artwork composition and editable text authority

- Status: Accepted
- Date: 2026-08-10
- Decider: Repository owner
- Related issues: #470, #471, #472

## Context

The editor, previews, thumbnails, and raster export had separate rules for
which layer pixels to draw, how opacity and blend modes combine, and how text
is represented. A text cel may also retain a raster while its editable
metadata remains available. Group layers can preserve archive bytes that are
not the drawable artwork for a frame.

## Decision

One pure, explicit frame composition plan is the source of truth for flattened
artwork. It includes visible non-reference layers in stored order, uses the
frame's cel canvas for image and group artwork, combines layer and cel opacity,
and maps supported blend modes to Canvas 2D operations. A shared drawer applies
that plan and resets its canvas state after drawing.

Editable text is authoritative in `Layer.textData + Cel.textCelData` and is
rasterized by the existing Pixel Forge bitmap-font renderer. A persisted text
raster is derived compatibility/cache data and is ignored when authoritative
metadata exists; preserved bytes are not migrated or deleted. Group-layer
archive bytes are likewise compatibility-only; only the per-frame group cel is
drawable group artwork.

## Consequences

- Editor artwork, previews, thumbnails, and raster export can share one
  deterministic composition contract.
- Text remains editable without adding a second renderer or changing the
  project-file schema.
- Existing preserved raster and archive bytes remain available for
  compatibility but cannot silently override current artwork metadata.
- Scale, background, view effects, overlays, and file encoders remain adapter
  policy outside composition.

## References

- `CONTEXT.md` artwork composition terms
- `src/services/export-composition.ts`
