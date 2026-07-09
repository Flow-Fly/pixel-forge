import { describe, expect, it } from 'vitest';

import { createReferenceLayerRenderPlan } from '../../src/services/reference-render-plan';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
} from '../../src/stores/project-context';
import type { Layer } from '../../src/types/layer';
import type { ReferenceLayerData } from '../../src/types/reference';

function referenceData(overrides: Partial<ReferenceLayerData> = {}): ReferenceLayerData {
  return {
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 1.5,
    y: 2.5,
    scale: 0.75,
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

function referenceLayer(
  id: string,
  overrides: Partial<Layer> = {},
  referenceOverrides: Partial<ReferenceLayerData> = {}
): Layer {
  return layer({
    id,
    name: id,
    type: 'reference',
    opacity: 128,
    referenceData: referenceData(referenceOverrides),
    ...overrides,
  });
}

describe('createReferenceLayerRenderPlan', () => {
  it('separates visible reference layers into below and above artwork order', () => {
    const belowA = referenceLayer('below-a');
    const aboveA = referenceLayer('above-a', {}, { position: 'above' });
    const belowB = referenceLayer('below-b', {}, { position: 'below' });
    const aboveB = referenceLayer('above-b', {}, { position: 'above' });

    const plan = createReferenceLayerRenderPlan([
      belowA,
      layer({ id: 'paint-layer' }),
      aboveA,
      belowB,
      aboveB,
    ]);

    expect(plan.belowArtwork.map((entry) => entry.layerId)).toEqual(['below-a', 'below-b']);
    expect(plan.aboveArtwork.map((entry) => entry.layerId)).toEqual(['above-a', 'above-b']);
  });

  it('copies reference transform fields and applies render defaults', () => {
    const bytes = Uint8Array.from([9, 8, 7]);
    const plan = createReferenceLayerRenderPlan([
      referenceLayer(
        'reference',
        { opacity: 77 },
        {
          bytes,
          mimeType: 'image/jpeg',
          x: 10.25,
          y: 20.5,
          scale: 1.25,
        }
      ),
    ]);

    expect(plan.belowArtwork).toEqual([
      {
        layerId: 'reference',
        bytes,
        mimeType: 'image/jpeg',
        x: 10.25,
        y: 20.5,
        scale: 1.25,
        opacity: 77,
        desaturate: false,
        position: 'below',
      },
    ]);
    expect(plan.aboveArtwork).toEqual([]);
  });

  it('skips hidden, non-reference, and malformed reference layers', () => {
    const malformedReference = layer({
      id: 'malformed-reference',
      type: 'reference',
      referenceData: undefined,
    });

    const plan = createReferenceLayerRenderPlan([
      layer({ id: 'image-layer' }),
      referenceLayer('hidden-reference', { visible: false }),
      malformedReference,
      referenceLayer('visible-reference'),
    ]);

    expect(plan.belowArtwork.map((entry) => entry.layerId)).toEqual(['visible-reference']);
    expect(plan.aboveArtwork).toEqual([]);
  });

  it('is pure and independent from the active project context', () => {
    const activeContext = createProjectContext();
    const bytes = Uint8Array.from([4, 5, 6]);
    const inputLayers = [
      referenceLayer(
        'explicit-reference',
        { opacity: 99 },
        {
          bytes,
          desaturate: true,
          position: 'above',
        }
      ),
    ];
    const before = structuredClone(inputLayers);

    try {
      activeContext.layers.addReferenceLayer(
        referenceData({
          bytes: Uint8Array.from([0]),
          position: 'below',
        }),
        'Active Context Reference'
      );
      setActiveProjectContext(activeContext);

      const plan = createReferenceLayerRenderPlan(inputLayers);

      expect(plan.belowArtwork).toEqual([]);
      expect(plan.aboveArtwork).toEqual([
        {
          layerId: 'explicit-reference',
          bytes,
          mimeType: 'image/png',
          x: 1.5,
          y: 2.5,
          scale: 0.75,
          opacity: 99,
          desaturate: true,
          position: 'above',
        },
      ]);
      expect(inputLayers).toEqual(before);
    } finally {
      restoreDefaultProjectContext();
      activeContext.dispose();
    }
  });
});
