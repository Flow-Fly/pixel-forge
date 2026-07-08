import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../../../src/components/timeline/pf-playback-controls';
import '../../../src/components/timeline/pf-timeline-layers';
import '../../../src/components/timeline/timeline-header/pf-timeline-frame-cells';
import type { PFPlaybackControls } from '../../../src/components/timeline/pf-playback-controls';
import type { PFTimelineLayers } from '../../../src/components/timeline/pf-timeline-layers';
import type { PFTimelineFrameCells } from '../../../src/components/timeline/timeline-header/pf-timeline-frame-cells';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';

const createdContexts: ProjectContext[] = [];

function createContext(name: string) {
  const context = createProjectContext();
  context.project.name.value = name;
  createdContexts.push(context);
  return context;
}

function renameFirstLayer(context: ProjectContext, name: string) {
  const layer = context.layers.layers.value[0];
  context.layers.updateLayer(layer.id, { name });
  return layer.id;
}

async function waitForContextRender(element: { updateComplete: Promise<unknown> }) {
  await Promise.resolve();
  await Promise.resolve();
  await element.updateComplete;
}

async function createTimelineLayers() {
  const element = document.createElement('pf-timeline-layers') as PFTimelineLayers;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

async function createPlaybackControls() {
  const element = document.createElement('pf-playback-controls') as PFPlaybackControls;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

async function createFrameCells() {
  const element = document.createElement('pf-timeline-frame-cells') as PFTimelineFrameCells;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function layerNames(element: PFTimelineLayers) {
  return [...(element.shadowRoot?.querySelectorAll('.layer-name') ?? [])].map(
    (name) => name.textContent?.trim() ?? ''
  );
}

function clickByTitle(root: ShadowRoot | null, title: string) {
  const button = root?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  expect(button).toBeTruthy();
  button?.click();
}

function frameLabels(element: PFTimelineFrameCells) {
  return [...(element.shadowRoot?.querySelectorAll('.frame-number') ?? [])].map(
    (frame) => frame.textContent?.trim() ?? ''
  );
}

describe('timeline active project context binding', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
  });

  it('rerenders layers after the active context changes', async () => {
    const contextA = createContext('Context A');
    const contextB = createContext('Context B');
    renameFirstLayer(contextA, 'Layer A');
    renameFirstLayer(contextB, 'Layer B');
    setActiveProjectContext(contextA);

    const layers = await createTimelineLayers();

    expect(layerNames(layers)).toEqual(['Layer A']);

    setActiveProjectContext(contextB);
    await waitForContextRender(layers);

    expect(layerNames(layers)).toEqual(['Layer B']);
  });

  it('rerenders frame cells after the active context changes', async () => {
    const contextA = createContext('Context A');
    const contextB = createContext('Context B');
    contextA.animation.addFrame(false);
    setActiveProjectContext(contextA);

    const frameCells = await createFrameCells();

    expect(frameLabels(frameCells)).toEqual(['1', '2']);

    setActiveProjectContext(contextB);
    await waitForContextRender(frameCells);

    expect(frameLabels(frameCells)).toEqual(['1']);
  });

  it('records layer toolbar actions in the active context history', async () => {
    const contextA = createContext('Context A');
    const contextB = createContext('Context B');
    setActiveProjectContext(contextA);

    const layers = await createTimelineLayers();
    clickByTitle(layers.shadowRoot, 'Add Layer');
    await waitForContextRender(layers);

    expect(contextA.layers.layers.value).toHaveLength(2);
    expect(contextA.history.undoStack.value).toHaveLength(1);
    expect(contextB.layers.layers.value).toHaveLength(1);
    expect(contextB.history.undoStack.value).toHaveLength(0);
  });

  it('records playback frame actions in the active context history', async () => {
    const contextA = createContext('Context A');
    const contextB = createContext('Context B');
    setActiveProjectContext(contextA);

    const controls = await createPlaybackControls();
    clickByTitle(controls.shadowRoot, 'Add Duplicate Frame');
    await waitForContextRender(controls);

    expect(contextA.animation.frames.value).toHaveLength(2);
    expect(contextA.history.undoStack.value).toHaveLength(1);
    expect(contextB.animation.frames.value).toHaveLength(1);
    expect(contextB.history.undoStack.value).toHaveLength(0);
  });

  it('commits a layer rename to the context where editing started', async () => {
    const contextA = createContext('Context A');
    const contextB = createContext('Context B');
    const layerAId = renameFirstLayer(contextA, 'Layer A');
    renameFirstLayer(contextB, 'Layer B');
    setActiveProjectContext(contextA);
    const layers = await createTimelineLayers();
    const event = new Event('dblclick');

    (layers as any).startRename(layerAId, 'Layer A', event);
    setActiveProjectContext(contextB);
    await waitForContextRender(layers);
    (layers as any).editingName = 'Renamed A';
    (layers as any).finishRename();
    await waitForContextRender(layers);

    expect(contextA.layers.layers.value[0].name).toBe('Renamed A');
    expect(contextA.history.undoStack.value).toHaveLength(1);
    expect(contextB.layers.layers.value[0].name).toBe('Layer B');
    expect(contextB.history.undoStack.value).toHaveLength(0);
  });
});
