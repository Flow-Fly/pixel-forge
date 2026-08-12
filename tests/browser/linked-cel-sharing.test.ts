import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import '../../src/components/timeline/pf-timeline';
import {
  createFrameTagRequest,
  executeTimelineProjectState,
} from '../../src/editor/timeline-project-state';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import { OptimizedDrawingCommand } from '../../src/commands/optimized-drawing-command';

const contexts: ProjectContext[] = [];

function createNonAdjacentHardLinkedCels(context: ProjectContext) {
  const layer = context.layers.layers.value[0];
  if (!layer) throw new Error('Expected a layer');
  const firstFrameId = context.animation.currentFrameId.value;
  const firstKey = context.animation.getCelKey(layer.id, firstFrameId);
  const firstCel = context.animation.cels.value.get(firstKey);
  if (!firstCel) throw new Error('Expected an initial cel');
  const canvas = document.createElement('canvas');
  canvas.width = firstCel.canvas.width;
  canvas.height = firstCel.canvas.height;
  context.animation.cels.value = new Map(context.animation.cels.value).set(firstKey, {
    ...firstCel,
    canvas,
  });
  context.layers.updateLayer(layer.id, { canvas });
  const indexBuffer = context.animation.ensureCelIndexBuffer(layer.id, firstFrameId);
  indexBuffer[0] = 1;
  context.animation.updateCelIndexBuffer(layer.id, firstFrameId, indexBuffer);

  context.animation.addFrame(false);
  context.animation.addFrame(false);
  const [first, , third] = context.animation.frames.value;
  if (!first || !third) throw new Error('Expected three frames');

  context.animation.linkCels([
    context.animation.getCelKey(layer.id, first.id),
    context.animation.getCelKey(layer.id, third.id),
  ], 'hard');
  context.animation.goToFrame(third.id);
  return layer;
}

async function drawPixel(
  context: ProjectContext,
  layerId: string,
  frameId: string,
  x: number,
  paletteIndex: number,
): Promise<void> {
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layerId, frameId));
  if (!cel?.indexBuffer) throw new Error('Expected an indexed cel');
  const previousIndex = cel.indexBuffer[x] ?? 0;
  const command = new OptimizedDrawingCommand(
    layerId,
    { x, y: 0, width: 1, height: 1 },
    new Uint8ClampedArray([0, 0, 0, 0]),
    new Uint8ClampedArray([255, 0, 0, 255]),
    'Chromium linked-cel drawing',
    {
      frameId,
      canvasWidth: cel.canvas.width,
      previousIndexData: Uint8Array.of(previousIndex),
      newIndexData: Uint8Array.of(paletteIndex),
    },
    context,
  );
  await context.history.execute(command);
}

type TimelineHarness = HTMLElement & { updateComplete: Promise<unknown> };

type LinkedCelJourney = {
  context: ProjectContext;
  layerId: string;
  layerName: string;
  firstFrameId: string;
  activeFrameId: string;
  sharedPixel: readonly number[];
  sharedCanvas: HTMLCanvasElement;
  sharedIndexBuffer: Uint8Array;
  header: TimelineHarness;
  grid: TimelineHarness;
};

function readCanvasPixel(canvas: HTMLCanvasElement, x = 0, y = 0): number[] {
  const drawing = canvas.getContext('2d', { willReadFrequently: true });
  if (!drawing) throw new Error('Expected a readable canvas context');
  return Array.from(drawing.getImageData(x, y, 1, 1).data);
}

function requiredCel(context: ProjectContext, layerId: string, frameId: string) {
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layerId, frameId));
  if (!cel) throw new Error(`Expected cel ${layerId}:${frameId}`);
  return cel;
}

function shadowQuery<T extends Element = HTMLElement>(element: HTMLElement, selector: string): T | null {
  const root = element.shadowRoot;
  if (!root) throw new Error(`Expected shadow root for ${element.localName}`);
  return root.querySelector<T>(selector);
}

function requiredShadowQuery<T extends Element = HTMLElement>(element: HTMLElement, selector: string): T {
  const result = shadowQuery<T>(element, selector);
  if (!result) throw new Error(`Expected ${selector} in ${element.localName}`);
  return result;
}

function shadowQueryAll(element: HTMLElement, selector: string): NodeListOf<Element> {
  const root = element.shadowRoot;
  if (!root) throw new Error(`Expected shadow root for ${element.localName}`);
  return root.querySelectorAll(selector);
}

async function waitForJourneyRender(journey: LinkedCelJourney): Promise<void> {
  await journey.header.updateComplete;
  await journey.grid.updateComplete;
}

function expectSharedPresentation(journey: LinkedCelJourney): void {
  expect(requiredShadowQuery(journey.header, '[data-shared-cel-context]')).toHaveTextContent(
    'Shared cel — affects frames 1, 3',
  );
  expect(shadowQueryAll(journey.grid, '.link-glyph')).toHaveLength(2);
}

function expectIndependentPresentation(journey: LinkedCelJourney): void {
  expect(shadowQuery(journey.header, '[data-shared-cel-context]')).toBeNull();
  expect(shadowQueryAll(journey.grid, '.link-glyph')).toHaveLength(0);
}

function expectRemainingGroup(journey: LinkedCelJourney): void {
  expect(requiredCel(journey.context, journey.layerId, journey.firstFrameId).linkedCelId)
    .toBeTruthy();
}

async function createLinkedCelJourney(): Promise<LinkedCelJourney> {
  const context = createProjectContext();
  contexts.push(context);
  const layer = createNonAdjacentHardLinkedCels(context);
  setActiveProjectContext(context);
  const firstFrame = context.animation.frames.value[0];
  const activeFrame = context.animation.frames.value[2];
  if (!firstFrame || !activeFrame) throw new Error('Expected linked frames');

  await drawPixel(context, layer.id, activeFrame.id, 0, 2);
  const sharedCel = requiredCel(context, layer.id, activeFrame.id);
  const firstCel = requiredCel(context, layer.id, firstFrame.id);
  if (!sharedCel.indexBuffer || !firstCel.indexBuffer) {
    throw new Error('Expected shared indexed cels');
  }
  const sharedPixel = readCanvasPixel(sharedCel.canvas);
  expect(sharedPixel).toEqual([255, 0, 0, 255]);
  expect(readCanvasPixel(firstCel.canvas)).toEqual(sharedPixel);
  expect(sharedCel.canvas).toBe(firstCel.canvas);
  expect(sharedCel.indexBuffer).toBe(firstCel.indexBuffer);
  expect(sharedCel.indexBuffer[0]).toBe(2);

  const header = document.createElement('pf-timeline-header') as TimelineHarness;
  const grid = document.createElement('pf-timeline-grid') as TimelineHarness;
  document.body.append(header, grid);
  const journey = {
    context,
    layerId: layer.id,
    layerName: layer.name,
    firstFrameId: firstFrame.id,
    activeFrameId: activeFrame.id,
    sharedPixel,
    sharedCanvas: sharedCel.canvas,
    sharedIndexBuffer: sharedCel.indexBuffer,
    header,
    grid,
  };
  await waitForJourneyRender(journey);
  expectSharedPresentation(journey);
  return journey;
}

async function unlinkFromContextBar(journey: LinkedCelJourney): Promise<void> {
  await userEvent.click(page.getByRole('button', { name: 'Unlink this cel' }));
  await expect.poll(() => journey.context.history.undoStack.value.length).toBe(2);
  await waitForJourneyRender(journey);
  const activeCel = requiredCel(journey.context, journey.layerId, journey.activeFrameId);
  expect(activeCel.linkedCelId).toBeUndefined();
  expect(activeCel.indexBuffer).not.toBe(journey.sharedIndexBuffer);
  expect(activeCel.indexBuffer).toEqual(journey.sharedIndexBuffer);
  expect(readCanvasPixel(activeCel.canvas)).toEqual(journey.sharedPixel);
  expect(readCanvasPixel(requiredCel(journey.context, journey.layerId, journey.firstFrameId).canvas))
    .toEqual(journey.sharedPixel);
  expectRemainingGroup(journey);
  expectIndependentPresentation(journey);
}

async function undoUnlink(journey: LinkedCelJourney): Promise<void> {
  await journey.context.history.undo();
  await waitForJourneyRender(journey);
  const activeCel = requiredCel(journey.context, journey.layerId, journey.activeFrameId);
  expect(activeCel.linkedCelId).toBeTruthy();
  expect(activeCel.canvas).toBe(journey.sharedCanvas);
  expect(activeCel.indexBuffer).toBe(journey.sharedIndexBuffer);
  expect(readCanvasPixel(activeCel.canvas)).toEqual(journey.sharedPixel);
  expectSharedPresentation(journey);
}

async function redoUnlink(journey: LinkedCelJourney): Promise<void> {
  await journey.context.history.redo();
  await waitForJourneyRender(journey);
  const activeCel = requiredCel(journey.context, journey.layerId, journey.activeFrameId);
  expect(activeCel.linkedCelId).toBeUndefined();
  expect(readCanvasPixel(activeCel.canvas)).toEqual(journey.sharedPixel);
  expect(readCanvasPixel(requiredCel(journey.context, journey.layerId, journey.firstFrameId).canvas))
    .toEqual(journey.sharedPixel);
  expectIndependentPresentation(journey);
}

async function unlinkFromContextMenu(journey: LinkedCelJourney): Promise<void> {
  const sharedCel = page.getByRole('button', {
    name: `${journey.layerName}, frame 3. Shared cel — affects frames 1, 3. Edits propagate to every affected frame.`,
  });
  (sharedCel.element() as HTMLButtonElement).dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    composed: true,
    clientX: 20,
    clientY: 20,
  }));

  const menu = requiredShadowQuery<HTMLElement>(journey.grid, 'pf-context-menu');
  await expect.poll(() => menu.hasAttribute('open')).toBe(true);
  const menuButton = requiredShadowQuery<HTMLElement>(menu, '.menu-item:last-child');
  expect(menuButton).toHaveTextContent('Unlink this cel');
  await userEvent.keyboard('{ArrowDown}');
  expect(menuButton).toHaveClass('focused');
  await userEvent.keyboard('{Enter}');
  await expect.poll(() => journey.context.history.undoStack.value.length).toBe(2);
  await waitForJourneyRender(journey);
  const activeCel = requiredCel(journey.context, journey.layerId, journey.activeFrameId);
  expect(activeCel.linkedCelId).toBeUndefined();
  expect(readCanvasPixel(activeCel.canvas)).toEqual(journey.sharedPixel);
  expect(readCanvasPixel(requiredCel(journey.context, journey.layerId, journey.firstFrameId).canvas))
    .toEqual(journey.sharedPixel);
  expectRemainingGroup(journey);
  expectIndependentPresentation(journey);
}

async function drawIndependentlyAfterUnlink(journey: LinkedCelJourney): Promise<void> {
  await drawPixel(journey.context, journey.layerId, journey.activeFrameId, 1, 3);
  const independent = requiredCel(journey.context, journey.layerId, journey.activeFrameId);
  const remaining = requiredCel(journey.context, journey.layerId, journey.firstFrameId);
  if (!independent.indexBuffer || !remaining.indexBuffer) {
    throw new Error('Expected indexed cels after unlink');
  }
  expect(independent.canvas).not.toBe(remaining.canvas);
  expect(independent.indexBuffer).not.toBe(remaining.indexBuffer);
  expect(readCanvasPixel(independent.canvas)).toEqual(journey.sharedPixel);
  expect(readCanvasPixel(independent.canvas, 1)).toEqual([255, 0, 0, 255]);
  expect(readCanvasPixel(remaining.canvas)).toEqual(journey.sharedPixel);
  expect(readCanvasPixel(remaining.canvas, 1)).toEqual([0, 0, 0, 0]);
  expect(independent.indexBuffer[1]).toBe(3);
  expect(remaining.indexBuffer[1]).toBe(0);
}

afterEach(() => {
  document.body.replaceChildren();
  restoreDefaultProjectContext();
  for (const context of contexts.splice(0)) context.dispose();
});

describe('linked cel sharing in Chromium', () => {
  it('shows the header context bar, pictograms, names, and visible focus without a draw warning', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const layer = createNonAdjacentHardLinkedCels(context);
    setActiveProjectContext(context);

    const timeline = document.createElement('pf-timeline');
    timeline.style.width = '600px';
    timeline.style.height = '320px';
    document.body.append(timeline);
    await (timeline as import('../../src/components/timeline/pf-timeline').PFTimeline).updateComplete;

    const sharedCel = page.getByRole('button', {
      name: `${layer.name}, frame 3. Shared cel — affects frames 1, 3. Edits propagate to every affected frame.`,
    });
    await expect.element(sharedCel).toBeVisible();
    await expect.element(sharedCel).toHaveAccessibleName(
      `${layer.name}, frame 3. Shared cel — affects frames 1, 3. Edits propagate to every affected frame.`,
    );

    const header = timeline.shadowRoot?.querySelector<HTMLElement>('pf-timeline-header');
    const contextBar = header?.shadowRoot?.querySelector<HTMLElement>('[data-shared-cel-context]');
    const frameCells = header?.shadowRoot?.querySelector<HTMLElement>('pf-timeline-frame-cells');
    const activeFrame = frameCells?.shadowRoot?.querySelector<HTMLElement>('.frame-cell.active');
    expect(contextBar).toHaveTextContent('Shared cel — affects frames 1, 3');
    expect(contextBar?.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      activeFrame?.getBoundingClientRect().top ?? 0,
    );
    expect(contextBar?.getBoundingClientRect().width).toBeLessThanOrEqual(360);

    const grid = timeline.shadowRoot?.querySelector<HTMLElement>('pf-timeline-grid');
    expect(grid?.shadowRoot?.querySelectorAll('.link-glyph')).toHaveLength(2);

    await userEvent.click(sharedCel);
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('keeps the shared-cel context bar aligned with the visible frame after a tag collapses', async () => {
    const context = createProjectContext();
    contexts.push(context);
    createNonAdjacentHardLinkedCels(context);
    setActiveProjectContext(context);

    const tagResult = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.create',
        name: 'Intro',
        color: '#3498db',
        startFrameIndex: 0,
        endFrameIndex: 1,
      }),
    );
    if (!tagResult.ok || !tagResult.tagId) throw new Error('Expected the frame tag');

    const collapseResult = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.collapse',
        tagId: tagResult.tagId,
        collapsed: true,
      }),
    );
    expect(collapseResult.ok).toBe(true);

    const timeline = document.createElement('pf-timeline');
    timeline.style.width = '600px';
    timeline.style.height = '320px';
    document.body.append(timeline);
    await (timeline as import('../../src/components/timeline/pf-timeline').PFTimeline).updateComplete;

    const header = timeline.shadowRoot?.querySelector<HTMLElement>('pf-timeline-header');
    const contextBar = header?.shadowRoot?.querySelector<HTMLElement>('[data-shared-cel-context]');
    const frameCells = header?.shadowRoot?.querySelector<HTMLElement>('pf-timeline-frame-cells');
    await expect.poll(() => frameCells?.shadowRoot?.querySelector<HTMLElement>('.frame-cell.active')?.textContent?.trim())
      .toBe('3');
    const activeFrame = frameCells?.shadowRoot?.querySelector<HTMLElement>('.frame-cell.active');

    expect(contextBar).toBeTruthy();
    expect(contextBar?.getBoundingClientRect().left).toBe(
      activeFrame?.getBoundingClientRect().left,
    );
    expect(contextBar?.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      activeFrame?.getBoundingClientRect().top ?? 0,
    );
  });

  it('anchors a hidden active frame to the collapsed tag representative', async () => {
    const context = createProjectContext();
    contexts.push(context);
    createNonAdjacentHardLinkedCels(context);
    setActiveProjectContext(context);

    const tagResult = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.create',
        name: 'Outro',
        color: '#2ecc71',
        startFrameIndex: 1,
        endFrameIndex: 2,
      }),
    );
    if (!tagResult.ok || !tagResult.tagId) throw new Error('Expected the frame tag');

    const collapseResult = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.collapse',
        tagId: tagResult.tagId,
        collapsed: true,
      }),
    );
    expect(collapseResult.ok).toBe(true);

    const timeline = document.createElement('pf-timeline');
    timeline.style.width = '600px';
    timeline.style.height = '320px';
    document.body.append(timeline);
    await (timeline as import('../../src/components/timeline/pf-timeline').PFTimeline).updateComplete;

    const header = timeline.shadowRoot?.querySelector<HTMLElement>('pf-timeline-header');
    const contextBar = header?.shadowRoot?.querySelector<HTMLElement>('[data-shared-cel-context]');
    const frameCells = header?.shadowRoot?.querySelector<HTMLElement>('pf-timeline-frame-cells');
    await expect.poll(() => frameCells?.shadowRoot?.querySelectorAll('.frame-cell').length)
      .toBe(2);
    const visibleFrames = [...(frameCells?.shadowRoot?.querySelectorAll<HTMLElement>('.frame-cell') ?? [])];

    expect(visibleFrames.map((frame) => frame.textContent?.trim())).toEqual(['1', '2']);
    expect(frameCells?.shadowRoot?.querySelector('.frame-cell.active')).toBeNull();
    expect(contextBar?.getBoundingClientRect().left).toBe(
      visibleFrames[1]?.getBoundingClientRect().left,
    );
  });

  it('keeps a shared cel visibly focusable from the keyboard', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const layer = createNonAdjacentHardLinkedCels(context);
    setActiveProjectContext(context);

    const grid = document.createElement('pf-timeline-grid');
    document.body.append(grid);
    await (grid as import('../../src/components/timeline/pf-timeline-grid').PFTimelineGrid).updateComplete;

    const sharedCel = page.getByRole('button', {
      name: `${layer.name}, frame 1. Shared cel — affects frames 1, 3. Edits propagate to every affected frame.`,
    });
    await userEvent.tab();
    expect(grid.shadowRoot?.activeElement).toBe(sharedCel.element());
    expect((sharedCel.element() as HTMLButtonElement).matches(':focus-visible')).toBe(true);
  });

  it('unlinks the active shared cel from both UI routes and preserves the remaining group', async () => {
    const journey = await createLinkedCelJourney();
    await unlinkFromContextBar(journey);
    journey.context.animation.goToFrame(journey.firstFrameId);
    await waitForJourneyRender(journey);
    await undoUnlink(journey);
    journey.context.animation.goToFrame(journey.activeFrameId);
    await waitForJourneyRender(journey);
    await redoUnlink(journey);
    await undoUnlink(journey);
    await unlinkFromContextMenu(journey);
    await undoUnlink(journey);
    await redoUnlink(journey);
    await drawIndependentlyAfterUnlink(journey);
  });
});
