import { describe, expect, it } from 'vitest';

import {
  composeExportFrame,
  createArtworkCompositionPlan,
  drawArtworkComposition,
} from '../../src/services/export-composition';
import { createProjectThumbnail } from '../../src/services/project-thumbnail';
import { compositeFrame } from '../../src/utils/canvas-utils';
import { renderFrameToCanvas } from '../../src/utils/preview-renderer';
import type { Cel } from '../../src/types/animation';
import type { Layer } from '../../src/types/layer';
import type { ProjectContext } from '../../src/stores/project-context';

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

function pixels(source: HTMLCanvasElement): number[] {
  const context = source.getContext('2d');
  if (!context) throw new Error('Chromium did not provide a 2D canvas context');
  return [...context.getImageData(0, 0, source.width, source.height).data];
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

  it('keeps preview, thumbnail PNG, and export frame RGBA identical', async () => {
    const imageCanvas = canvas(8, 8, '#123456');
    const groupCanvas = canvas(8, 8);
    const groupContext = groupCanvas.getContext('2d');
    if (!groupContext) throw new Error('Chromium did not provide a 2D canvas context');
    groupContext.fillStyle = '#d4e5f6';
    groupContext.fillRect(4, 0, 4, 8);
    const archiveCanvas = canvas(8, 8, '#ff00ff');
    const staleTextRaster = canvas(8, 8, '#0000ff');
    const layers = [
      layer({ id: 'image' }),
      layer({ id: 'group', type: 'group', canvas: archiveCanvas }),
      layer({
        id: 'text',
        type: 'text',
        textData: { font: 'small-5x7', color: '#ff0000' },
      }),
    ];
    const cels = new Map<string, Cel>([
      ['image:frame-1', cel('image', 'frame-1', imageCanvas)],
      ['group:frame-1', cel('group', 'frame-1', groupCanvas)],
      [
        'text:frame-1',
        cel('text', 'frame-1', staleTextRaster, {
          textCelData: { content: 'A', x: 0, y: 0 },
        }),
      ],
    ]);
    const getCelKey = (layerId: string, frameId: string) => `${layerId}:${frameId}`;
    const animation = {
      cels: { value: cels },
      getCelKey,
    } as unknown as ProjectContext['animation'];
    const layerStore = { layers: { value: layers } } as unknown as ProjectContext['layers'];
    const context = { animation, layers: layerStore } as Pick<
      ProjectContext,
      'animation' | 'layers'
    >;

    const previewCanvas = canvas(8, 8);
    const previewContext = previewCanvas.getContext('2d');
    if (!previewContext) throw new Error('Chromium did not provide a 2D canvas context');
    renderFrameToCanvas(previewContext, 'frame-1', layers, cels, animation);

    const exportCanvas = composeExportFrame({
      frameId: 'frame-1',
      width: 8,
      height: 8,
      scale: 1,
      layers,
      cels,
      getCelKey,
    });

    const compositeCanvas = canvas(8, 8);
    const compositeContext = compositeCanvas.getContext('2d');
    if (!compositeContext) throw new Error('Chromium did not provide a 2D canvas context');
    compositeFrame('frame-1', compositeContext, { context });

    const thumbnailBytes = await createProjectThumbnail({
      compositeFrame: (frameId, targetContext) =>
        compositeFrame(frameId, targetContext, { context }),
      frameId: 'frame-1',
      width: 8,
      height: 8,
    });
    expect(thumbnailBytes).toBeDefined();
    if (!thumbnailBytes) throw new Error('Thumbnail PNG was not created');

    const thumbnailBitmap = await createImageBitmap(
      new Blob([thumbnailBytes as BlobPart], { type: 'image/png' })
    );
    const thumbnailCanvas = canvas(thumbnailBitmap.width, thumbnailBitmap.height);
    const thumbnailContext = thumbnailCanvas.getContext('2d');
    if (!thumbnailContext) throw new Error('Chromium did not provide a 2D canvas context');
    thumbnailContext.drawImage(thumbnailBitmap, 0, 0);
    thumbnailBitmap.close();

    expect(pixels(previewCanvas)).toEqual(pixels(exportCanvas));
    expect(pixels(previewCanvas)).toEqual(pixels(compositeCanvas));
    expect(pixels(previewCanvas)).toEqual(pixels(thumbnailCanvas));
  });
});
