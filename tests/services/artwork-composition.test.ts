import { describe, expect, it, vi } from 'vitest';

import {
  createArtworkCompositionPlan,
  drawArtworkComposition,
} from '../../src/services/export-composition';
import type { Cel } from '../../src/types/animation';
import type { Layer } from '../../src/types/layer';

function createCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function createLayer(overrides: Partial<Layer> = {}): Layer {
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

function createCel(layerId: string, frameId: string, canvas: HTMLCanvasElement): Cel {
  return {
    id: `${layerId}-${frameId}`,
    layerId,
    frameId,
    canvas,
    opacity: 100,
  };
}

function createContext(
  layers: readonly Layer[],
  cels: ReadonlyMap<string, Cel>
) {
  return {
    frameId: 'frame-1',
    layers,
    cels,
    getCelKey: (layerId: string, frameId: string) => `${layerId}:${frameId}`,
  };
}

describe('canonical artwork composition', () => {
  it('captures stored-order artwork while excluding hidden, reference, missing, and archive canvases', () => {
    const imageCelCanvas = createCanvas();
    const groupCelCanvas = createCanvas();
    const staleGroupArchiveCanvas = createCanvas();
    const staleTextRaster = createCanvas();
    const image = createLayer({
      id: 'image',
      canvas: createCanvas(),
    });
    const hidden = createLayer({ id: 'hidden', visible: false });
    const reference = createLayer({ id: 'reference', type: 'reference' });
    const group = createLayer({
      id: 'group',
      type: 'group',
      canvas: staleGroupArchiveCanvas,
    });
    const textData = { font: 'small-5x7', color: '#ff0000' };
    const textCelData = { content: 'A', x: 1, y: 2 };
    const text = createLayer({ id: 'text', type: 'text', textData });
    const cels = new Map<string, Cel>([
      ['image:frame-1', createCel('image', 'frame-1', imageCelCanvas)],
      ['hidden:frame-1', createCel('hidden', 'frame-1', createCanvas())],
      ['reference:frame-1', createCel('reference', 'frame-1', createCanvas())],
      ['group:frame-1', createCel('group', 'frame-1', groupCelCanvas)],
      [
        'text:frame-1',
        {
          ...createCel('text', 'frame-1', staleTextRaster),
          textCelData,
        },
      ],
    ]);

    const plan = createArtworkCompositionPlan(
      createContext([image, hidden, reference, group, text, createLayer({ id: 'missing' })], cels)
    );

    expect(plan.steps.map((step) => [step.kind, step.layerId])).toEqual([
      ['image', 'image'],
      ['group-cel', 'group'],
      ['text', 'text'],
    ]);
    expect(plan.steps[0]).toMatchObject({ canvas: imageCelCanvas });
    expect(plan.steps[1].kind).toBe('group-cel');
    if (plan.steps[1].kind !== 'group-cel') throw new Error('Expected group cel step');
    expect(plan.steps[1].canvas).toBe(groupCelCanvas);
    expect(plan.steps[1].canvas).not.toBe(staleGroupArchiveCanvas);
    expect(plan.steps[2]).toMatchObject({ textData, textCelData });
    expect(plan.steps[2].kind).toBe('text');
    expect('canvas' in plan.steps[2]).toBe(false);
    expect(plan.steps[2].textData).not.toBe(textData);
    expect(Object.isFrozen(plan.steps[2].textData)).toBe(true);
    expect(Object.isFrozen(plan.steps[2].textCelData)).toBe(true);
  });

  it('combines layer and cel opacity and maps browser blend operations', () => {
    const canvas = createCanvas();
    const cel = createCel('layer', 'frame-1', canvas);
    cel.opacity = 50;
    const plan = createArtworkCompositionPlan(
      createContext(
        [
          createLayer({ id: 'layer', opacity: 128, blendMode: 'multiply' }),
          createLayer({ id: 'normal', blendMode: 'normal' }),
        ],
        new Map([
          ['layer:frame-1', cel],
          ['normal:frame-1', createCel('normal', 'frame-1', createCanvas())],
        ])
      )
    );

    expect(plan.steps[0]).toMatchObject({
      alpha: (128 / 255) * 0.5,
      compositeOperation: 'multiply',
    });
    expect(plan.steps[1]).toMatchObject({
      alpha: 1,
      compositeOperation: 'source-over',
    });
  });

  it('draws every step and leaves the target in neutral canvas state', () => {
    const imageCanvas = createCanvas();
    const context = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      fillStyle: '',
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const text = createLayer({
      id: 'text',
      type: 'text',
      textData: { font: 'small-5x7', color: '#ff0000' },
    });
    const plan = createArtworkCompositionPlan(
      createContext(
        [createLayer({ id: 'image' }), text],
        new Map([
          ['image:frame-1', createCel('image', 'frame-1', imageCanvas)],
          [
            'text:frame-1',
            {
              ...createCel('text', 'frame-1', createCanvas()),
              textCelData: { content: 'A', x: 0, y: 0 },
            },
          ],
        ])
      )
    );

    drawArtworkComposition(context, plan);

    expect(context.drawImage).toHaveBeenCalledWith(imageCanvas, 0, 0);
    expect(context.fillRect).toHaveBeenCalled();
    expect(context.globalAlpha).toBe(1);
    expect(context.globalCompositeOperation).toBe('source-over');
  });
});
