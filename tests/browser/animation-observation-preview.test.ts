import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFixtureSession,
  type FixtureSession,
} from '../../src/editor/fixture-session';
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
    expect(journey.bundle.legend).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: '#ff0000ff', paletteEntryId: 'fixture-palette-red' }),
      expect.objectContaining({ color: '#00ff00ff', paletteEntryId: 'fixture-palette-green' }),
    ]));
    expect(journey.bundle.deltas.flatMap((delta) => delta.cells.map((cell) => cell.kind))).toEqual([
      'recolored', 'added', 'recolored', 'removed', 'added',
    ]);
    expect(journey.bundle.contactSheet.cells.map((cell) => cell.label)).toEqual([
      'Frame 1 · 100 ms', 'Frame 2 · 180 ms', 'Frame 3 · 260 ms',
    ]);
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
    expect(root?.querySelector('[role="status"]')?.textContent).toContain('Frame 1');
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
});

function readCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Canvas context unavailable.');
  return new Uint8Array(drawing.getImageData(0, 0, canvas.width, canvas.height).data);
}
