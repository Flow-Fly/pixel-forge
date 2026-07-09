import { describe, expect, it, vi } from 'vitest';

import {
  drawReferenceImage,
  type ReferenceDrawableImage,
} from '../../src/services/reference-canvas-draw';
import type { ReferenceLayerRenderEntry } from '../../src/services/reference-render-plan';

interface DrawState {
  globalAlpha: number;
  filter: string;
  imageSmoothingEnabled: boolean;
}

interface FakeCanvasContext extends DrawState {
  drawStates: DrawState[];
  drawImage: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

function createEntry(
  overrides: Partial<ReferenceLayerRenderEntry> = {}
): ReferenceLayerRenderEntry {
  return {
    layerId: 'reference-layer',
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 4,
    y: 8,
    scale: 2,
    opacity: 128,
    desaturate: false,
    position: 'below',
    ...overrides,
  };
}

function createImage(width = 20, height = 10): ReferenceDrawableImage {
  return { width, height } as ReferenceDrawableImage;
}

function createContext(overrides: Partial<DrawState> = {}): FakeCanvasContext {
  const stack: DrawState[] = [];
  const context: FakeCanvasContext = {
    globalAlpha: 0.25,
    filter: 'blur(1px)',
    imageSmoothingEnabled: false,
    drawStates: [],
    drawImage: vi.fn(() => {
      context.drawStates.push(captureState(context));
    }),
    save: vi.fn(() => {
      stack.push(captureState(context));
    }),
    restore: vi.fn(() => {
      const previousState = stack.pop();
      if (!previousState) return;
      context.globalAlpha = previousState.globalAlpha;
      context.filter = previousState.filter;
      context.imageSmoothingEnabled = previousState.imageSmoothingEnabled;
    }),
    ...overrides,
  };

  return context;
}

function captureState(context: DrawState): DrawState {
  return {
    globalAlpha: context.globalAlpha,
    filter: context.filter,
    imageSmoothingEnabled: context.imageSmoothingEnabled,
  };
}

describe('drawReferenceImage', () => {
  it('draws a reference image at its scaled canvas-space destination', () => {
    const context = createContext();
    const image = createImage(20, 10);

    drawReferenceImage(context as unknown as CanvasRenderingContext2D, createEntry(), image);

    expect(context.save).toHaveBeenCalledOnce();
    expect(context.drawImage).toHaveBeenCalledWith(image, 4, 8, 40, 20);
    expect(context.drawStates[0].globalAlpha).toBeCloseTo(128 / 255);
    expect(context.drawStates[0].filter).toBe('none');
    expect(context.drawStates[0].imageSmoothingEnabled).toBe(true);
    expect(captureState(context)).toEqual({
      globalAlpha: 0.25,
      filter: 'blur(1px)',
      imageSmoothingEnabled: false,
    });
  });

  it('applies desaturation while preserving the previous context state', () => {
    const context = createContext({ globalAlpha: 1, filter: 'contrast(2)' });
    const image = createImage(30, 12);

    drawReferenceImage(
      context as unknown as CanvasRenderingContext2D,
      createEntry({ x: 1.5, y: 2.25, scale: 0.5, opacity: 64, desaturate: true }),
      image
    );

    expect(context.drawImage).toHaveBeenCalledWith(image, 1.5, 2.25, 15, 6);
    expect(context.drawStates[0].globalAlpha).toBeCloseTo(64 / 255);
    expect(context.drawStates[0].filter).toBe('grayscale(1)');
    expect(context.drawStates[0].imageSmoothingEnabled).toBe(true);
    expect(captureState(context)).toEqual({
      globalAlpha: 1,
      filter: 'contrast(2)',
      imageSmoothingEnabled: false,
    });
  });

  it('restores context state when drawing fails', () => {
    const error = new Error('draw failed');
    const context = createContext();
    context.drawImage.mockImplementation(() => {
      throw error;
    });

    expect(() =>
      drawReferenceImage(
        context as unknown as CanvasRenderingContext2D,
        createEntry({ opacity: 255, desaturate: true }),
        createImage()
      )
    ).toThrow(error);

    expect(context.restore).toHaveBeenCalledOnce();
    expect(captureState(context)).toEqual({
      globalAlpha: 0.25,
      filter: 'blur(1px)',
      imageSmoothingEnabled: false,
    });
  });
});
