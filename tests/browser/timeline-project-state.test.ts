import { afterEach, describe, expect, it } from 'vitest';
import '../../src/components/timeline/pf-timeline-layers';
import '../../src/components/timeline/timeline-header/pf-timeline-tag-bars';
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

const contexts: ProjectContext[] = [];

afterEach(() => {
  document.body.replaceChildren();
  restoreDefaultProjectContext();
  for (const context of contexts.splice(0)) context.dispose();
});

describe('timeline project-state browser journeys', () => {
  it('commits a layer visibility click in the active Chromium document', async () => {
    const context = createProjectContext();
    contexts.push(context);
    setActiveProjectContext(context);

    const element = document.createElement('pf-timeline-layers');
    document.body.append(element);
    await (element as import('../../src/components/timeline/pf-timeline-layers').PFTimelineLayers)
      .updateComplete;

    const button = element.shadowRoot?.querySelector<HTMLButtonElement>('button[title="Hide layer"]');
    expect(button).toBeTruthy();
    button?.click();
    await Promise.resolve();

    expect(context.layers.layers.value[0]?.visible).toBe(false);
    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.project.revision.value).toBe(1);
  });

  it('commits a frame-tag collapse click in the active Chromium document', async () => {
    const context = createProjectContext();
    contexts.push(context);
    context.animation.addFrame(false);
    setActiveProjectContext(context);

    const created = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.create',
        name: 'Walk',
        color: '#ff0000',
        startFrameIndex: 0,
        endFrameIndex: 1,
      }),
    );
    expect(created.ok).toBe(true);

    const element = document.createElement('pf-timeline-tag-bars');
    document.body.append(element);
    await (element as import('../../src/components/timeline/timeline-header/pf-timeline-tag-bars').PFTimelineTagBars)
      .updateComplete;

    const chevron = element.shadowRoot?.querySelector<HTMLElement>('.tag-chevron');
    expect(chevron).toBeTruthy();
    chevron?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(context.animation.tags.value[0]?.collapsed).toBe(true);
    expect(context.history.undoStack.value).toHaveLength(2);
    expect(context.project.revision.value).toBe(2);
  });
});
