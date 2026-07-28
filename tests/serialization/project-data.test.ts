import { describe, expect, it } from 'vitest';
import {
  normalizeProjectFileImageData,
  normalizeProjectImageData,
} from '../../src/serialization/project-data';
import type { ProjectFileInput } from '../../src/types/project';

describe('project image data normalization', () => {
  it('keeps current Uint8Array data unchanged', () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(normalizeProjectImageData(bytes)).toBe(bytes);
  });

  it('restores JSON-mangled Uint8Array objects to bytes', () => {
    const bytes = normalizeProjectImageData({ 2: 30, 0: 10, 1: 20 });

    expect(Array.from(bytes)).toEqual([10, 20, 30]);
  });

  it('decodes legacy canvas data URLs to bytes', () => {
    const bytes = normalizeProjectImageData('data:image/png;base64,AQIDBA==');

    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it('accepts an exact case-insensitive base64 metadata token', () => {
    const bytes = normalizeProjectImageData(
      'data:image/png;charset=utf-8;BASE64,AQIDBA=='
    );

    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it('decodes legacy plain Base64 strings to bytes', () => {
    const bytes = normalizeProjectImageData('BQYH');

    expect(Array.from(bytes)).toEqual([5, 6, 7]);
  });

  it.each([
    ['', 'empty'],
    ['not base64', 'base64'],
    ['data:image/png,not-base64', 'base64'],
    ['data:base64,AQIDBA==', 'base64'],
    ['data:image/png;base64url,AQIDBA==', 'base64'],
    ['data:image/png;notbase64,AQIDBA==', 'base64'],
    ['data:image/png;encoding=base64,AQIDBA==', 'base64'],
    ['data:image/png;base64=true,AQIDBA==', 'base64'],
    ['data:image/png;base64,%%%%', 'base64'],
  ])('rejects malformed or unsupported legacy image data %j', (value, message) => {
    expect(() => normalizeProjectImageData(value)).toThrow(message);
  });

  it('normalizes every layer and cel before hydration', () => {
    const file: ProjectFileInput = {
      version: '1.0.0',
      name: 'Legacy',
      width: 8,
      height: 8,
      layers: [
        {
          id: 'layer-1',
          name: 'Layer 1',
          visible: true,
          opacity: 1,
          data: 'data:image/png;base64,AQID',
        },
        {
          id: 'reference-1',
          name: 'Reference',
          type: 'reference',
          visible: true,
          opacity: 128,
          data: {},
          referenceData: {
            bytes: { 0: 7, 1: 8, 2: 9 },
            mimeType: 'image/png',
            x: 1.5,
            y: 2.5,
            scale: 0.75,
          },
        },
      ],
      frames: [
        {
          id: 'frame-1',
          duration: 100,
          cels: [
            {
              layerId: 'layer-1',
              data: { 0: 4, 1: 5, 2: 6 },
            },
          ],
        },
      ],
      animation: {
        fps: 12,
        currentFrameIndex: 0,
      },
    };

    const normalized = normalizeProjectFileImageData(file);

    expect(normalized.layers[0].data).toBeInstanceOf(Uint8Array);
    expect(Array.from(normalized.layers[0].data)).toEqual([1, 2, 3]);
    expect(normalized.layers[1].referenceData?.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(normalized.layers[1].referenceData?.bytes ?? [])).toEqual([
      7, 8, 9,
    ]);
    expect(normalized.frames[0].cels[0].data).toBeInstanceOf(Uint8Array);
    expect(Array.from(normalized.frames[0].cels[0].data)).toEqual([4, 5, 6]);
  });
});
