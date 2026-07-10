import { describe, expect, it } from 'vitest';
import {
  analyzeGuidedDrawingProgress,
  getGuidedDrawingSnapshot,
} from '../../../src/services/paint-by-number/guided-progress';
import { createProjectContext } from '../../../src/stores/project-context';
import { GUIDED_DRAWING_VERSION } from '../../../src/types/guided-drawing';

describe('guided drawing progress', () => {
  it('counts any visible painted color as creative coverage', () => {
    const target = Uint8Array.from([1, 2, 0, 2]);
    const pixels = new Uint8ClampedArray(target.length * 4);
    pixels.set([18, 52, 86, 255], 0);
    pixels.set([250, 10, 190, 128], 12);

    const progress = analyzeGuidedDrawingProgress(target, pixels);

    expect(progress).toMatchObject({
      total: 3,
      covered: 2,
      remaining: 1,
      percentage: 67,
    });
    expect([...progress.remainingByNumber]).toEqual([0, 0, 1]);
  });

  it('treats an erased cell as remaining again', () => {
    const target = Uint8Array.from([1, 1]);
    const painted = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 0, 0, 0,
    ]);

    expect(analyzeGuidedDrawingProgress(target, painted)).toMatchObject({
      covered: 1,
      remaining: 1,
      percentage: 50,
    });

    painted[3] = 0;
    expect(analyzeGuidedDrawingProgress(target, painted)).toMatchObject({
      covered: 0,
      remaining: 2,
      percentage: 0,
    });
  });

  it('handles empty and fully covered targets without grading colors', () => {
    const empty = analyzeGuidedDrawingProgress(
      new Uint8Array(2),
      new Uint8ClampedArray(8),
    );
    expect(empty).toMatchObject({ total: 0, covered: 0, remaining: 0, percentage: 0 });

    const full = analyzeGuidedDrawingProgress(
      Uint8Array.from([1, 2]),
      new Uint8ClampedArray([
        1, 1, 1, 1,
        2, 2, 2, 255,
      ]),
    );
    expect(full).toMatchObject({ total: 2, covered: 2, remaining: 0, percentage: 100 });
  });

  it('rejects pixel buffers that cannot align with the guide', () => {
    expect(() =>
      analyzeGuidedDrawingProgress(Uint8Array.from([1]), new Uint8ClampedArray(3)),
    ).toThrow('Guided drawing pixels do not match the target buffer');
  });

  it('reads the fixed painting layer from a guided project context', () => {
    const context = createProjectContext();
    context.guidedDrawing.start({
      version: GUIDED_DRAWING_VERSION,
      width: 2,
      height: 1,
      target: Uint8Array.from([1, 2]),
      settings: {
        longSide: 2,
        paletteSource: 'generated',
        maxColors: 2,
        mapping: 'color',
        simplifyIsolatedPixels: false,
      },
      createdAt: 1,
    });

    const layer = context.layers.layers.value.find((item) => item.type === 'image');
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 0,
    ]);
    const canvas = {
      width: 2,
      height: 1,
      getContext: () => ({ getImageData: () => ({ data: pixels }) }),
    } as unknown as HTMLCanvasElement;
    if (layer) context.layers.updateLayer(layer.id, { canvas });

    const snapshot = getGuidedDrawingSnapshot(context);
    expect(snapshot?.session.target).toEqual(Uint8Array.from([1, 2]));
    expect(snapshot?.pixels[3]).toBe(255);

    context.dispose();
  });
});
