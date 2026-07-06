import { describe, it, expect, vi } from 'vitest';

// The store graph touches IndexedDB and canvas encoding at module load /
// save time; neither exists in happy-dom, so mock them at the boundary.
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
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  loadImageDataToCanvas: vi.fn(async () => {}),
  isBinaryData: vi.fn(() => true),
}));

import { PROJECT_VERSION } from '../../src/types/project';
import { projectStore } from '../../src/stores/project';
import { layerStore } from '../../src/stores/layers';

describe('project file format version', () => {
  it('is in sync with the newest schema fields (3.2.0 = continuous layers)', () => {
    // If this fails, the ProjectFile schema changed without bumping
    // PROJECT_VERSION — bump it in the same PR (see src/types/project.ts).
    expect(PROJECT_VERSION).toBe('3.2.0');
  });

  it('stamps saved projects with PROJECT_VERSION and serializes current-format fields', async () => {
    if (layerStore.layers.value.length === 0) {
      layerStore.addLayer('Layer 1', 8, 8);
    }

    const file = await projectStore.saveProject();

    expect(file.version).toBe(PROJECT_VERSION);
    // v3.0+: palette is always serialized
    expect(Array.isArray(file.palette)).toBe(true);
    // v3.2+: continuous flag is always serialized on layers
    expect(file.layers.length).toBeGreaterThan(0);
    for (const layer of file.layers) {
      expect(layer).toHaveProperty('continuous');
    }
  });
});
