import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import {
  createFixtureSession,
  type FixtureSession,
} from '../../src/editor/fixture-session';
import { createProjectContext } from '../../src/stores/project-context';
import type { AnimationEvaluationBundle } from '../../src/editor/animation-observation';
import '../../src/components/preview/pf-agent-animation-preview';
import type { PFAgentAnimationPreview } from '../../src/components/preview/pf-agent-animation-preview';

const sessions: FixtureSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('animation evaluation bundle and agent preview', () => {
  it('proves exact reconstruction, contact-sheet bytes, timing, digest, and reference exclusion', async () => {
    const session = createFixtureSession();
    sessions.push(session);

    const journey = await session.runAnimationObservation();

    expect(journey.exact).toEqual({
      reconstruction: true,
      contactSheet: true,
      digest: true,
      document: true,
      inactiveTarget: true,
    });
    expect(journey.bundle.frames.map((frame) => frame.duration)).toEqual([100, 180, 260]);
    expect(journey.bundle.frames.map((frame) => frame.render.source)).toEqual([
      { kind: 'composite', frameId: 'fixture-animation-preview-frame-1' },
      { kind: 'composite', frameId: 'fixture-animation-preview-frame-2' },
      { kind: 'composite', frameId: 'fixture-animation-preview-frame-3' },
    ]);
    expect(journey.bundle.frames[0]?.render.pixels[3]).toBe(255);
    expect(journey.bundle.frames[0]?.render.pixels[0]).toBe(255);
    expect(journey.bundle.legend).toEqual([
      { symbol: 'a', color: '#ff0000ff' },
      { symbol: 'b', color: '#00ff00ff' },
    ]);
    expect(journey.bundle.legend.every((entry) => entry.paletteEntryId === undefined && entry.paletteIndex === undefined)).toBe(true);
    expect(journey.bundle.deltas.flatMap((delta) => delta.cells.map((cell) => cell.kind))).toEqual([
      'recolored', 'added', 'recolored', 'removed', 'added',
    ]);
    expect(journey.bundle.contactSheet.cells.map((cell) => cell.label)).toEqual([
      'Frame 1 · 100 ms', 'Frame 2 · 180 ms', 'Frame 3 · 260 ms',
    ]);
    expect(journey.tagRange.frames.map((frame) => frame.number)).toEqual([2, 3]);
    expect(journey.tagRange.frames.map((frame) => frame.order)).toEqual([1, 2]);
    expect(journey.tagRange.contactSheet.cells.map((cell) => cell.label)).toEqual([
      'Frame 2 · 180 ms', 'Frame 3 · 260 ms',
    ]);
    expect(journey.tagRange.deltas.map((delta) => [delta.fromNumber, delta.toNumber])).toEqual([[2, 3]]);
    expect(journey.tagRange.keyframes.map((keyframe) => keyframe.frameNumber)).toEqual([2, 3]);
    expect(journey.inactive.frames.map((frame) => frame.duration)).toEqual([140, 220, 300]);
    expect(journey.inactive.frames[0]?.render.pixels.slice(60, 64)).toEqual(new Uint8Array([0, 0, 255, 255]));
    expect(journey.afterTiming.frames[1]?.duration).toBe(375);
    expect(journey.digestMismatch.error).toMatchObject({ code: 'revision_conflict', retryable: true });
  });

  it('renders detached contact, keyframe, and playback surfaces with semantic controls', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runAnimationObservation();
    const preview = document.createElement('pf-agent-animation-preview') as PFAgentAnimationPreview;
    preview.bundle = journey.bundle;
    document.body.append(preview);
    await preview.updateComplete;

    const root = preview.shadowRoot;
    expect(root?.querySelector('h2')?.textContent).toContain('Agent Animation Preview');
    expect(root?.querySelectorAll('figure')).toHaveLength(4);
    expect(root?.querySelector('button[aria-label="Play animation"]')).toBeTruthy();
    expect(root?.querySelector('select[aria-label="Playback range"]')).toBeTruthy();
    expect(root?.querySelector('input[aria-label="Animation frame"]')).toBeTruthy();
    expect(root?.querySelector('.status')?.textContent).toContain('Frame 1');
    expect(root?.querySelector('[role="status"]')).toBeNull();
    expect(root?.querySelectorAll('.contact-cell-captions li')).toHaveLength(3);
    expect([...root!.querySelectorAll('.contact-cell-captions li')].map((cell) => cell.textContent?.trim())).toEqual([
      'Frame 1 · 100 ms', 'Frame 2 · 180 ms', 'Frame 3 · 260 ms',
    ]);
    expect(root?.querySelector('.contact-canvas')).toBeTruthy();
    expect(root?.querySelectorAll('.keyframe-canvas')).toHaveLength(2);
    expect(readCanvas(root?.querySelector('.contact-canvas') as HTMLCanvasElement)).toEqual(
      journey.bundle.contactSheet.pixels,
    );
    expect(readCanvas(root?.querySelector('.keyframe-canvas') as HTMLCanvasElement)).toEqual(
      journey.bundle.keyframes[0]!.pixels,
    );

    const play = root?.querySelector<HTMLButtonElement>('button[aria-label="Play animation"]');
    play?.click();
    await preview.updateComplete;
    expect(root?.querySelector('button[aria-label="Pause animation"]')).toBeTruthy();
    expect(root?.querySelector('[role="status"]')?.textContent).toContain('Playing · Frame 1');
    const pause = root?.querySelector<HTMLButtonElement>('button[aria-label="Pause animation"]');
    pause?.click();
    await preview.updateComplete;
    expect(root?.querySelector('button[aria-label="Play animation"]')).toBeTruthy();

    preview.style.width = '320px';
    await preview.updateComplete;
    const figures = root?.querySelector<HTMLElement>('.figures');
    expect(getComputedStyle(figures!).gridTemplateColumns.trim().split(/\s+/)).toHaveLength(1);

    const originalProjectId = journey.bundle.target.projectId;
    preview.bundle = structuredClone(journey.bundle) as AnimationEvaluationBundle;
    await preview.updateComplete;
    expect(journey.bundle.target.projectId).toBe(originalProjectId);
  });

  it('rejects a cel pixel mutation that happens during asynchronous capture', async () => {
    const context = createProjectContext();
    const session = createFixtureSession({ context });
    sessions.push(session);
    const journey = await session.runAnimationObservation();
    const frame = context.animation.frames.value[0];
    const layer = context.layers.layers.value.find((candidate) => candidate.type === 'image');
    const cel = frame && layer
      ? context.animation.cels.value.get(context.animation.getCelKey(layer.id, frame.id))
      : undefined;
    if (!cel) throw new Error('Animation fixture cel was not available.');
    const drawing = cel.canvas.getContext('2d');
    if (!drawing) throw new Error('Animation fixture canvas was not available.');

    const pending = session.adapter.request({
      operation: 'project.animation.observe',
      ...journey.afterTiming.request,
      expectedDigest: null,
    });
    queueMicrotask(() => {
      drawing.fillStyle = '#0000ff';
      drawing.fillRect(3, 3, 1, 1);
    });
    const result = await pending;

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'revision_conflict', retryable: true },
    });
  });

  it('uses source timing for controlled playback and announces only direct actions', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runAnimationObservation();
    const preview = document.createElement('pf-agent-animation-preview') as PFAgentAnimationPreview;
    preview.bundle = journey.bundle;
    document.body.append(preview);
    await preview.updateComplete;

    const raf = controlAnimationFrames();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const root = preview.shadowRoot!;
    await assertControlledTiming(preview, root, raf);
    await assertPlaybackActions(preview, root);
  });

  it('cancels scheduled playback when the bundle is replaced or disconnected', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runAnimationObservation();
    const preview = document.createElement('pf-agent-animation-preview') as PFAgentAnimationPreview;
    preview.bundle = journey.bundle;
    document.body.append(preview);
    await preview.updateComplete;

    const raf = controlAnimationFrames();
    const play = preview.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Play animation"]')!;
    play.click();
    await preview.updateComplete;
    expect(raf.pending()).toBe(1);

    preview.bundle = structuredClone(journey.bundle) as AnimationEvaluationBundle;
    await preview.updateComplete;
    expect(raf.pending()).toBe(0);
    expect(raf.cancelled()).toBe(1);

    const replacementPlay = preview.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Play animation"]')!;
    replacementPlay.click();
    await preview.updateComplete;
    expect(raf.pending()).toBe(1);
    preview.remove();
    expect(raf.pending()).toBe(0);
    expect(raf.cancelled()).toBe(2);
  });

  it('rejects malformed, one-frame, oversized, and disposed requests before allocation', async () => {
    const context = createProjectContext();
    const session = createFixtureSession({ context });
    sessions.push(session);
    const journey = await session.runAnimationObservation();
    const request = {
      operation: 'project.animation.observe',
      ...journey.afterTiming.request,
      expectedDigest: null,
    };
    const createElement = vi.spyOn(document, 'createElement');
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const createImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'createImageData');
    const digest = vi.spyOn(crypto.subtle, 'digest');

    const malformed = await session.adapter.request({ ...request, expectedDigest: 'malformed' });
    expect(malformed).toMatchObject({ ok: false, error: { code: 'invalid_request', retryable: false } });
    expectNoAnimationAllocation(createElement, getContext, createImageData, digest);

    context.animation.frames.value = [context.animation.frames.value[0]!];
    context.animation.tags.value = [];
    const oneFrame = await session.adapter.request(request);
    expect(oneFrame).toMatchObject({ ok: false, error: { code: 'bounds_exceeded', retryable: false } });
    expectNoAnimationAllocation(createElement, getContext, createImageData, digest);

    context.project.width.value = 65;
    const oversized = await session.adapter.request(request);
    expect(oversized).toMatchObject({ ok: false, error: { code: 'bounds_exceeded', retryable: false } });
    expectNoAnimationAllocation(createElement, getContext, createImageData, digest);

    context.dispose();
    const disposed = await session.adapter.request(request);
    expect(disposed).toMatchObject({ ok: false, error: { code: 'target_not_found', retryable: true } });
    expectNoAnimationAllocation(createElement, getContext, createImageData, digest);
  });

  it('keeps animation results detached and preserves bounded Symbol Grid failures', async () => {
    const context = createProjectContext();
    const session = createFixtureSession({ context });
    sessions.push(session);
    const journey = await session.runAnimationObservation();
    const before = await context.project.saveProject();
    const observationRequest = {
      ...journey.afterTiming.request,
      keyframes: journey.afterTiming.request.keyframes.slice(),
    };
    const detached = journey.afterTiming;
    (detached.frames[0]!.render.pixels as Uint8Array)[0] = 99;
    (detached.contactSheet.pixels as Uint8Array)[0] = 99;
    (detached.keyframes[0]!.pixels as Uint8Array)[0] = 99;
    (detached.request.keyframes as string[])[0] = 'detached-frame';
    expect(await context.project.saveProject()).toEqual(before);

    const imageLayer = context.layers.layers.value.find((layer) => layer.type === 'image');
    if (!imageLayer) throw new Error('Animation fixture image layer was not available.');
    context.animation.frames.value.forEach((frame, frameIndex) => {
      const cel = context.animation.cels.value.get(context.animation.getCelKey(imageLayer.id, frame.id));
      const drawing = cel?.canvas.getContext('2d');
      if (!cel || !drawing) throw new Error('Animation fixture cel was not available.');
      drawing.clearRect(0, 0, cel.canvas.width, cel.canvas.height);
      for (let cell = 0; cell < cel.canvas.width * cel.canvas.height; cell++) {
        drawing.fillStyle = `#${(frameIndex * 16 + cell + 1).toString(16).padStart(6, '0')}`;
        drawing.fillRect(cell % cel.canvas.width, Math.floor(cell / cel.canvas.width), 1, 1);
      }
    });
    const overflow = await session.adapter.request({
      operation: 'project.animation.observe',
      ...observationRequest,
      expectedDigest: null,
    });
    expect(overflow).toMatchObject({
      ok: false,
      error: { code: 'limit_exceeded', retryable: false, details: { reason: 'legend', max: 32 } },
    });
  });
});

interface ControlledAnimationFrames {
  pending(): number;
  cancelled(): number;
  tick(timestamp: number): void;
}

function controlAnimationFrames(): ControlledAnimationFrames {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let cancelled = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    if (callbacks.delete(id)) cancelled++;
  });
  return {
    pending: () => callbacks.size,
    cancelled: () => cancelled,
    tick: (timestamp) => {
      const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) throw new Error('No animation frame callback is pending.');
      callbacks.delete(entry[0]);
      entry[1](timestamp);
    },
  };
}

function expectNoAnimationAllocation(
  createElement: ReturnType<typeof vi.spyOn<typeof document, 'createElement'>>,
  getContext: ReturnType<typeof vi.spyOn<typeof HTMLCanvasElement.prototype, 'getContext'>>,
  createImageData: ReturnType<typeof vi.spyOn<typeof CanvasRenderingContext2D.prototype, 'createImageData'>>,
  digest: ReturnType<typeof vi.spyOn<typeof crypto.subtle, 'digest'>>,
): void {
  expect(createElement).not.toHaveBeenCalled();
  expect(getContext).not.toHaveBeenCalled();
  expect(createImageData).not.toHaveBeenCalled();
  expect(digest).not.toHaveBeenCalled();
}

async function assertControlledTiming(
  preview: PFAgentAnimationPreview,
  root: ShadowRoot,
  raf: ControlledAnimationFrames,
): Promise<void> {
  const play = root.querySelector<HTMLButtonElement>('button[aria-label="Play animation"]')!;
  play.click();
  await preview.updateComplete;
  expect(raf.pending()).toBe(1);
  expect(root.querySelector('[role="status"]')?.textContent).toContain('Playing · Frame 1');

  raf.tick(99);
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 1');
  raf.tick(100);
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 2');
  expect(root.querySelector('[role="status"]')?.textContent).toContain('Playing · Frame 1');
  raf.tick(279);
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 2');
  raf.tick(280);
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 3');

  const pause = root.querySelector<HTMLButtonElement>('button[aria-label="Pause animation"]')!;
  pause.click();
  await preview.updateComplete;
  expect(root.querySelector('[role="status"]')?.textContent).toContain('Paused · Frame 3');
}

async function assertPlaybackActions(preview: PFAgentAnimationPreview, root: ShadowRoot): Promise<void> {
  const next = root.querySelector<HTMLButtonElement>('button[aria-label="Next frame"]')!;
  next.click();
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 1');

  const seek = root.querySelector<HTMLInputElement>('input[aria-label="Animation frame"]')!;
  seek.value = '2';
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 2');

  const range = root.querySelector<HTMLSelectElement>('select[aria-label="Playback range"]')!;
  range.value = 'tag:fixture-animation-preview-tag';
  range.dispatchEvent(new Event('change', { bubbles: true }));
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 2');
  next.click();
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 3');
  next.click();
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 2');

  next.focus();
  expect(root.activeElement).toBe(next);
  await userEvent.keyboard('{Enter}');
  await preview.updateComplete;
  expect(root.querySelector('.status')?.textContent).toContain('Frame 3');
}

function readCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Canvas context unavailable.');
  return new Uint8Array(drawing.getImageData(0, 0, canvas.width, canvas.height).data);
}
