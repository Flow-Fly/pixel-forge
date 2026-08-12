import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import '../../src/components/timeline/pf-timeline';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

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
});
