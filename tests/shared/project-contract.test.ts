import { describe, expect, it } from 'vitest';
import { PROJECT_VERSION, decodeProjectFile, type ProjectFile } from '../../shared/src/index';

function completeProject(): ProjectFile {
  return {
    version: PROJECT_VERSION,
    name: 'Shared contract',
    width: 2,
    height: 2,
    palette: ['#112233', '#ffffff'],
    layers: [
      {
        id: 'paint',
        name: 'Paint',
        type: 'image',
        visible: true,
        opacity: 255,
        blendMode: 'normal',
        continuous: false,
        data: Uint8Array.from([1, 2, 3]),
      },
      {
        id: 'reference',
        name: 'Reference',
        type: 'reference',
        visible: true,
        opacity: 128,
        data: new Uint8Array(0),
        referenceData: {
          bytes: Uint8Array.from([4, 5, 6]),
          mimeType: 'image/png',
          x: 1.5,
          y: 2.5,
          scale: 0.75,
          desaturate: true,
          position: 'below',
        },
      },
    ],
    frames: [
      {
        id: 'frame-1',
        duration: 100,
        cels: [
          {
            layerId: 'paint',
            data: Uint8Array.from([7, 8, 9]),
            indexData: [1, 0, 2, 1],
            linkedCelId: 'linked-1',
            linkType: 'hard',
          },
        ],
      },
    ],
    animation: {
      fps: 12,
      currentFrameIndex: 0,
    },
    tags: [
      {
        id: 'tag-1',
        name: 'Loop',
        color: '#112233',
        startFrameIndex: 0,
        endFrameIndex: 0,
        collapsed: false,
      },
    ],
    guidedDrawing: {
      version: 1,
      width: 2,
      height: 2,
      target: [1, 0, 2, 1],
      guideColorCount: 2,
      settings: {
        longSide: 2,
        paletteSource: 'generated',
        maxColors: 2,
        mapping: 'color',
        simplifyIsolatedPixels: true,
      },
      sourceName: 'source.png',
      createdAt: 123,
    },
  };
}

describe('shared ProjectFile contract', () => {
  it('decodes a complete current project and restores serialized bytes', () => {
    const serialized = JSON.parse(JSON.stringify(completeProject())) as unknown;

    const decoded = decodeProjectFile(serialized);

    expect(decoded).toMatchObject({
      version: PROJECT_VERSION,
      name: 'Shared contract',
      width: 2,
      height: 2,
    });
    expect(decoded.layers[0].data).toEqual(Uint8Array.from([1, 2, 3]));
    expect(decoded.layers[1].referenceData?.bytes).toEqual(Uint8Array.from([4, 5, 6]));
    expect(decoded.frames[0].cels[0].data).toEqual(Uint8Array.from([7, 8, 9]));
  });

  it('rejects representative invalid project payloads', () => {
    const missingAnimation = {
      ...completeProject(),
      animation: undefined,
    };
    const unknownLayer = completeProject();
    unknownLayer.frames[0].cels[0].layerId = 'missing';

    expect(() => decodeProjectFile(null)).toThrow('project must be an object');
    expect(() => decodeProjectFile(missingAnimation)).toThrow('animation state is missing');
    expect(() => decodeProjectFile(unknownLayer)).toThrow('a cel references an unknown layer');
  });

  it('preserves the v3 ephemeral-palette migration without changing the format version', () => {
    const legacy = {
      ...completeProject(),
      version: '3.2.0',
      palette: ['#000000'],
      ephemeralPalette: ['#FFF', '#123456'],
    };
    legacy.frames[0].cels[0].indexData = [2, 3, 0, 1];

    const decoded = decodeProjectFile(legacy);

    expect(PROJECT_VERSION).toBe('4.1.0');
    expect(decoded.version).toBe('3.2.0');
    expect(decoded.palette).toEqual(['#000000', '#ffffff', '#123456']);
    expect(decoded.frames[0].cels[0].indexData).toEqual([2, 3, 0, 1]);
    expect(decoded).not.toHaveProperty('ephemeralPalette');
  });
});
