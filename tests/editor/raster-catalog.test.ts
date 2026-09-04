import { describe, expect, it } from 'vitest';
import {
  editorCatalog,
  animationObservationCatalog,
  projectSaveSafetyCatalog,
  rasterObservationCatalog,
  rasterPatchCatalog,
  rasterFillCatalog,
  rasterGradientCatalog,
} from '../../src/editor/catalog';

describe('raster editor catalog contracts', () => {
  it('describes the flat Fill and Gradient request keys and local result metadata', () => {
    expect(Object.keys(rasterFillCatalog.request)).toEqual([
      'target',
      'expectedRevision',
      'layerId',
      'frameId',
      'celId',
      'startX',
      'startY',
      'hex',
      'contiguous',
    ]);
    expect(Object.keys(rasterGradientCatalog.request)).toEqual([
      'target',
      'expectedRevision',
      'layerId',
      'frameId',
      'celId',
      'startX',
      'startY',
      'endX',
      'endY',
      'primaryHex',
      'secondaryHex',
      'type',
      'shift',
    ]);
    expect(rasterGradientCatalog.request).not.toHaveProperty('palettePolicy');
    expect(rasterGradientCatalog.result).toEqual({
      effectivePalettePolicy: 'existing-palette',
      endpoints: {
        start: { index: 'integer 1..255', color: 'six-digit hex color' },
        end: { index: 'integer 1..255', color: 'six-digit hex color' },
      },
      effectiveEnd: { x: 'integer', y: 'integer' },
    });
  });

  it('publishes save safety as one transport-neutral project observation', () => {
    expect(projectSaveSafetyCatalog).toMatchObject({
      id: 'project.save-safety',
      kind: 'observation',
      target: 'project',
      fields: {
        target: { projectId: 'string' },
        currentRevision: 'integer >= 0',
        persistedRevision: 'integer >= 0',
        status: ['dirty', 'saving', 'saved', 'failed'],
      },
    });
    expect(editorCatalog.observations).toContain(projectSaveSafetyCatalog);
    expect(editorCatalog.observations.map((observation) => observation.id)).toEqual([
      'project.save-safety',
      'project.observe',
      'project.render.observe',
      'project.raster.observe',
      'project.animation.observe',
    ]);
  });

  it('describes bounded Symbol Grid observation and patch contracts', () => {
    expect(rasterObservationCatalog).toMatchObject({
      id: 'project.raster.observe',
      kind: 'observation',
      requiresRevision: true,
      affectedDomains: ['raster-content'],
      limits: {
        region: { maxWidth: 64, maxHeight: 64, maxCells: 4096 },
        legend: { maxEntries: 32 },
      },
      result: {
        type: 'project.raster.observation',
        digest: '64-character lowercase SHA-256 digest',
      },
    });
    expect(rasterPatchCatalog).toMatchObject({
      id: 'project.raster.patch',
      kind: 'command',
      affectedDomains: ['raster-content'],
      undo: 'one-session-history-entry',
      request: {
        legend: {
          item: { resolution: 'exactly one of paletteEntryId or color' },
        },
      },
      limits: {
        region: { maxWidth: 64, maxHeight: 64, maxCells: 4096 },
        patches: { max: 16, maxCells: 4096 },
        legend: { maxEntries: 32 },
      },
    });
    expect(editorCatalog.commands).toContain(rasterPatchCatalog);
  });

  it('publishes the bounded animation evaluation bundle contract', () => {
    expect(animationObservationCatalog).toMatchObject({
      id: 'project.animation.observe',
      kind: 'observation',
      requiresRevision: true,
      representationVersion: '1.0',
      request: {
        range: 'all | { tagId: bounded stable tag identity }',
        keyframes: '1..4 unique frame identities within the selected range',
        expectedDigest: 'null or 64-character lowercase SHA-256 bundle digest',
      },
      result: {
        type: 'animation.evaluation.bundle',
        digest: '64-character lowercase SHA-256 bundle digest',
      },
      limits: {
        frames: { min: 2, max: 16 },
        canvas: { maxWidth: 64, maxHeight: 64, maxPixels: 65536 },
        legend: { maxEntries: 32 },
      },
      digest: {
        algorithm: 'SHA-256',
        expectedMismatch: { code: 'revision_conflict', retryable: true },
      },
    });
    expect(editorCatalog.observations).toContain(animationObservationCatalog);
  });
});
