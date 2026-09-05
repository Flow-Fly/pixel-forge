import { afterEach, describe, expect, it } from 'vitest';
import {
  createFixtureSession,
  type FixtureSession,
} from '../../src/editor/fixture-session';
import {
  runGoldenAutomationJourney,
  type GoldenAutomationJourneyResult,
} from '../../src/editor/golden-automation-journey';
import '../../src/components/preview/pf-agent-animation-preview';
import type { PFAgentAnimationPreview } from '../../src/components/preview/pf-agent-animation-preview';

const fixtures: FixtureSession[] = [];

afterEach(() => {
  document.body.replaceChildren();
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

describe('Golden Automation Journey', () => {
  it('proves the complete public workflow and detached Chromium preview', async () => {
    const fixture = createFixtureSession({
      projectIdFactory: () => 'golden-automation-project',
      entityIdFactory: (() => {
        let sequence = 0;
        return () => `golden-test-entity-${++sequence}`;
      })(),
    });
    fixtures.push(fixture);

    const journey = await runGoldenAutomationJourney({ fixture });
    expectGoldenProof(journey);

    const preview = document.createElement('pf-agent-animation-preview') as PFAgentAnimationPreview;
    preview.bundle = journey.finalAnimation;
    document.body.append(preview);
    await preview.updateComplete;

    const root = preview.shadowRoot;
    const play = root?.querySelector<HTMLButtonElement>('button[aria-label="Play animation"]');
    expect(play).toBeTruthy();
    play?.click();
    await preview.updateComplete;
    expect(root?.querySelector('button[aria-label="Pause animation"]')).toBeTruthy();
    root?.querySelector<HTMLButtonElement>('button[aria-label="Pause animation"]')?.click();
    await preview.updateComplete;

    const range = root?.querySelector<HTMLSelectElement>('select[aria-label="Playback range"]');
    if (!range) throw new Error('Expected the animation playback range control.');
    range.value = `tag:${journey.preview.tagId}`;
    range.dispatchEvent(new Event('change', { bubbles: true }));
    await preview.updateComplete;

    const seek = root?.querySelector<HTMLInputElement>('input[aria-label="Animation frame"]');
    if (!seek) throw new Error('Expected the animation seek control.');
    seek.value = '2';
    seek.dispatchEvent(new Event('input', { bubbles: true }));
    await preview.updateComplete;

    const observed = await fixture.adapter.request({
      operation: 'project.observe',
      target: journey.creation.target,
      expectedRevision: journey.failures.budget.exhausted.revisionAfter,
    });
    expect(observed).toMatchObject({ ok: true, result: { revision: journey.failures.budget.exhausted.revisionAfter } });
  });
});

function expectGoldenProof(journey: GoldenAutomationJourneyResult): void {
  expect(journey.creation.revision).toBe(0);
  expect(journey.creation.target.projectId).toBe('golden-automation-project');
  expect(journey.initialObservation.canvas).toEqual({ width: 32, height: 32 });
  expect(journey.initialObservation.layers.some((layer) => layer.name === 'Layer 1')).toBe(true);
  expect(journey.history.undo.revision).toBe(journey.history.edit.revision + 1);
  expect(journey.history.redo.revision).toBe(journey.history.undo.revision + 1);
  expect(journey.transactions.map((transaction) => transaction.revision)).toEqual(
    journey.transactions.map((_transaction, index) => journey.history.after.revision + index + 1),
  );
  expect(journey.transactions.some((transaction) => transaction.rasterPatch !== undefined)).toBe(true);
  expect(journey.transactions.some((transaction) => transaction.compositeEquality?.allEqual === true)).toBe(true);
  const refinement = journey.transactions.find((transaction) => transaction.compositeEquality)?.compositeEquality;
  expect(refinement?.allEqual).toBe(true);
  expect(refinement?.frames.every((frame) => frame.equal && frame.beforeDigest === frame.afterDigest)).toBe(true);
  expect(journey.package.exact).toEqual({
    reconstruction: true,
    source: true,
    persistedSource: true,
    replay: true,
    manifest: true,
    spriteCells: true,
    renderedDigests: true,
    timingAndTags: true,
  });
  expect(journey.recovery).toMatchObject({
    checkpointPersisted: true,
    oldAuthorityInvalidated: true,
    freshObservationCount: 1,
    reapproved: true,
    queuedWriteWasNotReplayed: true,
  });
  expect(journey.controller.initialPause.phase).toBe('paused');
  expect(journey.controller.midJourney.paused.phase).toBe('paused');
  expect(journey.controller.originalAfterInterruption.phase).toBe('recovery-required');
  expect(journey.controller.replacement.phase).toBe('stopped');
  expect(journey.controller.accepted.phase).toBe('accepted');
  expect(journey.failures.staleRevision.error.code).toBe('revision_conflict');
  expect(journey.failures.deniedOperation.error.code).toBe('capability_denied');
  expect(journey.failures.budget.exhausted.error.code).toBe('limit_exceeded');
  expect(journey.failures.budget.restored).toBe(true);
  expect(journey.failures.lateResult.suppressed).toBe(true);
  expect(journey.failures.interruptedResumption).toEqual({
    originalPhase: 'recovery-required',
    replacementPhase: 'stopped',
  });
}
