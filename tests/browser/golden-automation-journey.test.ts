import { afterEach, describe, expect, it } from 'vitest';
import {
  createFixtureSession,
  type FixtureSession,
} from '../../src/editor/fixture-session';
import {
  runGoldenAutomationJourney,
  type GoldenAutomationJourneyResult,
} from '../../src/editor/golden-automation-journey';
import type { AssetPackageArtifact } from '../../src/editor/asset-package';
import '../../src/components/preview/pf-agent-animation-preview';
import type { PFAgentAnimationPreview } from '../../src/components/preview/pf-agent-animation-preview';

const fixtures: FixtureSession[] = [];

afterEach(() => {
  document.body.replaceChildren();
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

describe('Golden Automation Journey', () => {
  // fallow-ignore-next-line complexity -- Chromium proof keeps the complete public journey and detached preview checks together.
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
    await expectGoldenProof(journey);

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
    expect(root?.querySelector('.status')?.textContent).toContain('Playing');
    root?.querySelector<HTMLButtonElement>('button[aria-label="Pause animation"]')?.click();
    await preview.updateComplete;
    expect(root?.querySelector('.status')?.textContent).toContain('Paused');

    const range = root?.querySelector<HTMLSelectElement>('select[aria-label="Playback range"]');
    if (!range) throw new Error('Expected the animation playback range control.');
    range.value = `tag:${journey.preview.tagId}`;
    range.dispatchEvent(new Event('change', { bubbles: true }));
    await preview.updateComplete;
    expect(range.value).toBe(`tag:${journey.preview.tagId}`);
    expect(root?.querySelector('.status')?.textContent).toContain('Golden Loop');

    const seek = root?.querySelector<HTMLInputElement>('input[aria-label="Animation frame"]');
    if (!seek) throw new Error('Expected the animation seek control.');
    seek.value = '2';
    seek.dispatchEvent(new Event('input', { bubbles: true }));
    await preview.updateComplete;
    expect(seek.value).toBe('2');
    expect(root?.querySelector('.status')?.textContent).toContain('Frame 2');
    expect(root?.querySelector('.status')?.textContent).toContain('Paused');
    const playbackCanvas = root?.querySelector<HTMLCanvasElement>('.intended-canvas');
    if (!playbackCanvas) throw new Error('Expected the intended-size playback canvas.');
    const playbackContext = playbackCanvas.getContext('2d', { willReadFrequently: true });
    if (!playbackContext) throw new Error('Chromium did not provide a preview canvas.');
    expect(Array.from(playbackContext.getImageData(0, 0, playbackCanvas.width, playbackCanvas.height).data))
      .toEqual(Array.from(journey.finalAnimation.frames[1]?.render.pixels ?? new Uint8Array(0)));

    const observed = await fixture.adapter.request({
      operation: 'project.observe',
      target: journey.creation.target,
      expectedRevision: journey.package.save.revision,
    });
    expect(observed).toMatchObject({ ok: true, result: { revision: journey.package.save.revision } });
    expect(journey.package.save.revision).toBe(journey.finalAnimation.revision);
  });
});

// fallow-ignore-next-line complexity -- Acceptance maps the single journey across public structure, recovery, package, and preview evidence.
async function expectGoldenProof(journey: GoldenAutomationJourneyResult): Promise<void> {
  expect(journey.creation.revision).toBe(0);
  expect(journey.creation.target.projectId).toBe('golden-automation-project');
  expect(journey.initialObservation.canvas).toEqual({ width: 32, height: 32 });
  expect(journey.initialObservation.layers.some((layer) => layer.name === 'Layer 1')).toBe(true);
  expect(journey.finalAnimation.palette.map(({ id, color }) => ({ id, color }))).toEqual([
    { id: 'golden-ink', color: '#3d348b' },
    { id: 'golden-sun', color: '#f3ca40' },
    { id: 'golden-coral', color: '#ee6c4d' },
    { id: 'golden-mint', color: '#70c1b3' },
  ]);
  expect(journey.controller.midJourney.reobserved.layers.map(({ id, name, type, parentId }) => ({ id, name, type, parentId }))).toEqual([
    { id: 'golden-group', name: 'Golden Creature', type: 'group', parentId: null },
    { id: 'golden-test-entity-1', name: 'Golden Body', type: 'image', parentId: 'golden-group' },
    { id: 'golden-highlight', name: 'Golden Highlight', type: 'image', parentId: 'golden-group' },
  ]);
  expect(journey.finalObservation.layers.map(({ name, type, parentId }) => ({ name, type, parentId }))).toEqual([
    { name: 'Golden Creature Refined', type: 'group', parentId: null },
    { name: 'Golden Body Refined', type: 'image', parentId: 'golden-group' },
    { name: 'Golden Highlight Refined', type: 'image', parentId: 'golden-group' },
  ]);
  expect(journey.finalObservation.frames.map(({ duration }) => duration)).toEqual([110, 180, 260]);
  expect(journey.finalObservation.tags.map(({ name, startFrameIndex, endFrameIndex }) => ({ name, startFrameIndex, endFrameIndex }))).toEqual([
    { name: 'Golden Loop', startFrameIndex: 0, endFrameIndex: 2 },
  ]);
  expect(journey.history.undo.revision).toBe(journey.history.edit.revision + 1);
  expect(journey.history.redo.revision).toBe(journey.history.undo.revision + 1);
  expect(journey.history.undone.frames[0]?.duration).toBe(100);
  expect(journey.history.after.frames[0]?.duration).toBe(110);
  expect(journey.history.reloaded.frames.map(({ duration }) => duration)).toEqual([110]);
  expect(journey.history.reloaded.frames.map(({ duration }) => duration)).toEqual(journey.history.after.frames.map(({ duration }) => duration));
  expect(journey.transactions.map((transaction) => transaction.revision)).toEqual(
    journey.transactions.map((_transaction, index) => journey.history.after.revision + index + 1),
  );
  expect(journey.rawTransactions).toHaveLength(journey.transactions.length);
  expect(journey.rawTransactions.every((transaction) => !('target' in transaction) && !('target' in transaction.provenance))).toBe(true);
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
  expect(journey.package.assetPackage.manifest.frames.map(({ id, duration, renderDigest }) => ({ id, duration, renderDigest })))
    .toEqual(journey.finalAnimation.frames.map(({ frameId, duration, renderedDigest }) => ({
      id: frameId,
      duration,
      renderDigest: renderedDigest,
    })));
  const sprite = requiredArtifact(journey.package.assetPackage.artifacts, 'sprite-sheet');
  const spriteSheet = journey.package.assetPackage.manifest.spriteSheet;
  if (!spriteSheet) throw new Error('Golden package did not include sprite-sheet metadata.');
  const spritePixels = await decodePng(sprite, spriteSheet.width, spriteSheet.height);
  for (const cell of spriteSheet.cells) {
    const expected = journey.finalAnimation.frames[cell.index]?.render.pixels;
    if (!expected) throw new Error(`Golden package is missing frame ${cell.index}.`);
    expect(Array.from(crop(spritePixels, spriteSheet.width, cell.x, cell.y, cell.width, cell.height)))
      .toEqual(Array.from(expected));
  }
  expect(journey.rasterProofs).toHaveLength(3);
  for (const proof of journey.rasterProofs) {
    expect(proof.observation.source).toMatchObject({ frameId: proof.frameId, celId: proof.celId });
    expectPattern(
      proof.observation.rows,
      remapPattern(proof.expectedPattern, proof.observation.legend),
      10,
      8 + proof.frameIndex * 2,
    );
  }
  expect(journey.recovery).toMatchObject({
    checkpointPersisted: true,
    oldAuthorityInvalidated: true,
    reapproved: true,
    queuedWriteWasNotReplayed: true,
  });
  expect(journey.recovery.freshObservationCount).toBeGreaterThan(0);
  expect(journey.recovery.freshObservationRevisions.length).toBe(journey.recovery.freshObservationCount);
  expect(journey.recovery.freshObservationRevisions.every((revision) => revision === journey.recovery.revisionBeforeInterruption)).toBe(true);
  expect(journey.recovery.oldAuthorityFailure.error.code).toBe('capability_denied');
  expect(journey.recovery.oldAuthorityFailure.revisionBefore).toBe(journey.recovery.oldAuthorityFailure.revisionAfter);
  expect(journey.recovery.oldAuthorityFailure.transactionsUsedBefore).toBe(journey.recovery.oldAuthorityFailure.transactionsUsedAfter);
  expect(journey.controller.initialPause.phase).toBe('paused');
  expect(journey.controller.midJourney.paused.phase).toBe('paused');
  expect(journey.controller.midJourney.beforeReload.frames.map(({ duration }) => duration))
    .toEqual(journey.controller.midJourney.reobserved.frames.map(({ duration }) => duration));
  expect(journey.controller.midJourney.beforeReload.layers.map(({ id, name, parentId }) => ({ id, name, parentId })))
    .toEqual(journey.controller.midJourney.reobserved.layers.map(({ id, name, parentId }) => ({ id, name, parentId })));
  expect(journey.controller.originalAfterInterruption.phase).toBe('recovery-required');
  expect(journey.controller.replacement.phase).toBe('stopped');
  expect(journey.controller.accepted.phase).toBe('accepted');
  expect(journey.failures.staleRevision.error.code).toBe('revision_conflict');
  expect(journey.failures.staleRevision.revisionBefore).toBe(journey.failures.staleRevision.revisionAfter);
  expect(journey.failures.staleRevision.transactionsUsedBefore).toBe(journey.failures.staleRevision.transactionsUsedAfter);
  expect(journey.failures.deniedOperation.error.code).toBe('capability_denied');
  expect(journey.failures.deniedOperation.revisionBefore).toBe(journey.failures.deniedOperation.revisionAfter);
  expect(journey.failures.deniedOperation.transactionsUsedBefore).toBe(journey.failures.deniedOperation.transactionsUsedAfter);
  expect(journey.failures.budget.exhausted.error.code).toBe('limit_exceeded');
  expect(journey.failures.budget.beforeRejection.revision).toBe(journey.failures.budget.afterRejection.revision);
  expect(journey.failures.budget.beforeRejection.frames.map(({ duration }) => duration))
    .toEqual(journey.failures.budget.afterRejection.frames.map(({ duration }) => duration));
  expect(journey.failures.budget.transactionsUsedBefore).toBe(journey.failures.budget.transactionsUsedAfter);
  expect(journey.failures.budget.restored.frames[0]?.duration).toBe(journey.initialObservation.frames[0]?.duration);
  expect(journey.failures.budget.continuationRevision).toBe(journey.failures.budget.restored.revision);
  expect(journey.failures.lateResult.suppressed).toBe(true);
  expect(journey.failures.lateResult.beforeObservation.revision)
    .toBe(journey.failures.lateResult.afterObservation.revision);
  expect(journey.failures.lateResult.beforeObservation.frames.map(({ duration }) => duration))
    .toEqual(journey.failures.lateResult.afterObservation.frames.map(({ duration }) => duration));
  expect(journey.failures.lateResult.transactionsUsedBefore)
    .toBe(journey.failures.lateResult.transactionsUsedAfter);
  expect(journey.failures.interruptedResumption).toEqual({
    originalPhase: 'recovery-required',
    replacementPhase: 'stopped',
  });
}

function expectPattern(rows: readonly string[], pattern: readonly string[], rowOffset: number, columnOffset: number): void {
  for (const [index, expectedRow] of pattern.entries()) {
    expect(rows[rowOffset + index]?.slice(columnOffset, columnOffset + expectedRow.length)).toBe(expectedRow);
  }
}

function remapPattern(
  pattern: readonly string[],
  legend: readonly { readonly symbol: string; readonly color: string; readonly paletteEntryId?: string }[],
): readonly string[] {
  const paletteIdsByColor: Readonly<Record<string, string>> = {
    '#3d348b': 'golden-ink',
    '#f3ca40': 'golden-sun',
    '#ee6c4d': 'golden-coral',
  };
  const symbols = new Map(legend.map((entry) => [
    entry.paletteEntryId ?? paletteIdsByColor[entry.color.slice(0, 7).toLowerCase()],
    entry.symbol,
  ]));
  const requestedPaletteIds: Readonly<Record<string, string>> = {
    a: 'golden-ink',
    b: 'golden-sun',
    c: 'golden-coral',
  };
  return pattern.map((row) => Array.from(row, (symbol) => (
    symbol === '.' ? '.' : symbols.get(requestedPaletteIds[symbol]) ?? symbol
  )).join(''));
}

function requiredArtifact(
  artifacts: readonly AssetPackageArtifact[],
  role: AssetPackageArtifact['role'],
): AssetPackageArtifact {
  const artifact = artifacts.find((candidate) => candidate.role === role);
  if (!artifact) throw new Error(`Golden package omitted ${role}.`);
  return artifact;
}

async function decodePng(
  artifact: AssetPackageArtifact,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([artifact.bytes], { type: artifact.mediaType }));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) throw new Error('Chromium did not provide a decoding canvas.');
  drawing.imageSmoothingEnabled = false;
  drawing.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Uint8Array(drawing.getImageData(0, 0, width, height).data);
}

function crop(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  cropWidth: number,
  cropHeight: number,
): Uint8Array {
  const result = new Uint8Array(cropWidth * cropHeight * 4);
  for (let row = 0; row < cropHeight; row += 1) {
    const sourceStart = ((y + row) * width + x) * 4;
    result.set(pixels.subarray(sourceStart, sourceStart + cropWidth * 4), row * cropWidth * 4);
  }
  return result;
}
