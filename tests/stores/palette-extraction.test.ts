import { describe, expect, it, vi } from 'vitest';

import { extractColorsFromDrawing } from '../../src/stores/palette/extraction';

function readableCanvas(color: [number, number, number, number]): HTMLCanvasElement {
  const getImageData = vi.fn(() => ({
    width: 1,
    height: 1,
    data: Uint8ClampedArray.from(color),
  }));

  return {
    width: 1,
    height: 1,
    getContext: () => ({ getImageData }),
  } as unknown as HTMLCanvasElement;
}

describe('palette extraction reference exclusion', () => {
  it('extracts colors from visible artwork layers and skips reference layers', async () => {
    const artworkCanvas = readableCanvas([255, 0, 0, 255]);
    const referenceCanvas = readableCanvas([0, 0, 255, 255]);
    const currentFrameId = { value: 'frame-1' };
    const cels = {
      value: new Map([
        ['artwork-layer:frame-1', {
          canvas: artworkCanvas,
          layerId: 'artwork-layer',
          frameId: 'frame-1',
        }],
        ['reference-layer:frame-1', {
          canvas: referenceCanvas,
          layerId: 'reference-layer',
          frameId: 'frame-1',
        }],
      ]),
    };

    const colors = await extractColorsFromDrawing(
      {
        currentFrameId,
        cels,
        getCelKey: (layerId, frameId) => `${layerId}:${frameId}`,
      },
      {
        layers: {
          value: [
            { id: 'artwork-layer', visible: true, type: 'image' },
            { id: 'reference-layer', visible: true, type: 'reference' },
          ],
        },
      }
    );

    expect(colors).toEqual(['#ff0000']);
  });
});
