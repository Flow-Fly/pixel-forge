import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../../../src/components/timeline/pf-timeline-layers';
import type { PFTimelineLayers } from '../../../src/components/timeline/pf-timeline-layers';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';
import type { Layer, LayerType } from '../../../src/types/layer';

const createdContexts: ProjectContext[] = [];

function createLayer(id: string, name: string, type: LayerType): Layer {
  return {
    id,
    name,
    type,
    visible: true,
    locked: false,
    opacity: type === 'reference' ? 128 : 255,
    blendMode: 'normal',
    parentId: null,
    referenceData: type === 'reference'
      ? {
          bytes: Uint8Array.from([1, 2, 3]),
          mimeType: 'image/png',
          x: 0,
          y: 0,
          scale: 1,
        }
      : undefined,
  };
}

function createContext() {
  const context = createProjectContext();
  context.layers.layers.value = [
    createLayer('image-layer', 'Pixels', 'image'),
    createLayer('text-layer', 'Caption', 'text'),
    createLayer('reference-layer', 'Pose Guide', 'reference'),
  ];
  context.layers.activeLayerId.value = 'reference-layer';
  createdContexts.push(context);
  return context;
}

async function createTimelineLayers() {
  const element = document.createElement('pf-timeline-layers') as PFTimelineLayers;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function layerRow(element: PFTimelineLayers, type: LayerType) {
  const row = element.shadowRoot?.querySelector<HTMLElement>(
    `.layer-row[data-layer-type="${type}"]`
  );
  expect(row).toBeTruthy();
  return row!;
}

function clickButton(row: HTMLElement, title: string) {
  const button = row.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  expect(button).toBeTruthy();
  button!.click();
}

describe('pf-timeline-layers reference identity', () => {
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

  it('shows an icon and reference badge without changing image or text row identity', async () => {
    const context = createContext();
    setActiveProjectContext(context);
    const element = await createTimelineLayers();

    const referenceRow = layerRow(element, 'reference');
    expect(referenceRow.querySelector('.reference-layer-icon')?.textContent).toBe('▧');
    expect(referenceRow.querySelector('.reference-layer-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(referenceRow.querySelector('.reference-layer-label')?.textContent).toBe('reference');
    expect(referenceRow.querySelector('.reference-layer-abbreviation')?.textContent).toBe('REF');
    expect(referenceRow.querySelector('.reference-layer-badge')?.getAttribute('title')).toBe('Reference layer');
    expect(referenceRow.querySelector('.layer-name')?.textContent).toContain('Pose Guide');

    const textRow = layerRow(element, 'text');
    expect(textRow.querySelector('.layer-type-badge')?.textContent).toBe('T');
    expect(textRow.querySelector('.reference-layer-icon')).toBeNull();
    expect(textRow.querySelector('.reference-layer-badge')).toBeNull();

    const imageRow = layerRow(element, 'image');
    expect(imageRow.querySelector('.layer-type-badge')).toBeNull();
    expect(imageRow.querySelector('.reference-layer-icon')).toBeNull();
  });

  it('keeps visibility, lock, and opacity controls working for reference rows', async () => {
    const context = createContext();
    setActiveProjectContext(context);
    const element = await createTimelineLayers();
    let referenceRow = layerRow(element, 'reference');

    expect(referenceRow.querySelector('.opacity-value')?.textContent?.trim()).toBe('50%');
    clickButton(referenceRow, 'Hide layer');
    clickButton(referenceRow, 'Lock layer');

    const referenceLayer = () =>
      context.layers.layers.value.find((layer) => layer.id === 'reference-layer');
    expect(referenceLayer()).toMatchObject({ visible: false, locked: true, opacity: 128 });

    referenceRow.querySelector<HTMLElement>('.opacity-value')?.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true })
    );
    await element.updateComplete;
    referenceRow = layerRow(element, 'reference');
    const opacityInput = referenceRow.querySelector<HTMLInputElement>('.opacity-input');
    expect(opacityInput).toBeTruthy();
    opacityInput!.value = '75';
    opacityInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();

    expect(referenceLayer()?.opacity).toBe(191);
    expect(context.history.undoStack.value.at(-1)?.name).toBe('Update Layer');
  });
});
