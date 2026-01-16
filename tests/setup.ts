/**
 * Vitest test setup
 *
 * Provides canvas and IndexedDB mocking for happy-dom environment.
 */

import { vi } from 'vitest';
import 'fake-indexeddb/auto';

/**
 * Mock ImageBitmap class for testing
 */
class MockImageBitmap {
  width: number;
  height: number;

  constructor(width: number = 32, height: number = 32) {
    this.width = width;
    this.height = height;
  }

  close() {
    // no-op
  }
}

// Expose ImageBitmap globally
(globalThis as unknown as Record<string, unknown>).ImageBitmap = MockImageBitmap;

/**
 * Mock createImageBitmap function
 */
(globalThis as unknown as Record<string, unknown>).createImageBitmap = vi.fn(
  async (source: unknown): Promise<MockImageBitmap> => {
    if (source instanceof MockOffscreenCanvas) {
      return new MockImageBitmap(source.width, source.height);
    }
    return new MockImageBitmap(32, 32);
  }
);

/**
 * Mock OffscreenCanvas class for testing
 */
class MockOffscreenCanvas {
  width: number;
  height: number;
  private _context: OffscreenCanvasRenderingContext2D | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(contextId: string): OffscreenCanvasRenderingContext2D | null {
    if (contextId === '2d') {
      if (!this._context) {
        this._context = createMockOffscreenContext2D(this);
      }
      return this._context;
    }
    return null;
  }

  transferToImageBitmap(): MockImageBitmap {
    return new MockImageBitmap(this.width, this.height);
  }

  convertToBlob(): Promise<Blob> {
    return Promise.resolve(new Blob(['mock'], { type: 'image/png' }));
  }
}

// Expose OffscreenCanvas globally
(globalThis as unknown as Record<string, unknown>).OffscreenCanvas = MockOffscreenCanvas;

/**
 * Creates a mock OffscreenCanvasRenderingContext2D
 */
function createMockOffscreenContext2D(canvas: MockOffscreenCanvas): OffscreenCanvasRenderingContext2D {
  return {
    canvas,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,

    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),

    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),

    drawImage: vi.fn(),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
      colorSpace: 'srgb' as PredefinedColorSpace,
    })),
    getImageData: vi.fn((sx: number, sy: number, sw: number, sh: number) => ({
      data: new Uint8ClampedArray(sw * sh * 4),
      width: sw,
      height: sh,
      colorSpace: 'srgb' as PredefinedColorSpace,
    })),
    putImageData: vi.fn(),

    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),

    clip: vi.fn(),
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),

    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createPattern: vi.fn(() => null),
  } as unknown as OffscreenCanvasRenderingContext2D;
}

/**
 * Creates a fresh mock CanvasRenderingContext2D with independent call history.
 * Each canvas gets its own set of mocks to prevent cross-test contamination.
 */
function createMockContext2D(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return {
    // Properties
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    canvas,

    // Drawing methods
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),

    // Transform methods
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),

    // Image methods
    drawImage: vi.fn(),
    createImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(64 * 64 * 4),
      width: 64,
      height: 64,
    })),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(64 * 64 * 4),
      width: 64,
      height: 64,
    })),
    putImageData: vi.fn(),

    // Text methods
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),

    // Path methods
    clip: vi.fn(),
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),

    // Pixel manipulation
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createPattern: vi.fn(() => null),
  } as unknown as CanvasRenderingContext2D;
}

// Store original createElement
const originalCreateElement = document.createElement.bind(document);

// Override document.createElement to provide canvas mock
document.createElement = ((tagName: string) => {
  const element = originalCreateElement(tagName);

  if (tagName.toLowerCase() === 'canvas') {
    const canvas = element as HTMLCanvasElement;

    // Mock getContext to return a fresh mock context each time
    canvas.getContext = ((contextId: string) => {
      if (contextId === '2d') {
        return createMockContext2D(canvas);
      }
      return null;
    }) as typeof canvas.getContext;

    // Mock toDataURL
    canvas.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

    // Mock toBlob
    canvas.toBlob = vi.fn((callback) => {
      if (callback) {
        callback(new Blob(['mock'], { type: 'image/png' }));
      }
    });
  }

  return element;
}) as typeof document.createElement;
