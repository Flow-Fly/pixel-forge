import { describe, expect, it, vi } from 'vitest';
import {
  createGuidedProject,
  createGuidedProjectFile,
} from '../../../src/services/paint-by-number/guided-project';
import type { NumberedGuide } from '../../../src/services/paint-by-number/guide-generator';

function guide(): NumberedGuide {
  return {
    palette: ['#111111', '#eeeeee'],
    target: new Uint8Array([1, 2, 0, 1]),
    width: 2,
    height: 2,
    complexity: {
      paintableCells: 3,
      paletteSize: 2,
      isolatedCells: 3,
      simplifiedCells: 0,
    },
  };
}

const settings = {
  longSide: 2,
  paletteSource: 'generated' as const,
  maxColors: 2,
  mapping: 'color' as const,
  simplifyIsolatedPixels: true,
};

describe('createGuidedProjectFile', () => {
  it('creates a blank normal project plus its durable guide', () => {
    const file = createGuidedProjectFile({
      guide: guide(),
      settings,
      sourceName: 'portrait.png',
      createdAt: 123,
    });

    expect(file.name).toBe('portrait guide');
    expect([file.width, file.height]).toEqual([2, 2]);
    expect(file.palette).toEqual(['#111111', '#eeeeee']);
    expect(file.layers).toHaveLength(1);
    expect(file.layers[0].name).toBe('Painting');
    expect(file.frames).toHaveLength(1);
    expect(file.frames[0].cels[0].indexData).toEqual([0, 0, 0, 0]);
    expect(file.guidedDrawing).toMatchObject({
      version: 1,
      target: [1, 2, 0, 1],
      settings,
      sourceName: 'portrait.png',
      createdAt: 123,
    });
  });

  it('rejects invalid guide data', () => {
    expect(() => createGuidedProjectFile({
      guide: { ...guide(), target: new Uint8Array([1]) },
      settings,
    })).toThrow('target does not match');

    expect(() => createGuidedProjectFile({
      guide: { ...guide(), palette: [] },
      settings,
    })).toThrow('at least one paint color');
  });
});

describe('createGuidedProject', () => {
  it('delegates a separate activated project to the workspace', async () => {
    const createProjectFromFile = vi.fn(async () => ({
      ok: true as const,
      item: {} as never,
      projectId: 'guided-id',
    }));

    const result = await createGuidedProject(
      { guide: guide(), settings, createdAt: 123 },
      {},
      { createProjectFromFile },
    );

    expect(result.projectId).toBe('guided-id');
    expect(createProjectFromFile).toHaveBeenCalledWith(
      expect.objectContaining({ guidedDrawing: expect.any(Object) }),
      { activate: true, saveActiveContext: true },
    );
  });
});
