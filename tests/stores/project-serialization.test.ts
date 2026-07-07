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
import type { ProjectFile, ProjectFileInput } from '../../src/types/project';
import { loadImageDataToCanvas } from '../../src/utils/canvas-binary';

const PALETTE = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'];
const mockedLoadImageDataToCanvas = vi.mocked(loadImageDataToCanvas);

function expectReferenceLayer(file: ProjectFile, layerId: string): void {
  const referenceLayer = file.layers.find((layer) => layer.id === layerId);

  expect(referenceLayer?.type).toBe('reference');
  expect(Array.from(referenceLayer?.referenceData?.bytes ?? [])).toEqual([
    1, 2, 3, 4,
  ]);
  expect(referenceLayer?.referenceData).toMatchObject({
    mimeType: 'image/png',
    x: 1.5,
    y: 2.5,
    scale: 0.75,
    desaturate: true,
    position: 'above',
  });
}

function expectNoFrameCelsForLayer(file: ProjectFile, layerId: string): void {
  for (const frame of file.frames) {
    expect(frame.cels.some((cel) => cel.layerId === layerId)).toBe(false);
  }
}

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

  it('does not write the legacy compatibility palette after drawing adds a color', async () => {
    await buildSampleProject();
    paletteStore.getOrAddColorForDrawing('#123456');

    const saved = await projectStore.saveProject();
    expect(saved.palette).toContain('#123456');
    expect('ephemeralPalette' in saved).toBe(false);
  });

  it('folds legacy compatibility palette colors into the main palette', async () => {
    const saved = await buildSampleProject();
    const legacyIndex = PALETTE.length + 1;
    const legacy = {
      ...structuredClone(saved),
      version: '3.2.0',
      palette: [...PALETTE],
      ephemeralPalette: ['#123456'],
    };
    legacy.frames[0].cels[0].indexData = [legacyIndex, 2, 0];

    vi.useFakeTimers();
    await projectStore.loadProject(legacy, false);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(paletteStore.mainColors.value).toEqual([...PALETTE, '#123456']);
    expect(paletteStore.getColorByIndex(PALETTE.length + 1)).toBe('#123456');
    expect(paletteStore.isNewColor('#123456')).toBe(false);

    const frameId = animationStore.frames.value[0].id;
    const layerId = legacy.frames[0].cels[0].layerId;
    expect(Array.from(animationStore.getCelIndexBuffer(layerId, frameId) ?? [])).toEqual([
      PALETTE.length + 1,
      2,
      0,
    ]);
  });

  it('deduplicates legacy compatibility colors and remaps old indices', async () => {
    const saved = await buildSampleProject();
    const legacy = {
      ...structuredClone(saved),
      version: '3.2.0',
      palette: [...PALETTE],
      ephemeralPalette: ['#ff0000', '#123456'],
    };
    legacy.frames[0].cels[0].indexData = [PALETTE.length + 1, PALETTE.length + 2];

    vi.useFakeTimers();
    await projectStore.loadProject(legacy, false);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(paletteStore.mainColors.value).toEqual([...PALETTE, '#123456']);

    const frameId = animationStore.frames.value[0].id;
    const layerId = legacy.frames[0].cels[0].layerId;
    expect(Array.from(animationStore.getCelIndexBuffer(layerId, frameId) ?? [])).toEqual([
      2,
      PALETTE.length + 1,
    ]);
  });

  it('loads the file palette for auto-save restores too', async () => {
    const saved = await buildSampleProject();
    paletteStore.setPalette(['#abcdef']);

    vi.useFakeTimers();
    await projectStore.loadProject(structuredClone(saved), true);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(paletteStore.mainColors.value).toEqual(PALETTE);
  });

  it('round-trips reference layer metadata without animation cels', async () => {
    await buildSampleProject();
    const referenceBytes = new Uint8Array([1, 2, 3, 4]);
    const referenceLayer = layerStore.addReferenceLayer(
      {
        bytes: referenceBytes,
        mimeType: 'image/png',
        x: 1.5,
        y: 2.5,
        scale: 0.75,
        desaturate: true,
        position: 'above',
      },
      'Reference'
    );

    const saved = await projectStore.saveProject();
    expectReferenceLayer(saved, referenceLayer.id);
    expectNoFrameCelsForLayer(saved, referenceLayer.id);

    vi.useFakeTimers();
    await projectStore.loadProject(structuredClone(saved), false);
    await vi.runAllTimersAsync();
    const resaved = await projectStore.saveProject();
    vi.useRealTimers();

    const resavedReference = resaved.layers.find(
      (layer) => layer.id === referenceLayer.id
    );
    expect(resavedReference?.id).toBe(referenceLayer.id);
    expectReferenceLayer(resaved, referenceLayer.id);
    expectNoFrameCelsForLayer(resaved, referenceLayer.id);
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
