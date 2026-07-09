import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportAseFile } from '../../src/services/aseprite-writer';
import { animationStore } from '../../src/stores/animation';
import { layerStore } from '../../src/stores/layers';
import { projectStore } from '../../src/stores/project';
import type { Frame } from '../../src/types/animation';
import type { Layer } from '../../src/types/layer';

function layer(overrides: Partial<Layer>): Layer {
  return {
    id: 'layer',
    name: 'Layer',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    ...overrides,
  };
}

function readableCanvas(pixels: number[]): HTMLCanvasElement {
  return {
    getContext: () => ({
      getImageData: () => ({
        data: Uint8ClampedArray.from(pixels),
      }),
    }),
  } as unknown as HTMLCanvasElement;
}

describe('Aseprite writer reference exclusion', () => {
  let originalLayers: Layer[];
  let originalFrames: Frame[];
  let originalWidth: number;
  let originalHeight: number;

  beforeEach(() => {
    originalLayers = layerStore.layers.value;
    originalFrames = animationStore.frames.value;
    originalWidth = projectStore.width.value;
    originalHeight = projectStore.height.value;

    projectStore.width.value = 1;
    projectStore.height.value = 1;
    animationStore.frames.value = [{ id: 'frame-1', order: 0, duration: 100 }];
    layerStore.layers.value = [
      layer({ id: 'image-layer', name: 'Artwork' }),
      layer({
        id: 'reference-layer',
        name: 'Guide',
        type: 'reference',
        opacity: 128,
      }),
    ];

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:aseprite'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    layerStore.layers.value = originalLayers;
    animationStore.frames.value = originalFrames;
    projectStore.width.value = originalWidth;
    projectStore.height.value = originalHeight;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not ask reference layers for cel pixels while exporting', () => {
    const artworkCanvas = readableCanvas([255, 0, 0, 255]);
    const getCelCanvas = vi
      .spyOn(animationStore, 'getCelCanvas')
      .mockImplementation((frameId, layerId) => {
        expect(frameId).toBe('frame-1');
        if (layerId === 'reference-layer') {
          throw new Error('Reference layer should not be exported as a cel');
        }
        return artworkCanvas;
      });

    exportAseFile('reference-safe.ase');

    expect(getCelCanvas.mock.calls.map((call) => call[1])).toEqual([
      'image-layer',
    ]);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
});
