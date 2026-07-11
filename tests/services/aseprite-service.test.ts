import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { importAseFile } from '../../src/services/aseprite-service';
import { parseAseFile } from '../../src/services/aseprite-parser';
import { ProjectFileImportService } from '../../src/services/project-file-import';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
} from '../../src/stores/project-context';

const canvasContext = new Proxy(
  {
    imageSmoothingEnabled: false,
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    })),
  },
  {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return vi.fn();
    },
    set(target, key, value) {
      (target as Record<PropertyKey, unknown>)[key] = value;
      return true;
    },
  }
);

HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContext);
HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
  callback(new Blob([new Uint8Array(0)], { type: 'image/png' }));
});
vi.stubGlobal(
  'ImageData',
  class {
    readonly data: Uint8ClampedArray;

    constructor(
      readonly width: number,
      readonly height: number
    ) {
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
);

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  restoreDefaultProjectContext();
  vi.clearAllMocks();
});

describe('Aseprite import', () => {
  it('imports a real file into only the supplied project context', async () => {
    const sourceContext = createProjectContext();
    const targetContext = createProjectContext();
    const bytes = await readFile(resolve(process.cwd(), 'tests/Sprite-0001.ase'));
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const parsed = parseAseFile(buffer);
    const rebuildIndexBuffers = vi.spyOn(targetContext.animation, 'rebuildAllIndexBuffers');

    try {
      sourceContext.project.name.value = 'Drawing in progress';
      sourceContext.project.setSize(17, 19);
      setActiveProjectContext(sourceContext);

      await importAseFile(buffer, targetContext);

      expect(targetContext.project.width.value).toBe(parsed.header.width);
      expect(targetContext.project.height.value).toBe(parsed.header.height);
      expect(targetContext.layers.layers.value.map((layer) => layer.name)).toEqual(
        parsed.layers.filter((layer) => layer.type === 0).map((layer) => layer.name)
      );
      expect(sourceContext.project.name.value).toBe('Drawing in progress');
      expect(sourceContext.project.width.value).toBe(17);
      expect(sourceContext.project.height.value).toBe(19);
      expect(rebuildIndexBuffers).toHaveBeenCalledOnce();

      const linkedCel = parsed.frames
        .flatMap((frame, targetFrameIndex) => frame.cels.map((cel) => ({ cel, targetFrameIndex })))
        .find(({ cel }) => cel.celType === 1 && cel.linkedFrame !== undefined);
      expect(linkedCel).toBeDefined();
      if (!linkedCel || linkedCel.cel.linkedFrame === undefined) return;

      const imageLayerIndices = parsed.layers
        .map((layer, index) => (layer.type === 0 ? index : -1))
        .filter((index) => index >= 0);
      const importedLayerIndex = imageLayerIndices.indexOf(linkedCel.cel.layerIndex);
      const importedLayer = targetContext.layers.layers.value[importedLayerIndex];
      const sourceFrame = targetContext.animation.frames.value[linkedCel.cel.linkedFrame];
      const targetFrame = targetContext.animation.frames.value[linkedCel.targetFrameIndex];
      const sourceCel = targetContext.animation.cels.value.get(
        targetContext.animation.getCelKey(importedLayer.id, sourceFrame.id)
      );
      const targetCel = targetContext.animation.cels.value.get(
        targetContext.animation.getCelKey(importedLayer.id, targetFrame.id)
      );

      expect(targetCel?.canvas).toBe(sourceCel?.canvas);
      expect(targetCel?.indexBuffer).toBe(sourceCel?.indexBuffer);
    } finally {
      sourceContext.dispose();
      targetContext.dispose();
    }
  });

  it('converts a real Aseprite file into a named durable project', async () => {
    const bytes = await readFile(resolve(process.cwd(), 'tests/Sprite-0001.ase'));
    const file = new File([new Uint8Array(bytes)], 'tiny-fighter.aseprite');
    const projectLibrary = {
      importProjectFile: vi.fn(async () => 'aseprite-project'),
      deleteProject: vi.fn(async () => undefined),
    };
    const workspace = {
      openProject: vi.fn(async () => ({
        ok: true as const,
        projectId: 'aseprite-project',
        item: {} as never,
      })),
    };
    const service = new ProjectFileImportService({ projectLibrary, workspace });

    const result = await service.importFile(file);

    expect(result).toEqual({ projectId: 'aseprite-project', opened: true });
    expect(projectLibrary.importProjectFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'tiny-fighter' })
    );
  });
});
