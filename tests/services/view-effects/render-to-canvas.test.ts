import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MIN_VIEW_EFFECT_EXPORT_SCALE,
  getViewEffectExportBaseName,
  renderViewEffectToCanvas,
} from '../../../src/services/view-effects';

describe('renderViewEffectToCanvas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders through the shared pipeline and copies the stable result', () => {
    const source = document.createElement('canvas');
    source.width = 32;
    source.height = 24;

    const effectCanvas = document.createElement('canvas');
    effectCanvas.width = 32;
    effectCanvas.height = 24;
    const drawImage = vi.fn();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D);

    const render = vi.fn(() => true);
    const output = renderViewEffectToCanvas(source, {
      effectId: 'crt',
      params: { scanlines: 0.5 },
      pipeline: { canvas: effectCanvas, render },
      spritePixelScale: 4,
    });

    expect(render).toHaveBeenCalledWith(
      'crt',
      source,
      { scanlines: 0.5 },
      { width: 32, height: 24, spritePixelScale: 4 }
    );
    expect(output?.width).toBe(32);
    expect(output?.height).toBe(24);
    expect(drawImage).toHaveBeenCalledWith(effectCanvas, 0, 0);
  });

  it('does not produce a styled canvas when the pipeline cannot render', () => {
    const source = document.createElement('canvas');
    const render = vi.fn(() => false);

    expect(
      renderViewEffectToCanvas(source, {
        effectId: 'crt',
        params: {},
        pipeline: { canvas: document.createElement('canvas'), render },
        spritePixelScale: 4,
      })
    ).toBeNull();
  });

  it('defines the styled-copy filename and minimum display scale', () => {
    expect(getViewEffectExportBaseName('sprite_001', 'crt')).toBe('sprite_001-crt');
    expect(MIN_VIEW_EFFECT_EXPORT_SCALE).toBe(4);
  });
});
