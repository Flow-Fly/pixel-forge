import { describe, expect, it } from 'vitest';
import {
  editorCatalog,
  projectSaveSafetyCatalog,
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
    expect(editorCatalog.observations).toEqual([projectSaveSafetyCatalog]);
  });
});
