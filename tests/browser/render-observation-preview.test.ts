import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFixtureSession,
  type FixtureSession,
} from '../../src/editor/fixture-session';
import '../../src/components/preview/pf-agent-preview-surface';
import type { PFAgentPreviewSurface } from '../../src/components/preview/pf-agent-preview-surface';

let sessions: FixtureSession[] = [];

afterEach(() => {
  for (const session of sessions) session.dispose();
  sessions = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('static render observation and agent preview surface', () => {
  it('captures cropped composite and layer checkpoints with real Canvas bytes', async () => {
    const session = createFixtureSession();
    sessions.push(session);

    const journey = await session.runRenderObservation();

    expect(journey.exact).toEqual({
      source: true,
      background: true,
      digest: true,
      document: true,
    });
    expect(journey.composite).toMatchObject({
      type: 'render.observation',
      sourceKind: 'composite',
      region: { x: 0, y: 0, width: 2, height: 2 },
      scale: 4,
      format: 'rgba8',
      stride: 8,
    });
    expect(journey.layer.source).toMatchObject({
      kind: 'layer',
      layerId: 'fixture-layer',
      frameId: 'fixture-frame',
      celId: 'fixture-cel',
    });
    expect(journey.composite.source).toEqual({ kind: 'composite', frameId: 'fixture-frame' });
    expect(journey.solidBackground.background).toEqual({ kind: 'solid', color: '#0000ff' });
    expect(journey.solidBackground.pixels.slice(0, 4)).toEqual(new Uint8Array([0, 0, 255, 255]));
    expect(journey.digestMismatch.error).toMatchObject({ code: 'revision_conflict', retryable: true });
    expect(journey.inactiveTarget.target).toEqual({ projectId: 'fixture-inactive' });
  });

  it('rejects an oversized crop before allocating a Canvas', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runRenderObservation();
    const createElement = vi.spyOn(document, 'createElement');

    const result = await session.adapter.request({
      operation: 'project.render.observe',
      target: session.target,
      expectedRevision: journey.composite.revision,
      source: { kind: 'composite', frameId: 'fixture-frame' },
      region: { x: 0, y: 0, width: 65, height: 1 },
      background: { kind: 'transparent' },
      scale: 1,
      expectedDigest: null,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'bounds_exceeded',
        retryable: false,
        details: { reason: 'region_extent', max: 64 },
      },
    });
    expect(createElement.mock.calls.filter(([tag]) => tag === 'canvas')).toHaveLength(0);
  });

  it('keeps source failures bounded and result bytes detached from the project', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runRenderObservation();
    const request = {
      operation: 'project.render.observe',
      target: session.target,
      expectedRevision: journey.composite.revision,
      source: { kind: 'composite' as const, frameId: 'fixture-frame' },
      region: { x: 0, y: 0, width: 2, height: 2 },
      background: { kind: 'transparent' as const },
      scale: 4,
      expectedDigest: null,
    };

    journey.composite.pixels[0] = 255;
    const detached = await session.adapter.request(request);
    expect(detached).toMatchObject({ ok: true });
    if (detached.ok) expect((detached.result as { readonly pixels: Uint8Array }).pixels[0]).toBe(0);

    const missingFrame = await session.adapter.request({
      ...request,
      source: { kind: 'composite', frameId: 'missing-frame' },
    });
    expect(missingFrame).toMatchObject({ ok: false, error: { code: 'target_not_found', retryable: true } });

    const replacedCel = await session.adapter.request({
      ...request,
      source: { kind: 'layer', layerId: 'fixture-layer', frameId: 'fixture-frame', celId: 'replaced-cel' },
    });
    expect(replacedCel).toMatchObject({ ok: false, error: { code: 'revision_conflict', retryable: true } });

    session.dispose();
    const disposed = await session.adapter.request(request);
    expect(disposed).toMatchObject({ ok: false, error: { code: 'target_not_found', retryable: true } });
  });

  it('returns a retryable stale-revision conflict after asynchronous digest work', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runRenderObservation();
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let releaseDigest: (() => void) | undefined;
    let markDigestStarted: (() => void) | undefined;
    const digestPaused = new Promise<void>((resolve) => { releaseDigest = resolve; });
    const digestStarted = new Promise<void>((resolve) => { markDigestStarted = resolve; });
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      markDigestStarted?.();
      await digestPaused;
      return originalDigest(...args);
    });

    const request = session.adapter.request({
      operation: 'project.render.observe',
      target: session.target,
      expectedRevision: journey.composite.revision,
      source: { kind: 'composite', frameId: 'fixture-frame' },
      region: { x: 0, y: 0, width: 2, height: 2 },
      background: { kind: 'transparent' },
      scale: 4,
      expectedDigest: null,
    });
    await digestStarted;
    const mutation = await session.adapter.request({
      operation: 'project.transaction.execute',
      profile: 'layer-and-tag',
      target: session.target,
      expectedRevision: journey.composite.revision,
      provenance: {
        clientId: 'preview-test-client',
        sessionId: 'preview-test-session',
        runId: 'preview-test-run',
        operationId: 'preview-test-mutation',
      },
      children: [{
        command: 'project.layer.state',
        input: { kind: 'layer.visibility', layerId: 'fixture-layer', visible: false },
      }, {
        command: 'project.animation.frame-tag',
        input: {
          kind: 'tag.create',
          name: 'Stale digest test',
          color: '#123456',
          startFrameIndex: 0,
          endFrameIndex: 0,
        },
      }],
    });
    expect(mutation.ok).toBe(true);
    releaseDigest?.();

    await expect(request).resolves.toMatchObject({
      ok: false,
      error: { code: 'revision_conflict', retryable: true },
    });
  });

  it('shows both intended and nearest-neighbor inspection figures from identical bytes', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runRenderObservation();
    const surface = document.createElement('pf-agent-preview-surface') as PFAgentPreviewSurface;
    surface.observation = journey.composite;
    document.body.append(surface);
    await surface.updateComplete;

    const intended = surface.shadowRoot?.querySelector<HTMLCanvasElement>('.intended-canvas');
    const inspection = surface.shadowRoot?.querySelector<HTMLCanvasElement>('.inspection-canvas');
    expect(intended).toBeTruthy();
    expect(inspection).toBeTruthy();
    expect(intended?.width).toBe(journey.composite.width);
    expect(intended?.height).toBe(journey.composite.height);
    expect(inspection?.width).toBe(journey.composite.width);
    expect(inspection?.height).toBe(journey.composite.height);
    expect(getComputedStyle(inspection!).width).toBe('8px');
    expect(getComputedStyle(inspection!).height).toBe('8px');
    expect(getComputedStyle(inspection!).imageRendering).toMatch(/pixelated|crisp-edges/);
    expect(intended?.getContext('2d')?.imageSmoothingEnabled).toBe(false);
    expect(inspection?.getContext('2d')?.imageSmoothingEnabled).toBe(false);
    expect(readCanvas(intended!)).toEqual(journey.composite.pixels);
    expect(readCanvas(inspection!)).toEqual(journey.composite.pixels);

    const shadowText = surface.shadowRoot?.textContent ?? '';
    expect(shadowText).toContain('Composite');
    expect(shadowText).toContain('Intended source-pixel view');
    expect(shadowText).toContain('4× nearest-neighbor');
    expect(shadowText).toContain(journey.composite.digest);
    expect(surface.shadowRoot?.querySelectorAll('figure')).toHaveLength(2);
    expect(surface.shadowRoot?.querySelector('.checkerboard')).toBeTruthy();
  });

  it('renders a solid background as presentation while retaining the detached result', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runRenderObservation();
    const surface = document.createElement('pf-agent-preview-surface') as PFAgentPreviewSurface;
    surface.observation = journey.solidBackground;
    document.body.append(surface);
    await surface.updateComplete;

    expect(surface.shadowRoot?.querySelector('.solid-background')).toBeTruthy();
    expect(surface.shadowRoot?.querySelector('.checkerboard')).toBeNull();
    expect(surface.shadowRoot?.textContent).toContain('Composite');
    const intended = surface.shadowRoot?.querySelector<HTMLCanvasElement>('.intended-canvas');
    if (!intended) throw new Error('Intended canvas missing.');
    expect(readCanvas(intended)).toEqual(journey.solidBackground.pixels);
  });
});

function readCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Canvas context unavailable.');
  return new Uint8Array(drawing.getImageData(0, 0, canvas.width, canvas.height).data);
}
