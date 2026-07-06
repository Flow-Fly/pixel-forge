import { describe, it, expect, vi, beforeEach } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding — mock the boundaries.
vi.mock('../../src/services/persistence/indexed-db', () => ({
  persistenceService: {
    saveCurrentProject: vi.fn(async () => {}),
    loadCurrentProject: vi.fn(async () => null),
    clearCurrentProject: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
  isBinaryData: vi.fn(() => true),
}));

// happy-dom has no global ImageData constructor — minimal stand-in
class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number
  ) {}
}
vi.stubGlobal('ImageData', FakeImageData);

import {
  extractIndexRegion,
  writeIndexRegion,
} from '../../src/utils/buffer-region';
import { OptimizedDrawingCommand } from '../../src/commands/optimized-drawing-command';
import { layerStore } from '../../src/stores/layers';
import { animationStore } from '../../src/stores/animation';
import type { Rect } from '../../src/types/geometry';

const W = 8;
const H = 8;

function seq(length: number, offset = 0): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i + offset) % 256);
}

describe('index buffer region helpers', () => {
  it('extract -> write round-trips exactly', () => {
    const full = seq(W * H);
    const bounds: Rect = { x: 2, y: 3, width: 4, height: 3 };

    const region = extractIndexRegion(full, W, bounds);
    expect(region).toHaveLength(bounds.width * bounds.height);
    expect(region[0]).toBe(full[3 * W + 2]); // top-left of region

    const target = new Uint8Array(W * H); // zeros
    writeIndexRegion(target, W, bounds, region);

    // Inside bounds: copied; outside: untouched
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inside =
          x >= bounds.x &&
          x < bounds.x + bounds.width &&
          y >= bounds.y &&
          y < bounds.y + bounds.height;
        expect(target[y * W + x]).toBe(inside ? full[y * W + x] : 0);
      }
    }
  });

  it('tolerates bounds touching the buffer edge', () => {
    const full = seq(W * H);
    const bounds: Rect = { x: W - 2, y: H - 2, width: 2, height: 2 };
    const region = extractIndexRegion(full, W, bounds);
    expect(region[3]).toBe(full[W * H - 1]);

    const target = new Uint8Array(W * H);
    writeIndexRegion(target, W, bounds, region);
    expect(target[W * H - 1]).toBe(full[W * H - 1]);
  });
});

describe('OptimizedDrawingCommand', () => {
  // A minimal recording 2D-context stand-in (happy-dom has no real one)
  function makeFakeCanvas() {
    const putCalls: Array<{ x: number; y: number; data: Uint8ClampedArray }> =
      [];
    const fakeCtx = {
      putImageData: (img: { data: Uint8ClampedArray }, x: number, y: number) =>
        putCalls.push({ x, y, data: img.data }),
    };
    const canvas = {
      getContext: () => fakeCtx,
      width: W,
      height: H,
    } as unknown as HTMLCanvasElement;
    return { canvas, putCalls };
  }

  let layerId: string;
  const frameId = 'frame-1';
  const bounds: Rect = { x: 1, y: 1, width: 2, height: 2 };
  let putCalls: Array<{ x: number; y: number; data: Uint8ClampedArray }>;

  beforeEach(() => {
    // Seed a layer with a fake canvas and a cel carrying an index buffer
    const { canvas, putCalls: calls } = makeFakeCanvas();
    putCalls = calls;
    const layer = layerStore.addLayer('Test', W, H);
    layerId = layer.id;
    layerStore.updateLayer(layerId, { canvas });

    const cels = new Map(animationStore.cels.value);
    cels.set(`${layerId}:${frameId}`, {
      id: 'cel-1',
      layerId,
      frameId,
      canvas,
      indexBuffer: new Uint8Array(W * H).fill(7), // "after stroke" state
    });
    animationStore.cels.value = cels;
  });

  function makeCommand() {
    const before = new Uint8ClampedArray(bounds.width * bounds.height * 4);
    const after = new Uint8ClampedArray(bounds.width * bounds.height * 4).fill(
      255
    );
    return new OptimizedDrawingCommand(
      layerId,
      bounds,
      before,
      after,
      'Test stroke',
      {
        frameId,
        canvasWidth: W,
        previousIndexData: new Uint8Array(bounds.width * bounds.height), // zeros
        newIndexData: new Uint8Array(bounds.width * bounds.height).fill(7),
      }
    );
  }

  it('memory cost is proportional to stroke bounds, not canvas size', () => {
    const cmd = makeCommand();
    const regionPixels = bounds.width * bounds.height;
    // 2 RGBA arrays + 2 index arrays + fixed overhead
    expect(cmd.memorySize).toBe(regionPixels * 4 * 2 + regionPixels * 2 + 200);
  });

  it('undo restores the index buffer region (not just pixels)', () => {
    const cmd = makeCommand();
    cmd.undo();

    const buffer = animationStore.getCelIndexBuffer(layerId, frameId)!;
    // Inside bounds: restored to pre-stroke zeros; outside: untouched 7s
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inside =
          x >= bounds.x && x < bounds.x + 2 && y >= bounds.y && y < bounds.y + 2;
        expect(buffer[y * W + x]).toBe(inside ? 0 : 7);
      }
    }
    // Pixels were restored at the region origin
    expect(putCalls.at(-1)).toMatchObject({ x: bounds.x, y: bounds.y });
  });

  it('redo re-applies the index buffer region', () => {
    const cmd = makeCommand();
    cmd.undo();
    cmd.execute();

    const buffer = animationStore.getCelIndexBuffer(layerId, frameId)!;
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBe(7);
    }
    expect(putCalls).toHaveLength(2);
  });
});
