import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pako from 'pako';

const canvasBytes = vi.hoisted(() => new WeakMap<HTMLCanvasElement, Uint8Array>());

// happy-dom has neither IndexedDB nor canvas encoding — mock the boundaries.
// The canvas codec mock preserves loaded bytes through the writer, proving the
// file boundary without claiming that happy-dom rendered the PNG pixels.
vi.mock('../../src/services/persistence/indexed-db', () => ({
  projectRepository: {
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getLastOpenedProjectId: vi.fn(async () => null),
    setLastOpenedProjectId: vi.fn(async () => {}),
    getWorkspaceState: vi.fn(async () => null),
    setWorkspaceState: vi.fn(async () => {}),
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
  canvasToPngBytes: vi.fn(async (canvas: HTMLCanvasElement) => {
    return canvasBytes.get(canvas) ?? new Uint8Array([9, 9, 9]);
  }),
  loadImageDataToCanvas: vi.fn(async (data: Uint8Array, canvas: HTMLCanvasElement) => {
    canvasBytes.set(canvas, new Uint8Array(data));
  }),
}));

import { projectStore } from '../../src/stores/project';
import { layerStore } from '../../src/stores/layers';
import { animationStore } from '../../src/stores/animation';
import { paletteStore } from '../../src/stores/palette';
import { guidedDrawingStore } from '../../src/stores/guided-drawing';
import { PROJECT_VERSION, decodeProjectFileWithDiagnostics } from '../../src/types/project';
import type { ProjectFile, ProjectFileInput } from '../../src/types/project';
import { loadImageDataToCanvas } from '../../src/utils/canvas-binary';

const PALETTE = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'];
const mockedLoadImageDataToCanvas = vi.mocked(loadImageDataToCanvas);

async function readCompressedProjectFixture(filename: string): Promise<ProjectFileInput> {
  const encoded = await readFile(
    resolve(process.cwd(), 'tests/fixtures/project-files', filename),
    'utf8'
  );
  const compressed = Uint8Array.from(Buffer.from(encoded.trim(), 'base64'));
  return JSON.parse(pako.inflate(compressed, { to: 'string' })) as ProjectFileInput;
}

function normalizeRoundTripFile(file: ProjectFile): ProjectFile {
  const linkIds = new Map<string, string>();

  return {
    ...file,
    version: PROJECT_VERSION,
    frames: file.frames.map((frame, frameIndex) => ({
      ...frame,
      id: `frame-${frameIndex}`,
      cels: frame.cels.map((cel) => {
        if (!cel.linkedCelId) return cel;
        if (!linkIds.has(cel.linkedCelId)) {
          linkIds.set(cel.linkedCelId, `link-${linkIds.size}`);
        }
        return { ...cel, linkedCelId: linkIds.get(cel.linkedCelId) };
      }),
    })),
  };
}

function expectReferenceLayer(file: ProjectFile, layerId: string): void {
  const referenceLayer = file.layers.find((layer) => layer.id === layerId);

  expect(referenceLayer?.type).toBe('reference');
  expect(Array.from(referenceLayer?.referenceData?.bytes ?? [])).toEqual([1, 2, 3, 4]);
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

  it.each([
    ['legacy-4.1.pf.base64', '4.1.0'],
    ['current-4.2.pf.base64', '4.2.0'],
  ])(
    'round-trips the checked-in %s archive through decode, editor hydration, and the writer',
    async (fixtureName, sourceVersion) => {
      const input = await readCompressedProjectFixture(fixtureName);
      const source = decodeProjectFileWithDiagnostics(input).project;

      await projectStore.loadProject(input, false);
      const sourceCelsWithIndexData = source.frames.flatMap((frame) =>
        frame.cels.filter((cel) => cel.indexData !== undefined)
      );
      const hydratedIndexData = [...animationStore.cels.value.values()]
        .map((cel) => ({
          layerId: cel.layerId,
          indexData: cel.indexBuffer ? Array.from(cel.indexBuffer) : undefined,
        }))
        .filter((cel) =>
          sourceCelsWithIndexData.some((sourceCel) => sourceCel.layerId === cel.layerId)
        );
      const saved = decodeProjectFileWithDiagnostics(await projectStore.saveProject()).project;
      await projectStore.loadProject(saved, false);
      const reloaded = decodeProjectFileWithDiagnostics(await projectStore.saveProject()).project;

      expect(source.version).toBe(sourceVersion);
      expect(saved.version).toBe(PROJECT_VERSION);
      expect(normalizeRoundTripFile(reloaded)).toEqual(normalizeRoundTripFile(saved));
      expect(saved.frames.map((frame) => frame.cels.map((cel) => cel.layerId))).toEqual(
        source.frames.map((frame) => frame.cels.map((cel) => cel.layerId))
      );
      expect(
        reloaded.layers.map((layer) => ({
          id: layer.id,
          type: layer.type,
          locked: layer.locked,
          parentId: layer.parentId,
          data: Array.from(layer.data),
          textData: layer.textData,
          referenceBytes: Array.from(layer.referenceData?.bytes ?? []),
        }))
      ).toEqual(
        source.layers.map((layer) => {
          const savedLayer = saved.layers.find((candidate) => candidate.id === layer.id);
          const data =
            sourceVersion === '4.1.0' && layer.type === 'group'
              ? (savedLayer?.data ?? layer.data)
              : layer.data;

          return {
            id: layer.id,
            type: layer.type,
            locked: layer.locked,
            parentId: layer.parentId,
            data: Array.from(data),
            textData: layer.textData,
            referenceBytes: Array.from(layer.referenceData?.bytes ?? []),
          };
        })
      );
      expect(hydratedIndexData).toEqual(
        sourceCelsWithIndexData.map((cel) => ({
          layerId: cel.layerId,
          indexData: cel.indexData,
        }))
      );
      expect(
        reloaded.frames
          .flatMap((frame) => frame.cels)
          .map((cel) => ({
            layerId: cel.layerId,
            data: Array.from(cel.data),
            opacity: cel.opacity,
            linkType: cel.linkType,
            textCelData: cel.textCelData,
          }))
      ).toEqual(
        source.frames
          .flatMap((frame, frameIndex) =>
            frame.cels.map((cel) => {
              const savedCel = saved.frames[frameIndex]?.cels.find(
                (candidate) => candidate.layerId === cel.layerId
              );
              const expectedCel =
                sourceVersion === '4.1.0' && cel.layerId === 'group' && savedCel
                  ? savedCel
                  : cel;

              return {
                layerId: expectedCel.layerId,
                data: Array.from(expectedCel.data),
                opacity: expectedCel.opacity,
                linkType: expectedCel.linkType,
                textCelData: expectedCel.textCelData,
              };
            })
          )
      );
      expect(reloaded.palette).toEqual(source.palette);
      expect(reloaded.tags).toEqual(source.tags);
      expect(reloaded.guidedDrawing).toEqual(source.guidedDrawing);

      if (sourceVersion === '4.1.0') {
        const legacyGroup = source.layers.find((layer) => layer.id === 'group');
        expect(Array.from(legacyGroup?.data ?? [])).toEqual([]);
        expect(source.frames.map((frame) => frame.cels.find((cel) => cel.layerId === 'group'))).toEqual(
          [
            expect.objectContaining({ layerId: 'group', data: new Uint8Array(0), opacity: 100 }),
            expect.objectContaining({ layerId: 'group', data: new Uint8Array(0), opacity: 100 }),
          ]
        );
      }
    }
  );

  it('round-trips layer locks, groups, parent links, and cel opacity', async () => {
    const body = layerStore.layers.value[0];
    const shading = layerStore.addLayer('Shading', 16, 12);
    const groupId = layerStore.createGroup([body.id, shading.id], 'Character');
    if (!groupId) throw new Error('Expected the character group to be created');

    layerStore.updateLayer(body.id, { locked: true });
    const frameId = animationStore.frames.value[0].id;
    const bodyCelKey = animationStore.getCelKey(body.id, frameId);
    animationStore.setCelOpacity([bodyCelKey], 35);

    const saved = await projectStore.saveProject();
    await projectStore.loadProject(structuredClone(saved), false);
    const resaved = await projectStore.saveProject();

    expect(
      resaved.layers.map((layer) => ({
        id: layer.id,
        type: layer.type,
        locked: layer.locked,
        parentId: layer.parentId,
      }))
    ).toEqual(
      saved.layers.map((layer) => ({
        id: layer.id,
        type: layer.type,
        locked: layer.locked,
        parentId: layer.parentId,
      }))
    );
    expect(resaved.frames[0].cels.find((cel) => cel.layerId === body.id)?.opacity).toBe(35);
  });

  it('warns once after repairing an IndexedDB hierarchy without warning for legacy defaults', async () => {
    const saved = await buildSampleProject();
    const malformed = structuredClone(saved);
    malformed.layers[0].parentId = malformed.layers[0].id;
    const warningListener = vi.fn();
    window.addEventListener('show-warning-toast', warningListener);

    try {
      await projectStore.loadProject(malformed, false);
      expect(warningListener).toHaveBeenCalledOnce();
      expect(warningListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            message: `Repaired invalid group links for layers: ${malformed.layers[0].id}.`,
          },
        })
      );

      const legacy = structuredClone(saved) as ProjectFileInput;
      legacy.version = '4.1.0';
      delete legacy.layers[0].locked;
      delete legacy.layers[0].parentId;
      delete legacy.frames[0].cels[0].opacity;
      await projectStore.loadProject(legacy, false);
      expect(warningListener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('show-warning-toast', warningListener);
    }
  });

  it('bounds repaired hierarchy warnings while preserving the hidden layer count', async () => {
    const saved = await buildSampleProject();
    const malformed = structuredClone(saved);
    const oversizedLayerId = 'x'.repeat(100);
    malformed.layers = Array.from({ length: 5 }, (_, index) => ({
      ...malformed.layers[0],
      id: index === 0 ? oversizedLayerId : `${String(index).repeat(100)}`,
      parentId: 'missing-group',
    }));
    malformed.frames = malformed.frames.map((frame) => ({ ...frame, cels: [] }));
    const warningListener = vi.fn();
    window.addEventListener('show-warning-toast', warningListener);

    try {
      await projectStore.loadProject(malformed, false);

      const message = warningListener.mock.calls[0]?.[0].detail.message as string;
      expect(warningListener).toHaveBeenCalledOnce();
      expect(message.length).toBeLessThanOrEqual(240);
      expect(message).toContain(`${'x'.repeat(39)}…`);
      expect(message).toContain(', and 2 more.');
    } finally {
      window.removeEventListener('show-warning-toast', warningListener);
    }
  });

  it('drops every cel from the previous drawing when loading another project', async () => {
    const firstProject = await buildSampleProject();
    const secondProject = structuredClone(firstProject);
    const secondLayer = secondProject.layers[0];
    const secondFrame = secondProject.frames[0];
    secondProject.name = 'Second drawing';
    secondProject.layers = [{ ...secondLayer, id: 'second-layer' }];
    secondProject.frames = [
      {
        ...secondFrame,
        id: 'second-frame',
        cels: secondFrame.cels
          .filter((cel) => cel.layerId === secondLayer.id)
          .map((cel) => ({ ...cel, layerId: 'second-layer' })),
      },
    ];
    secondProject.animation.currentFrameIndex = 0;
    secondProject.tags = [];

    vi.useFakeTimers();
    await projectStore.loadProject(structuredClone(firstProject), false);
    await vi.runAllTimersAsync();
    await projectStore.loadProject(secondProject, false);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const currentLayerIds = new Set(layerStore.layers.value.map((layer) => layer.id));
    const currentFrameIds = new Set(animationStore.frames.value.map((frame) => frame.id));
    const currentCels = [...animationStore.cels.value.values()];

    expect(currentCels).toHaveLength(1);
    expect(currentCels.every((cel) => currentLayerIds.has(cel.layerId))).toBe(true);
    expect(currentCels.every((cel) => currentFrameIds.has(cel.frameId))).toBe(true);
  });

  it('serializes palette indices from the current canvas pixels', async () => {
    paletteStore.setPalette([]);
    const layerId = layerStore.layers.value[0].id;
    const frameId = animationStore.frames.value[0].id;
    const celKey = animationStore.getCelKey(layerId, frameId);
    const cel = animationStore.cels.value.get(celKey);
    if (!cel) throw new Error('Expected an initial cel');

    const canvas = {
      width: 1,
      height: 1,
      getContext: () => ({
        getImageData: () => ({
          data: new Uint8ClampedArray([255, 0, 0, 255]),
        }),
      }),
    } as unknown as HTMLCanvasElement;
    const cels = new Map(animationStore.cels.value);
    cels.set(celKey, {
      ...cel,
      canvas,
      indexBuffer: new Uint8Array([0]),
      linkedCelId: undefined,
      linkType: undefined,
    });
    animationStore.cels.value = cels;

    const saved = await projectStore.saveProject();

    expect(saved.frames[0].cels[0].indexData).toEqual([1]);
    expect(saved.palette).toEqual(['#ff0000']);
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

  it('round-trips optional guided drawing state', async () => {
    const saved = await buildSampleProject();
    guidedDrawingStore.start({
      version: 1,
      width: 2,
      height: 2,
      target: new Uint8Array([1, 2, 0, 1]),
      settings: {
        longSide: 2,
        paletteSource: 'restricted',
        restrictedPalette: ['#000000', '#ffffff'],
        mapping: 'luminance',
        simplifyIsolatedPixels: true,
      },
      sourceName: 'source.png',
      createdAt: 123,
    });

    const withGuide = await projectStore.saveProject();
    expect(withGuide.guidedDrawing?.target).toEqual([1, 2, 0, 1]);

    guidedDrawingStore.clear();
    vi.useFakeTimers();
    await projectStore.loadProject(structuredClone(withGuide), false);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(guidedDrawingStore.session.value?.target).toEqual(new Uint8Array([1, 2, 0, 1]));
    expect((await projectStore.saveProject()).guidedDrawing).toEqual(withGuide.guidedDrawing);

    await projectStore.loadProject(saved, false);
    expect(guidedDrawingStore.active).toBe(false);
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

    const resavedReference = resaved.layers.find((layer) => layer.id === referenceLayer.id);
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
