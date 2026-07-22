import { describe, expect, it } from 'vitest';
import { analyzeGuidedDrawingProgress } from '../../../src/services/paint-by-number/guided-progress';
import { createGuidedProjectFile } from '../../../src/services/paint-by-number/guided-project';
import { createProjectContext } from '../../../src/stores/project-context';

describe('guided project resume', () => {
  it('restores the durable guide and derives progress from saved painted pixels', async () => {
    const file = createGuidedProjectFile({
      guide: {
        palette: ['#111111', '#eeeeee'],
        target: Uint8Array.from([1, 2]),
        width: 2,
        height: 1,
        complexity: {
          paintableCells: 2,
          paletteSize: 2,
          isolatedCells: 2,
          simplifiedCells: 0,
        },
      },
      settings: {
        longSide: 2,
        paletteSource: 'generated',
        maxColors: 2,
        mapping: 'luminance',
        simplifyIsolatedPixels: true,
      },
      sourceName: 'study.png',
      createdAt: 123,
    });
    const editingContext = createProjectContext();
    await editingContext.project.loadProject(file);

    const layerId = editingContext.layers.layers.value[0].id;
    const frameId = editingContext.animation.frames.value[0].id;
    editingContext.animation.updateCelIndexBuffer(
      layerId,
      frameId,
      Uint8Array.from([1, 0]),
    );
    const editingCel = editingContext.animation.cels.value.get(
      editingContext.animation.getCelKey(layerId, frameId),
    );
    if (!editingCel) throw new Error('Expected the guided painting cel');
    // happy-dom does not retain canvas pixels, so expose the pixels produced
    // from the index buffer before exercising the save boundary.
    Object.defineProperty(editingCel.canvas, 'getContext', {
      configurable: true,
      value: () => ({
        getImageData: () => ({
          data: Uint8ClampedArray.from([
            17, 17, 17, 255,
            0, 0, 0, 0,
          ]),
        }),
      }),
    });
    const saved = await editingContext.project.saveProject();

    const resumedContext = createProjectContext();
    await resumedContext.project.loadProject(saved);
    const resumedLayerId = resumedContext.layers.layers.value[0].id;
    const resumedFrameId = resumedContext.animation.frames.value[0].id;
    const resumedBuffer = resumedContext.animation.getCelIndexBuffer(
      resumedLayerId,
      resumedFrameId,
    );
    const progress = analyzeGuidedDrawingProgress(
      resumedContext.guidedDrawing.session.value!.target,
      pixelsFromIndexBuffer(resumedBuffer!),
    );

    expect(resumedContext.guidedDrawing.session.value).toMatchObject({
      target: Uint8Array.from([1, 2]),
      guideColorCount: 2,
      sourceName: 'study.png',
      createdAt: 123,
      settings: {
        mapping: 'luminance',
        simplifyIsolatedPixels: true,
      },
    });
    expect(resumedContext.guidedDrawing.numbersVisible.value).toBe(true);
    expect(resumedContext.guidedDrawing.targetPreviewVisible.value).toBe(false);
    expect(resumedBuffer).toEqual(Uint8Array.from([1, 0]));
    expect(progress).toMatchObject({ total: 2, covered: 1, remaining: 1, percentage: 50 });

    editingContext.dispose();
    resumedContext.dispose();
  });
});

function pixelsFromIndexBuffer(indexBuffer: Uint8Array): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(indexBuffer.length * 4);
  for (let index = 0; index < indexBuffer.length; index += 1) {
    if (indexBuffer[index] > 0) pixels[index * 4 + 3] = 255;
  }
  return pixels;
}
