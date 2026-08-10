import { describe, expect, it } from 'vitest';

import {
  createArtworkCompositionPlan,
  drawArtworkComposition,
} from '../../src/services/export-composition';
import type { Cel } from '../../src/types/animation';
import type { Layer } from '../../src/types/layer';

function canvas(width: number, height: number, color?: string): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  if (color) {
    const context = result.getContext('2d');
    if (!context) throw new Error('Chromium did not provide a 2D canvas context');
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
  }
  return result;
}

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

function cel(
  layerId: string,
  frameId: string,
  source: HTMLCanvasElement,
  overrides: Partial<Cel> = {}
): Cel {
  return {
    id: `${layerId}-${frameId}`,
    layerId,
    frameId,
    canvas: source,
    opacity: 100,
    ...overrides,
  };
}

function pixel(source: HTMLCanvasElement, x: number, y: number): number[] {
  const context = source.getContext('2d');
  if (!context) throw new Error('Chromium did not provide a 2D canvas context');
  return [...context.getImageData(x, y, 1, 1).data];
}

function drawFixture(
  layers: readonly Layer[],
  cels: ReadonlyMap<string, Cel>,
  width = 8,
  height = 8
): HTMLCanvasElement {
  const target = canvas(width, height);
  const context = target.getContext('2d');
  if (!context) throw new Error('Chromium did not provide a 2D canvas context');

  drawArtworkComposition(
    context,
    createArtworkCompositionPlan({
      frameId: 'frame-1',
      layers,
      cels,
      getCelKey: (layerId, frameId) => `${layerId}:${frameId}`,
    })
  );
  return target;
}

describe('canonical artwork composition in Chromium', () => {
  it('produces deterministic raw RGBA for image, group, text, blend, and exclusions', () => {
    const imageCanvas = canvas(8, 8, '#ff0000');
    const multiplyCanvas = canvas(8, 8, '#00ff00');
    const groupCelCanvas = canvas(8, 8);
    const groupContext = groupCelCanvas.getContext('2d');
    if (!groupContext) throw new Error('Chromium did not provide a 2D canvas context');
    groupContext.fillStyle = '#ffff00';
    groupContext.fillRect(4, 0, 4, 8);
    const groupArchiveCanvas = canvas(8, 8, '#0000ff');
    const staleTextRaster = canvas(8, 8, '#0000ff');
    const hiddenCanvas = canvas(8, 8, '#ffffff');
    const referenceCanvas = canvas(8, 8, '#ff00ff');
    const layers = [
      layer({ id: 'image' }),
      layer({ id: 'multiply', blendMode: 'multiply' }),
      layer({ id: 'group', type: 'group', canvas: groupArchiveCanvas }),
      layer({
        id: 'text',
        type: 'text',
        textData: { font: 'small-5x7', color: '#ff0000' },
      }),
      layer({ id: 'hidden', visible: false }),
      layer({ id: 'reference', type: 'reference' }),
    ];
    const cels = new Map<string, Cel>([
      ['image:frame-1', cel('image', 'frame-1', imageCanvas)],
      ['multiply:frame-1', cel('multiply', 'frame-1', multiplyCanvas)],
      ['group:frame-1', cel('group', 'frame-1', groupCelCanvas)],
      [
        'text:frame-1',
        cel('text', 'frame-1', staleTextRaster, {
          textCelData: { content: 'A', x: 0, y: 0 },
        }),
      ],
      ['hidden:frame-1', cel('hidden', 'frame-1', hiddenCanvas)],
      ['reference:frame-1', cel('reference', 'frame-1', referenceCanvas)],
    ]);

    const target = drawFixture(layers, cels);

    expect(pixel(target, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(target, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(target, 0, 7)).toEqual([0, 0, 0, 255]);
    expect(pixel(target, 4, 0)).toEqual([255, 255, 0, 255]);
    expect(pixel(target, 7, 7)).toEqual([255, 255, 0, 255]);
    expect(pixel(target, 0, 0)).not.toEqual([0, 0, 255, 255]);
    expect(pixel(target, 0, 0)).not.toEqual([255, 255, 255, 255]);
    expect(pixel(target, 0, 0)).not.toEqual([255, 0, 255, 255]);
  });

  it('resets alpha between a lower-opacity step and full-opacity text', () => {
    const lowerAlphaCanvas = canvas(8, 8, '#00ff00');
    const lowerAlphaLayer = layer({ id: 'lower', opacity: 255 });
    const textLayer = layer({
      id: 'text',
      type: 'text',
      textData: { font: 'small-5x7', color: '#ff0000' },
    });
    const target = drawFixture(
      [lowerAlphaLayer, textLayer],
      new Map([
        ['lower:frame-1', cel('lower', 'frame-1', lowerAlphaCanvas, { opacity: 25 })],
        [
          'text:frame-1',
          cel('text', 'frame-1', canvas(8, 8, '#0000ff'), {
            textCelData: { content: 'A', x: 0, y: 0 },
          }),
        ],
      ])
    );

    expect(pixel(target, 1, 0)).toEqual([255, 0, 0, 255]);
  });
});
