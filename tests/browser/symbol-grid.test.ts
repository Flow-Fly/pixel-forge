import { afterEach, describe, expect, it } from 'vitest';
import {
  createAutomationAdapter,
  type AutomationAdapter,
} from '../../src/editor/automation-adapter';
import { createProjectContext, setActiveProjectContext, restoreDefaultProjectContext, type ProjectContext } from '../../src/stores/project-context';
import type { Cel, Frame } from '../../src/types/animation';
import type { Layer } from '../../src/types/layer';

const contexts: ProjectContext[] = [];

afterEach(() => {
  restoreDefaultProjectContext();
  for (const context of contexts.splice(0)) context.dispose();
});

describe('Symbol Grid raster boundary', () => {
  it('round-trips transparency and explicit RGBA without mutating the palette', async () => {
    const fixture = createRasterFixture();
    const beforePalette = fixture.context.palette.getProjectPaletteEntries();
    const before = await observeLayer(fixture);
    const red = before.legend.find((entry) => entry.paletteEntryId === 'palette-red');
    if (!red) throw new Error('Expected the red legend entry.');

    const clear = await patch(fixture, before, [{ x: 1, y: 1, width: 1, height: 1, rows: ['.'] }], [
      { symbol: red.symbol, paletteEntryId: 'palette-red' },
    ]);
    expect(clear).toMatchObject({ ok: true, result: { revision: 1 } });
    const cleared = await observeLayer(fixture, 1);
    expect(cleared.rows[1]?.[1]).toBe('.');
    expect(fixture.cel.indexBuffer?.[5]).toBe(0);

    const green = await patch(fixture, cleared, [{ x: 2, y: 2, width: 1, height: 1, rows: ['g'] }], [
      { symbol: 'g', color: '#00ff00ff' },
    ]);
    expect(green).toMatchObject({ ok: true, result: { revision: 2 } });
    expect(fixture.cel.indexBuffer?.[10]).toBe(3);
    expect(fixture.context.palette.getProjectPaletteEntries()).toEqual(beforePalette);

    const undo = await fixture.adapter.request({
      operation: 'project.history.undo', target: fixture.target, expectedRevision: 2,
    });
    expect(undo).toMatchObject({ ok: true, result: { revision: 3 } });
    expect(fixture.cel.indexBuffer?.[10]).toBe(0);
    const redo = await fixture.adapter.request({
      operation: 'project.history.redo', target: fixture.target, expectedRevision: 3,
    });
    expect(redo).toMatchObject({ ok: true, result: { revision: 4 } });
    expect(fixture.cel.indexBuffer?.[10]).toBe(3);
  });

  // fallow-ignore-next-line complexity -- The public no-index journey proves alpha persistence, replay, and exact absence together.
  it('keeps an originally absent index buffer absent through serialization and replay', async () => {
    const fixture = createRasterFixture('non-indexed-raster-project', 4, 4, false);
    const before = await observeLayer(fixture);
    const result = await patch(fixture, before, [
      { x: 2, y: 2, width: 1, height: 1, rows: ['g'] },
    ], [{ symbol: 'g', color: '#00ff0080' }]);
    expect(result).toMatchObject({ ok: true, result: { revision: 1 } });
    expect(currentCel(fixture)?.indexBuffer).toBeUndefined();

    const saved = await fixture.context.project.saveProject({ rebuildIndexBuffers: false });
    expect(currentCel(fixture)?.indexBuffer).toBeUndefined();
    expect(saved.frames[0]?.cels[0]?.indexData).toBeUndefined();

    const reopened = createProjectContext();
    contexts.push(reopened);
    await reopened.project.loadProject(saved, false);
    const reopenedLayer = reopened.layers.layers.value[0];
    const reopenedFrame = reopened.animation.frames.value[0];
    expect(reopenedLayer && reopenedFrame).toBeTruthy();
    expect(reopened.animation.cels.value.get(
      reopened.animation.getCelKey(reopenedLayer!.id, reopenedFrame!.id),
    )?.indexBuffer).toBeUndefined();
    const reopenedCel = reopenedLayer && reopenedFrame
      ? reopened.animation.cels.value.get(reopened.animation.getCelKey(reopenedLayer.id, reopenedFrame.id))
      : undefined;
    const reopenedDrawing = reopenedCel?.canvas.getContext('2d');
    expect(reopenedDrawing?.getImageData(2, 2, 1, 1).data).toEqual(
      new Uint8ClampedArray([0, 255, 0, 128]),
    );

    const undo = await fixture.adapter.request({
      operation: 'project.history.undo', target: fixture.target, expectedRevision: 1,
    });
    expect(undo).toMatchObject({ ok: true, result: { revision: 2 } });
    expect(currentCel(fixture)?.indexBuffer).toBeUndefined();

    const redo = await fixture.adapter.request({
      operation: 'project.history.redo', target: fixture.target, expectedRevision: 2,
    });
    expect(redo).toMatchObject({ ok: true, result: { revision: 3 } });
    expect(currentCel(fixture)?.indexBuffer).toBeUndefined();
  });

  it('rejects malformed rows, symbols, overlap, and bounds before history mutation', async () => {
    const fixture = createRasterFixture();
    const before = await observeLayer(fixture);
    const baseline = captureFixtureState(fixture);
    const red = before.legend.find((entry) => entry.paletteEntryId === 'palette-red');
    if (!red) throw new Error('Expected the red legend entry.');

    const cases = [
      { rows: [''], patches: [{ x: 0, y: 0, width: 1, height: 1, rows: [''] }] },
      { rows: ['?'], patches: [{ x: 0, y: 0, width: 1, height: 1, rows: ['?'] }] },
      { rows: [red.symbol], patches: [
        { x: 0, y: 0, width: 2, height: 1, rows: [red.symbol + red.symbol] },
        { x: 1, y: 0, width: 1, height: 1, rows: [red.symbol] },
      ] },
      { rows: [red.symbol], patches: [{ x: 4, y: 0, width: 1, height: 1, rows: [red.symbol] }] },
    ];
    for (const testCase of cases) {
      const result = await patch(fixture, before, testCase.patches, [
        { symbol: red.symbol, paletteEntryId: 'palette-red' },
      ]);
      expect(result.ok).toBe(false);
      expect(captureFixtureState(fixture)).toEqual(baseline);
    }

    const ambiguousLegend = await patch(fixture, before, [
      { x: 0, y: 0, width: 1, height: 1, rows: [red.symbol] },
    ], [{ symbol: red.symbol, paletteEntryId: 'palette-red', color: red.color }]);
    expect(ambiguousLegend).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(captureFixtureState(fixture)).toEqual(baseline);
  });

  it('rejects stale digests, missing colors, and incoherent indexed payloads atomically', async () => {
    const fixture = createRasterFixture();
    const before = await observeLayer(fixture);
    const red = before.legend.find((entry) => entry.paletteEntryId === 'palette-red');
    if (!red) throw new Error('Expected the red legend entry.');
    const baseline = captureFixtureState(fixture);
    const stale = await patch(fixture, { ...before, digest: '0'.repeat(64) }, [
      { x: 0, y: 0, width: 1, height: 1, rows: [red.symbol] },
    ], [{ symbol: red.symbol, paletteEntryId: 'palette-red' }]);
    expect(stale).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });

    const missingColor = await patch(fixture, before, [
      { x: 0, y: 0, width: 1, height: 1, rows: ['x'] },
    ], [{ symbol: 'x', color: '#112233ff' }]);
    expect(missingColor).toMatchObject({ ok: false, error: { code: 'target_not_found' } });

    const partialIndexedAlpha = await patch(fixture, before, [
      { x: 0, y: 0, width: 1, height: 1, rows: ['p'] },
    ], [{ symbol: 'p', color: '#ff000080' }]);
    expect(partialIndexedAlpha).toMatchObject({
      ok: false,
      error: { code: 'unsupported', details: { reason: 'indexed_alpha' } },
    });
    expect(captureFixtureState(fixture)).toEqual(baseline);

    fixture.cel.indexBuffer![0] = 2;
    const incoherent = await fixture.adapter.request({
      operation: 'project.raster.observe',
      target: fixture.target,
      expectedRevision: 0,
      source: { kind: 'layer', layerId: fixture.layer.id, frameId: fixture.frame.id },
      region: { x: 0, y: 0, width: 4, height: 4 },
    });
    expect(incoherent).toMatchObject({ ok: false, error: { code: 'invalid_state' } });
    expect(fixture.context.project.revision.value).toBe(0);
    expect(fixture.context.history.undoStack.value).toHaveLength(0);

    const staleFixture = createRasterFixture('stale-raster-project');
    const staleBefore = await observeLayer(staleFixture);
    const staleRed = staleBefore.legend.find((entry) => entry.paletteEntryId === 'palette-red');
    if (!staleRed) throw new Error('Expected the stale fixture red legend entry.');
    await patch(staleFixture, staleBefore, [
      { x: 0, y: 0, width: 1, height: 1, rows: [staleRed.symbol] },
    ], [{ symbol: staleRed.symbol, paletteEntryId: 'palette-red' }]);
    const staleRevision = await patch(staleFixture, staleBefore, [
      { x: 2, y: 2, width: 1, height: 1, rows: [staleRed.symbol] },
    ], [{ symbol: staleRed.symbol, paletteEntryId: 'palette-red' }]);
    expect(staleRevision).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
  });

  it('rejects aggregate patch area before reading a large canvas', async () => {
    const fixture = createRasterFixture('area-raster-project', 64, 64);
    const before = await observeLayer(fixture);
    const red = before.legend.find((entry) => entry.paletteEntryId === 'palette-red');
    if (!red) throw new Error('Expected the area fixture red legend entry.');
    const row = red.symbol.repeat(64);
    const patches = [
      { x: 0, y: 0, width: 64, height: 64, rows: Array.from({ length: 64 }, () => row) },
      { x: 0, y: 0, width: 64, height: 64, rows: Array.from({ length: 64 }, () => row) },
    ];
    const result = await patch(fixture, before, patches, [
      { symbol: red.symbol, paletteEntryId: 'palette-red' },
    ]);
    expect(result).toMatchObject({ ok: false, error: { code: 'limit_exceeded' } });
    expect(fixture.context.project.revision.value).toBe(0);
    expect(fixture.context.history.undoStack.value).toHaveLength(0);
  });

  it('rejects floating selection, linked payloads, and an inactive target without touching other context', async () => {
    const fixture = createRasterFixture('raster-target');
    const other = createRasterFixture('raster-other');
    setActiveProjectContext(other.context);
    const otherBaseline = captureFixtureState(other);
    const before = await observeLayer(fixture);
    const red = before.legend.find((entry) => entry.paletteEntryId === 'palette-red');
    if (!red) throw new Error('Expected the red legend entry.');

    fixture.context.selection.setFloating(new ImageData(1, 1), { x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    const floating = await patch(fixture, before, [{ x: 0, y: 0, width: 1, height: 1, rows: [red.symbol] }], [
      { symbol: red.symbol, paletteEntryId: 'palette-red' },
    ]);
    expect(floating).toMatchObject({ ok: false, error: { code: 'invalid_state' } });
    fixture.context.selection.clear();

    fixture.cel.linkedCelId = 'linked';
    const linked = await fixture.adapter.request({
      operation: 'project.raster.observe',
      target: fixture.target,
      expectedRevision: 0,
      source: { kind: 'layer', layerId: fixture.layer.id, frameId: fixture.frame.id },
      region: { x: 0, y: 0, width: 4, height: 4 },
    });
    expect(linked).toMatchObject({ ok: false, error: { code: 'unsupported' } });
    fixture.cel.linkedCelId = undefined;

    const sharedIndexCel = {
      ...fixture.cel,
      id: 'shared-index-cel',
      layerId: 'shared-index-layer',
      canvas: document.createElement('canvas'),
    };
    sharedIndexCel.canvas.width = fixture.width;
    sharedIndexCel.canvas.height = fixture.height;
    const originalCels = fixture.context.animation.cels.value;
    fixture.context.animation.cels.value = new Map(originalCels).set(
      `${sharedIndexCel.layerId}:${sharedIndexCel.frameId}`,
      sharedIndexCel,
    );
    const sharedIndex = await fixture.adapter.request({
      operation: 'project.raster.observe',
      target: fixture.target,
      expectedRevision: 0,
      source: { kind: 'layer', layerId: fixture.layer.id, frameId: fixture.frame.id },
      region: { x: 0, y: 0, width: 4, height: 4 },
    });
    expect(sharedIndex).toMatchObject({ ok: false, error: { code: 'unsupported' } });
    fixture.context.animation.cels.value = originalCels;

    const inactivePatch = await patch(fixture, before, [
      { x: 0, y: 0, width: 1, height: 1, rows: [red.symbol] },
    ], [{ symbol: red.symbol, paletteEntryId: 'palette-red' }]);
    expect(inactivePatch).toMatchObject({ ok: true, result: { revision: 1 } });
    expect(other.context.project.revision.value).toBe(otherBaseline.revision);
    expect(captureFixtureState(other)).toEqual(otherBaseline);
  });
});

interface RasterFixture {
  readonly context: ProjectContext;
  readonly adapter: AutomationAdapter;
  readonly target: { readonly projectId: string };
  readonly layer: Layer;
  readonly frame: Frame;
  readonly cel: Cel;
  readonly width: number;
  readonly height: number;
}

function createRasterFixture(projectId: string = 'raster-project', width = 4, height = 4, indexed = true): RasterFixture {
  const context = createProjectContext();
  contexts.push(context);
  context.project.id.value = projectId;
  context.project.setSize(width, height);
  context.palette.setPalette(
    ['#000000', '#ff0000', '#00ff00'],
    false,
    ['palette-black', 'palette-red', 'palette-green'],
  );
  const layer = context.layers.layers.value[0];
  const frame = context.animation.frames.value[0];
  if (!layer || !frame) throw new Error('Fixture did not create a layer and frame.');
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frame.id));
  if (!cel) throw new Error('Fixture did not create a cel.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Fixture did not create a drawing context.');
  drawing.fillStyle = '#ff0000';
  drawing.fillRect(1, 1, 1, 1);
  const indexBuffer = indexed ? new Uint8Array(width * height) : undefined;
  if (indexBuffer) indexBuffer[width + 1] = 2;
  context.layers.updateLayer(layer.id, { canvas });
  context.animation.cels.value = new Map([[
    context.animation.getCelKey(layer.id, frame.id),
    {
      ...cel,
      canvas,
      ...(indexBuffer ? { indexBuffer } : {}),
    },
  ]]);
  context.animation.syncLayerCanvases();
  const target = { projectId };
  const adapter = createAutomationAdapter({ targetRegistry: new Map([[projectId, context]]) });
  if (!adapter.negotiateCatalog({ version: '1.0' }).ok) throw new Error('Fixture negotiation failed.');
  return {
    context,
    adapter,
    target,
    layer,
    frame,
    cel: context.animation.cels.value.get(context.animation.getCelKey(layer.id, frame.id))!,
    width,
    height,
  };
}

function currentCel(fixture: RasterFixture): Cel | undefined {
  return fixture.context.animation.cels.value.get(
    fixture.context.animation.getCelKey(fixture.layer.id, fixture.frame.id),
  );
}

async function observeLayer(fixture: RasterFixture, revision = 0): Promise<{
  readonly target: { readonly projectId: string };
  readonly revision: number;
  readonly source: { readonly kind: 'layer'; readonly layerId: string; readonly frameId: string; readonly celId: string };
  readonly region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly rows: readonly string[];
  readonly legend: readonly { readonly symbol: string; readonly color: string; readonly paletteEntryId?: string }[];
  readonly digest: string;
}> {
  const result = await fixture.adapter.request({
    operation: 'project.raster.observe',
    target: fixture.target,
    expectedRevision: revision,
    source: { kind: 'layer', layerId: fixture.layer.id, frameId: fixture.frame.id },
    region: { x: 0, y: 0, width: fixture.width, height: fixture.height },
  });
  if (!result.ok) throw new Error(`Observation failed: ${JSON.stringify(result.error)}`);
  return result.result as never;
}

async function patch(
  fixture: RasterFixture,
  observation: { readonly revision: number; readonly source: { readonly celId: string }; readonly digest: string; readonly region: unknown },
  patches: readonly Readonly<Record<string, unknown>>[],
  legend: readonly Readonly<Record<string, unknown>>[],
) {
  return fixture.adapter.request({
    operation: 'project.transaction.execute',
    profile: 'raster-patch',
    target: fixture.target,
    expectedRevision: observation.revision,
    provenance: { clientId: 'test-client', sessionId: 'test-session', runId: 'test-run', operationId: 'test-patch' },
    children: [{
      command: 'project.raster.patch',
      input: {
        kind: 'raster.patch',
        layerId: fixture.layer.id,
        frameId: fixture.frame.id,
        celId: observation.source.celId,
        region: observation.region,
        digest: observation.digest,
        legend,
        patches,
      },
    }],
  });
}

function captureFixtureState(fixture: RasterFixture): {
  readonly revision: number;
  readonly indices: number[];
  readonly pixels: number[];
  readonly palette: unknown;
  readonly history: number;
} {
  const drawing = fixture.cel.canvas.getContext('2d');
  if (!drawing) throw new Error('Fixture lost its drawing context.');
  return {
    revision: fixture.context.project.revision.value,
    indices: Array.from(fixture.cel.indexBuffer ?? []),
    pixels: Array.from(drawing.getImageData(0, 0, fixture.width, fixture.height).data),
    palette: fixture.context.palette.getProjectPaletteEntries(),
    history: fixture.context.history.undoStack.value.length,
  };
}
