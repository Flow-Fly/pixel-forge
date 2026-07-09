import { describe, expect, it } from 'vitest';

import {
  createReferenceTransformBox,
  moveReferenceTransform,
  scaleReferenceTransformUniformly,
  screenDeltaToCanvasDelta,
} from '../../src/services/reference-transform-geometry';
import type { Layer } from '../../src/types/layer';
import type { ReferenceLayerData } from '../../src/types/reference';

function referenceData(overrides: Partial<ReferenceLayerData> = {}): ReferenceLayerData {
  return {
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 4,
    y: 8,
    scale: 2,
    ...overrides,
  };
}

function layer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'layer-1',
    name: 'Layer 1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    ...overrides,
  };
}

function referenceLayer(overrides: Partial<Layer> = {}) {
  return layer({
    id: 'reference-layer',
    type: 'reference',
    opacity: 128,
    referenceData: referenceData(),
    ...overrides,
  });
}

describe('reference transform geometry', () => {
  it('creates canvas and screen bounds with corner handles for an editable reference layer', () => {
    const box = createReferenceTransformBox(
      referenceLayer(),
      { width: 20, height: 10 },
      { panX: 100, panY: 50, zoom: 3 }
    );

    expect(box).toMatchObject({
      layerId: 'reference-layer',
      x: 4,
      y: 8,
      width: 40,
      height: 20,
      screenLeft: 112,
      screenTop: 74,
      screenRight: 232,
      screenBottom: 134,
    });
    expect(box?.handles).toEqual([
      {
        position: 'top-left',
        canvasX: 4,
        canvasY: 8,
        screenX: 112,
        screenY: 74,
        cursor: 'nwse-resize',
      },
      {
        position: 'top-right',
        canvasX: 44,
        canvasY: 8,
        screenX: 232,
        screenY: 74,
        cursor: 'nesw-resize',
      },
      {
        position: 'bottom-left',
        canvasX: 4,
        canvasY: 28,
        screenX: 112,
        screenY: 134,
        cursor: 'nesw-resize',
      },
      {
        position: 'bottom-right',
        canvasX: 44,
        canvasY: 28,
        screenX: 232,
        screenY: 134,
        cursor: 'nwse-resize',
      },
    ]);
  });

  it('returns no box for non-reference, hidden, locked, malformed, or empty-size inputs', () => {
    expect(
      createReferenceTransformBox(layer(), { width: 20, height: 10 }, { panX: 0, panY: 0, zoom: 1 })
    ).toBeNull();
    expect(
      createReferenceTransformBox(
        referenceLayer({ visible: false }),
        { width: 20, height: 10 },
        { panX: 0, panY: 0, zoom: 1 }
      )
    ).toBeNull();
    expect(
      createReferenceTransformBox(
        referenceLayer({ locked: true }),
        { width: 20, height: 10 },
        { panX: 0, panY: 0, zoom: 1 }
      )
    ).toBeNull();
    expect(
      createReferenceTransformBox(
        referenceLayer({ referenceData: undefined }),
        { width: 20, height: 10 },
        { panX: 0, panY: 0, zoom: 1 }
      )
    ).toBeNull();
    expect(
      createReferenceTransformBox(referenceLayer(), { width: 0, height: 10 }, { panX: 0, panY: 0, zoom: 1 })
    ).toBeNull();
  });

  it('converts screen movement into canvas movement for reference moves', () => {
    expect(screenDeltaToCanvasDelta({ x: 10, y: 10 }, { x: 18, y: 4 }, 2)).toEqual({
      x: 4,
      y: -3,
    });

    expect(
      moveReferenceTransform(
        { x: 4, y: 8, scale: 2 },
        { x: 10, y: 10 },
        { x: 18, y: 4 },
        2
      )
    ).toEqual({
      x: 8,
      y: 5,
      scale: 2,
    });
  });

  it('calculates uniform corner scale while keeping the opposite corner anchored', () => {
    const scaled = scaleReferenceTransformUniformly(
      { x: 10, y: 20, scale: 2 },
      { width: 20, height: 10 },
      'bottom-right',
      { x: 100, y: 80 },
      { x: 120, y: 90 },
      2
    );

    expect(scaled).toEqual({
      x: 10,
      y: 20,
      scale: 2.5,
    });
  });

  it('moves the top-left corner when uniform scale is anchored at bottom-right', () => {
    const scaled = scaleReferenceTransformUniformly(
      { x: 10, y: 20, scale: 2 },
      { width: 20, height: 10 },
      'top-left',
      { x: 20, y: 40 },
      { x: 0, y: 20 },
      2
    );

    expect(scaled).toEqual({
      x: -10,
      y: 10,
      scale: 3,
    });
  });
});
