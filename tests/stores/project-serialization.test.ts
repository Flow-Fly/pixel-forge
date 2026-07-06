import { describe, it, expect, vi, beforeEach } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding — mock the boundaries.
// The canvas codec mock makes this a STRUCTURAL round-trip test: metadata,
// layers, frames, palette, tags — not pixel contents (those need a real
// canvas and are covered by manual/browser verification).
vi.mock('../../src/services/persistence/indexed-db', () => ({
  projectRepository: {
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getLastOpenedProjectId: vi.fn(async () => null),
    setLastOpenedProjectId: vi.fn(async () => {}),
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
  canvasToPngBytes: vi.fn(async () => new Uint8Array([9, 9, 9])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

import { projectStore } from '../../src/stores/project';
import { layerStore } from '../../src/stores/layers';
import { animationStore } from '../../src/stores/animation';
import { paletteStore } from '../../src/stores/palette';
import { PROJECT_VERSION } from '../../src/types/project';
import type { ProjectFileInput } from '../../src/types/project';
import { loadImageDataToCanvas } from '../../src/utils/canvas-binary';

const PALETTE = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'];
const mockedLoadImageDataToCanvas = vi.mocked(loadImageDataToCanvas);

describe('project save -> load -> save round-trip (structural)', () => {
  beforeEach(async () => {
    vi.useFakeTimers(); // keeps auto-save + deferred resetView from firing
    await projectStore.newProject(16, 12);
    vi.useRealTimers();
  });

  async function buildSampleProject() {
    projectStore.name.value = 'Round Trip';
    paletteStore.setPalette([...PALETTE]);

    // Two layers with distinct settings
    const body = layerStore.layers.value[0];
    layerStore.updateLayer(body.id, { name: 'Body' });
    const fx = layerStore.addLayer('FX', 16, 12);
    fx.opacity = 0.5;
    fx.blendMode = 'multiply';
    fx.visible = false;

    // Three frames with custom durations
    animationStore.addFrame(false);
    animationStore.addFrame(false);
    const frames = animationStore.frames.value;
    expect(frames).toHaveLength(3);
    frames[0].duration = 100;
    frames[1].duration = 250;
    frames[2].duration = 400;

    animationStore.fps.value = 24;

    // A frame tag (index-based, so it must survive id regeneration)
    animationStore.addFrameTag('walk', '#ffaa00', 0, 1);

    return await projectStore.saveProject();
  }

  it('preserves project metadata, layers, frames, palette, and tags', async () => {
    const saved = await buildSampleProject();

    expect(saved.version).toBe(PROJECT_VERSION);

    // Simulate a reload from storage (JSON-ish structured clone)
    vi.useFakeTimers();
    await projectStore.loadProject(structuredClone(saved), false);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const resaved = await projectStore.saveProject();

    // Project metadata
    expect(resaved.name).toBe('Round Trip');
    expect(resaved.width).toBe(16);
    expect(resaved.height).toBe(12);
    expect(resaved.version).toBe(saved.version);

    // Palette
    expect(resaved.palette).toEqual(PALETTE);

    // Layers: ids ARE preserved by loadProject; settings must survive
    expect(resaved.layers.map((l) => l.id)).toEqual(saved.layers.map((l) => l.id));
    expect(resaved.layers.map((l) => l.name)).toEqual(['Body', 'FX']);
    expect(resaved.layers[1].opacity).toBe(0.5);
    expect(resaved.layers[1].blendMode).toBe('multiply');
    expect(resaved.layers[1].visible).toBe(false);
    expect(resaved.layers[0].visible).toBe(true);

    // Frames: ids are regenerated on load, but count/durations/order survive
    expect(resaved.frames).toHaveLength(3);
    expect(resaved.frames.map((f) => f.duration)).toEqual([100, 250, 400]);

    // Every frame has one cel per layer
    for (const frame of resaved.frames) {
      expect(frame.cels.map((c) => c.layerId).sort()).toEqual(
        resaved.layers.map((l) => l.id).sort()
      );
    }

    // Animation settings
    expect(resaved.animation.fps).toBe(24);

    // Tags (index-based)
    expect(resaved.tags).toHaveLength(1);
    expect(resaved.tags?.[0]).toMatchObject({
      name: 'walk',
      color: '#ffaa00',
      startFrameIndex: 0,
      endFrameIndex: 1,
    });
  });

  it('a second round-trip is a fixed point (no drift)', async () => {
    const saved = await buildSampleProject();

    vi.useFakeTimers();
    await projectStore.loadProject(structuredClone(saved), false);
    await vi.runAllTimersAsync();
    const once = await projectStore.saveProject();

    await projectStore.loadProject(structuredClone(once), false);
    await vi.runAllTimersAsync();
    const twice = await projectStore.saveProject();
    vi.useRealTimers();

    // Frame ids and linked-cel group ids regenerate every load; normalize
    // both (linked ids by order of first appearance, preserving grouping).
    const normalize = (file: typeof once) => {
      const linkIds = new Map<string, string>();
      return {
        ...file,
        frames: file.frames.map((f) => ({
          ...f,
          id: 'X',
          cels: f.cels.map((c) => {
            if (!c.linkedCelId) return c;
            if (!linkIds.has(c.linkedCelId)) {
              linkIds.set(c.linkedCelId, `link-${linkIds.size}`);
            }
            return { ...c, linkedCelId: linkIds.get(c.linkedCelId) };
          }),
        })),
      };
    };
    expect(normalize(twice)).toEqual(normalize(once));
  });

  it('preserves the ephemeral palette across save/load', async () => {
    await buildSampleProject();
    paletteStore.getOrAddColorForDrawing('#123456');

    const saved = await projectStore.saveProject();
    expect(saved.ephemeralPalette).toEqual(['#123456']);

    vi.useFakeTimers();
    await projectStore.loadProject(structuredClone(saved), false);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(paletteStore.ephemeralColors.value).toContain('#123456');
  });

  it('normalizes JSON-mangled project image data before hydrating canvases', async () => {
    const saved = await buildSampleProject();
    const imported = JSON.parse(JSON.stringify(saved)) as ProjectFileInput;

    mockedLoadImageDataToCanvas.mockClear();

    vi.useFakeTimers();
    await projectStore.loadProject(imported, false);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(mockedLoadImageDataToCanvas).toHaveBeenCalled();
    for (const [data] of mockedLoadImageDataToCanvas.mock.calls) {
      expect(data).toBeInstanceOf(Uint8Array);
    }
  });
});
