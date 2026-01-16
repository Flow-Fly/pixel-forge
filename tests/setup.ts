/**
 * Vitest test setup
 *
 * Provides canvas and IndexedDB mocking for happy-dom environment.
 */

import { vi } from 'vitest';
import 'fake-indexeddb/auto';

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
