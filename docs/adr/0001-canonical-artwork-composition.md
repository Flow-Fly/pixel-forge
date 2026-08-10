# ADR 0001: Canonical artwork composition and editable text authority

- Status: Accepted
- Date: 2026-08-10
- Decider: Repository owner
- Related issues: #470, #471, #472

## Context

Flattened artwork surfaces had separate ordering, opacity, blend, and text
rules. Text may retain both editable metadata and a derived raster, while a
group may retain archived payload that is not its frame artwork.

## Decision

Use one pure frame composition plan and shared drawer. Visible non-reference
layers stay in stored order; image and group steps use the frame cel canvas;
layer and cel opacity combine; supported blend modes map to Canvas 2D.

Editable `Layer.textData + Cel.textCelData` is authoritative text artwork and
is rasterized with the existing Pixel Forge bitmap-font renderer. A persisted
text raster and archived group payload remain compatibility-only and are
ignored when authoritative artwork exists. No schema migration or deletion is
part of this decision. Scale, backgrounds, effects, overlays, and encoders
remain adapter policy.

## Consequences

- Editor artwork, previews, thumbnails, and raster export share one result.
- Text remains editable without a second renderer or format change.
- Compatibility bytes are preserved without overriding current artwork.

## References

- `CONTEXT.md`
- `src/services/export-composition.ts`
