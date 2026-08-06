import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import pako from 'pako';
import {
  PROJECT_VERSION,
  decodeProjectFile,
  decodeProjectFileWithDiagnostics,
  type ProjectFile,
} from '../../shared/src/index';

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
        locked: true,
        opacity: 255,
        blendMode: 'normal',
        continuous: false,
        parentId: null,
        data: Uint8Array.from([1, 2, 3]),
      },
      {
        id: 'reference',
        name: 'Reference',
        type: 'reference',
        visible: true,
        locked: false,
        opacity: 128,
        parentId: null,
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
            opacity: 40,
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

function serializedProject(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(completeProject())) as Record<string, unknown>;
}

async function readProjectFixture(filename: string): Promise<Record<string, unknown>> {
  const repositoryRoot =
    basename(process.cwd()) === 'shared' ? resolve(process.cwd(), '..') : process.cwd();
  const encoded = await readFile(
    resolve(repositoryRoot, 'tests/fixtures/project-files', filename),
    'utf8'
  );
  const compressed = Uint8Array.from(Buffer.from(encoded.trim(), 'base64'));
  return JSON.parse(pako.inflate(compressed, { to: 'string' })) as Record<string, unknown>;
}

const FIXTURE_PNG_BYTES = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 14, 73, 68, 65, 84, 120, 1, 98, 250, 255, 255, 255, 127, 0, 0, 0, 0,
  255, 255, 14, 200, 213, 204, 0, 0, 0, 6, 73, 68, 65, 84, 3, 0, 10, 5, 3, 255, 217, 59, 245, 175, 0, 0,
  0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

type ParsedPng = {
  width: number;
  height: number;
  compressedPixels: Buffer;
};

function inspectPng(bytes: Uint8Array): { width: number; height: number; rgba: number[] } {
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  const png = parsePng(bytes);
  return {
    width: png.width,
    height: png.height,
    rgba: decodePngPixels(inflateSync(png.compressedPixels), png.width, png.height),
  };
}

function parsePng(bytes: Uint8Array): ParsedPng {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks: Uint8Array[] = [];

  while (offset < bytes.length) {
    const length = readUint32(bytes, offset);
    const type = bytes.slice(offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = bytes.slice(dataStart, dataEnd);

    validatePngChunk(bytes, type, data, dataEnd);

    const name = new TextDecoder().decode(type);
    if (name === 'IHDR') {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      expect(data[8]).toBe(8);
      expect(data[9]).toBe(6);
    }
    if (name === 'IDAT') idatChunks.push(data);
    if (name === 'IEND') break;
    offset = dataEnd + 4;
  }

  return { width, height, compressedPixels: Buffer.concat(idatChunks.map((chunk) => Buffer.from(chunk))) };
}

function validatePngChunk(
  bytes: Uint8Array,
  type: Uint8Array,
  data: Uint8Array,
  dataEnd: number
): void {
  expect(dataEnd + 4).toBeLessThanOrEqual(bytes.length);
  expect(readUint32(bytes, dataEnd)).toBe(crc32(new Uint8Array([...type, ...data])));
}

function decodePngPixels(decoded: Uint8Array, width: number, height: number): number[] {
  const stride = width * 4;
  expect(decoded).toHaveLength((stride + 1) * height);

  const rgba = new Uint8Array(stride * height);
  let offsetInRow = 0;

  for (let y = 0; y < height; y++) {
    const filter = decoded[offsetInRow];
    expect(filter).toBeGreaterThanOrEqual(0);
    expect(filter).toBeLessThanOrEqual(4);
    offsetInRow++;

    for (let x = 0; x < stride; x++) {
      const value = decoded[offsetInRow++];
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const above = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0;
      rgba[y * stride + x] = (value + pngFilterPredictor(filter, left, above, upperLeft)) & 0xff;
    }
  }

  return Array.from(rgba);
}

function pngFilterPredictor(filter: number, left: number, above: number, upperLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return above;
    case 3:
      return Math.floor((left + above) / 2);
    case 4:
      return paethPredictor(left, above, upperLeft);
    default:
      throw new Error(`Unsupported PNG filter: ${filter}`);
  }
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function fixturePngs(project: ProjectFile): Uint8Array[] {
  return [
    ...project.layers.flatMap((layer) => [layer.data, layer.referenceData?.bytes]),
    ...project.frames.flatMap((frame) => frame.cels.map((cel) => cel.data)),
  ].filter((bytes): bytes is Uint8Array => bytes !== undefined && bytes.length > 0);
}

function currentFixtureLayers(project: ProjectFile) {
  const group = project.layers.find((layer) => layer.type === 'group');
  const paint = project.layers.find((layer) => layer.name === 'Paint');
  const reference = project.layers.find((layer) => layer.type === 'reference');

  if (!group || !paint || !reference) {
    throw new Error('Expected current group, paint, and reference fixture layers');
  }

  return { group, paint, reference };
}

describe('shared ProjectFile contract', () => {
  it('decodes a complete current project and restores serialized bytes', () => {
    const serialized = serializedProject();

    const decoded = decodeProjectFile(serialized);

    expect(decoded).toMatchObject({
      version: PROJECT_VERSION,
      name: 'Shared contract',
      width: 2,
      height: 2,
    });
    expect(decoded.layers[0].data).toEqual(Uint8Array.from([1, 2, 3]));
    expect(decoded.layers[0]).toMatchObject({
      type: 'image',
      locked: true,
      parentId: null,
    });
    expect(decoded.layers[1].referenceData?.bytes).toEqual(Uint8Array.from([4, 5, 6]));
    expect(decoded.frames[0].cels[0].data).toEqual(Uint8Array.from([7, 8, 9]));
    expect(decoded.frames[0].cels[0].opacity).toBe(40);
  });

  // Regression: #425
  it.each([
    ['plain strings', '', ' \n\t'],
    ['exact-base64 data URLs', 'data:image/png;base64,', 'data:image/png;charset=utf-8;BASE64,'],
  ])('opens legacy projects with empty %s', (_name, layerData, celData) => {
    const serialized = serializedProject();
    const layers = serialized.layers as Array<Record<string, unknown>>;
    const frames = serialized.frames as Array<Record<string, unknown>>;
    const cels = frames[0].cels as Array<Record<string, unknown>>;
    layers[0].data = layerData;
    cels[0].data = celData;

    const decoded = decodeProjectFile(serialized);

    expect(decoded.layers[0].data).toEqual(new Uint8Array(0));
    expect(decoded.frames[0].cels[0].data).toEqual(new Uint8Array(0));
  });

  it.each([
    ['leading-zero', { '01': 1 }],
    ['sparse', { 0: 1, 2: 3 }],
    ['unbounded-sparse', { 1_000_000: 1 }],
  ])('rejects %s serialized byte keys before normalization', (_name, data) => {
    const serialized = serializedProject();
    const layers = serialized.layers as Array<Record<string, unknown>>;
    layers[0].data = data;

    expect(() => decodeProjectFile(serialized)).toThrow('layer image data is invalid');
  });

  it.each([
    ['negative', -1],
    ['above-byte', 256],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s cel and guide byte values', (_name, value) => {
    const invalidCel = completeProject();
    invalidCel.frames[0].cels[0].indexData = [value];

    const invalidGuide = completeProject();
    invalidGuide.guidedDrawing!.target[0] = value;

    expect(() => decodeProjectFile(invalidCel)).toThrow('cel index data is invalid');
    expect(() => decodeProjectFile(invalidGuide)).toThrow('guided drawing target is invalid');
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

    expect(PROJECT_VERSION).toBe('4.2.0');
    expect(decoded.version).toBe('3.2.0');
    expect(decoded.palette).toEqual(['#000000', '#ffffff', '#123456']);
    expect(decoded.frames[0].cels[0].indexData).toEqual([2, 3, 0, 1]);
    expect(decoded).not.toHaveProperty('ephemeralPalette');
  });

  it('migrates missing 4.1.0 editing fields without a compatibility repair', () => {
    const legacy = serializedProject();
    legacy.version = '4.1.0';
    const layers = legacy.layers as Array<Record<string, unknown>>;
    const cels = ((legacy.frames as Array<Record<string, unknown>>)[0].cels ?? []) as Array<
      Record<string, unknown>
    >;
    delete layers[0].type;
    delete layers[0].locked;
    delete layers[0].parentId;
    delete cels[0].opacity;

    const result = decodeProjectFileWithDiagnostics(legacy);

    expect(result.project.layers[0]).toMatchObject({
      type: 'image',
      locked: false,
      parentId: null,
    });
    expect(result.project.frames[0].cels[0].opacity).toBe(100);
    expect(result.compatibility.repairedParentLayerIds).toEqual([]);
  });

  it.each([
    [
      'layer type',
      'layer type is invalid',
      (project: Record<string, unknown>) => {
        delete (project.layers as Array<Record<string, unknown>>)[0].type;
      },
    ],
    [
      'layer lock',
      'layer lock is invalid',
      (project: Record<string, unknown>) => {
        delete (project.layers as Array<Record<string, unknown>>)[0].locked;
      },
    ],
    [
      'layer parent',
      'layer parent is invalid',
      (project: Record<string, unknown>) => {
        delete (project.layers as Array<Record<string, unknown>>)[0].parentId;
      },
    ],
    [
      'cel opacity',
      'cel opacity is invalid',
      (project: Record<string, unknown>) => {
        const frames = project.frames as Array<Record<string, unknown>>;
        delete (frames[0].cels as Array<Record<string, unknown>>)[0].opacity;
      },
    ],
  ])('rejects a 4.2.0 document that omits %s', (_name, error, omitField) => {
    const current = serializedProject();

    omitField(current);

    expect(() => decodeProjectFile(current)).toThrow(error);
  });

  it('preserves valid stored hierarchy and repairs invalid parent edges in stored order', () => {
    const project = completeProject();
    project.layers = [
      {
        ...project.layers[0],
        id: 'child',
        parentId: 'parent',
      },
      {
        ...project.layers[0],
        id: 'parent',
        type: 'group',
        parentId: 'child',
      },
      {
        ...project.layers[0],
        id: 'nested',
        parentId: 'parent',
      },
      {
        ...project.layers[0],
        id: 'unknown',
        parentId: 'missing',
      },
      {
        ...project.layers[0],
        id: 'non-group-child',
        parentId: 'nested',
      },
      {
        ...project.layers[0],
        id: 'self',
        parentId: 'self',
      },
    ];
    project.frames[0].cels = project.layers.map((layer) => ({
      ...project.frames[0].cels[0],
      layerId: layer.id,
    }));

    const result = decodeProjectFileWithDiagnostics(project);

    expect(result.project.layers.map((layer) => layer.id)).toEqual([
      'child',
      'parent',
      'nested',
      'unknown',
      'non-group-child',
      'self',
    ]);
    expect(result.project.layers.map((layer) => layer.parentId)).toEqual([
      'parent',
      null,
      'parent',
      null,
      null,
      null,
    ]);
    expect(result.compatibility.repairedParentLayerIds).toEqual([
      'parent',
      'unknown',
      'non-group-child',
      'self',
    ]);
  });

  it('rejects invalid provided lock, parent, and cel opacity values', () => {
    const invalidLock = serializedProject();
    const invalidParent = serializedProject();
    const invalidOpacity = serializedProject();
    (invalidLock.layers as Array<Record<string, unknown>>)[0].locked = 'yes';
    (invalidParent.layers as Array<Record<string, unknown>>)[0].parentId = '';
    (
      ((invalidOpacity.frames as Array<Record<string, unknown>>)[0].cels ?? []) as Array<
        Record<string, unknown>
      >
    )[0].opacity = 101;

    expect(() => decodeProjectFile(invalidLock)).toThrow('layer lock is invalid');
    expect(() => decodeProjectFile(invalidParent)).toThrow('layer parent is invalid');
    expect(() => decodeProjectFile(invalidOpacity)).toThrow('cel opacity is invalid');
  });

  it('reaches a stable decoded project after a hierarchy repair', () => {
    const malformed = completeProject();
    malformed.layers[0].parentId = malformed.layers[0].id;

    const once = decodeProjectFileWithDiagnostics(malformed);
    const twice = decodeProjectFileWithDiagnostics(once.project);

    expect(twice.project).toEqual(once.project);
    expect(twice.compatibility.repairedParentLayerIds).toEqual([]);
  });

  it('reads the checked-in 4.1 .pf fixture with its legacy writer shape', async () => {
    const legacy = decodeProjectFileWithDiagnostics(await readProjectFixture('legacy-4.1.pf.base64'));

    expect(legacy.project.version).toBe('4.1.0');
    expect(legacy.project.layers.map((layer) => layer.type)).toEqual([
      'group',
      'image',
      'text',
      'reference',
    ]);
    expect(legacy.project.layers.every((layer) => layer.locked === false)).toBe(true);
    expect(legacy.project.layers.every((layer) => layer.parentId === null)).toBe(true);
    expect(
      legacy.project.frames.flatMap((frame) => frame.cels).every((cel) => cel.opacity === 100)
    ).toBe(true);
    // The exact 4.1 writer at d737ac42e8a5319ac88e1fdfa3e1de4b620dc10c
    // serialized each non-reference layer for every frame. When a group was
    // created after the stored frames, it had no layer canvas and emitted an
    // empty cel per frame. Keep this archive shape as compatibility evidence.
    const legacyGroup = legacy.project.layers.find((layer) => layer.type === 'group');
    const legacyReference = legacy.project.layers.find((layer) => layer.type === 'reference');
    if (!legacyGroup || !legacyReference) throw new Error('Expected group and reference fixture layers');
    expect(Array.from(legacyGroup.data)).toEqual([]);
    expect(
      legacy.project.frames.map((frame) => frame.cels.find((cel) => cel.layerId === legacyGroup.id))
    ).toEqual([
      expect.objectContaining({ layerId: legacyGroup.id, data: new Uint8Array(0), opacity: 100 }),
      expect.objectContaining({ layerId: legacyGroup.id, data: new Uint8Array(0), opacity: 100 }),
    ]);
    expect(
      legacy.project.frames.flatMap((frame) => frame.cels).some((cel) => cel.layerId === legacyReference.id)
    ).toBe(false);
    expect(legacy.compatibility.repairedParentLayerIds).toEqual([]);
  });

  it('reads the checked-in 4.2 .pf fixture without losing editing state', async () => {
    const current = decodeProjectFileWithDiagnostics(
      await readProjectFixture('current-4.2.pf.base64')
    );

    expect(current.project.version).toBe('4.2.0');
    const { group: currentGroup, paint: currentPaint, reference: currentReference } = currentFixtureLayers(
      current.project
    );
    expect(currentPaint).toMatchObject({
      type: 'image',
      locked: true,
      parentId: currentGroup.id,
    });
    expect(Array.from(currentPaint.data)).toEqual(FIXTURE_PNG_BYTES);
    expect(Array.from(currentReference.referenceData?.bytes ?? [])).toEqual(
      FIXTURE_PNG_BYTES
    );
    expect(Array.from(currentGroup.data)).toEqual([]);
    expect(
      current.project.frames.map((frame) => frame.cels.find((cel) => cel.layerId === currentGroup.id))
    ).toEqual([
      expect.objectContaining({ data: new Uint8Array(0), opacity: 100 }),
      expect.objectContaining({ data: new Uint8Array(0), opacity: 100 }),
    ]);
    const paintCels = current.project.frames.map((frame) =>
      frame.cels.find((cel) => cel.layerId === currentPaint.id)
    );
    expect(paintCels).toEqual([
      expect.objectContaining({ opacity: 45, indexData: [2], linkType: 'hard' }),
      expect.objectContaining({ opacity: 45, indexData: [2], linkType: 'hard' }),
    ]);
    expect(paintCels[0]?.linkedCelId).toEqual(expect.any(String));
    expect(paintCels.map((cel) => cel?.linkedCelId)).toEqual([
      paintCels[0]?.linkedCelId,
      paintCels[0]?.linkedCelId,
    ]);
    expect(current.project.tags?.[0]).toMatchObject({
      name: 'walk',
      startFrameIndex: 0,
      endFrameIndex: 1,
    });
    expect(current.project.guidedDrawing).toMatchObject({ sourceName: 'guide.png', target: [2] });
    expect(current.compatibility.repairedParentLayerIds).toEqual([]);
  });

  it('validates real-browser fixture PNGs and their palette index meaning', async () => {
    const legacy = decodeProjectFile(await readProjectFixture('legacy-4.1.pf.base64'));
    const current = decodeProjectFile(await readProjectFixture('current-4.2.pf.base64'));

    for (const png of [...fixturePngs(legacy), ...fixturePngs(current)]) {
      inspectPng(png);
    }

    const paint = current.layers.find((layer) => layer.name === 'Paint');
    const paintCel = current.frames[0].cels.find((cel) => cel.layerId === paint?.id);
    if (!paintCel?.indexData) throw new Error('Expected indexed paint cel');

    const png = inspectPng(paintCel.data);
    expect({ width: png.width, height: png.height, rgba: png.rgba }).toEqual({
      width: 1,
      height: 1,
      rgba: [255, 255, 255, 255],
    });
    expect(current.palette[paintCel.indexData[0] - 1]).toBe('#ffffff');
  });
});
