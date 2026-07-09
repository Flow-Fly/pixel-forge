import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importReferenceImageFileMock = vi.hoisted(() => vi.fn(async () => null));

vi.mock('../../../src/services/reference-import-action', () => ({
  importReferenceImageFile: importReferenceImageFileMock,
}));

import '../../../src/components/timeline/pf-timeline-layers';
import type { PFTimelineLayers } from '../../../src/components/timeline/pf-timeline-layers';
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

async function createTimelineLayers() {
  const element = document.createElement('pf-timeline-layers') as PFTimelineLayers;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function importReferenceButton(element: PFTimelineLayers) {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
    'button[title="Import Reference Image"]'
  );
  expect(button).toBeTruthy();
  return button!;
}

function useReferenceImageInput(files: File[], dispatchChangeOnClick = true) {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });

  const click = vi.spyOn(input, 'click').mockImplementation(() => {
    if (dispatchChangeOnClick) {
      input.dispatchEvent(new Event('change'));
    }
  });

  const originalCreateElement = document.createElement.bind(document);
  const createElement = vi.spyOn(document, 'createElement');
  createElement.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    if (tagName === 'input') return input;
    return originalCreateElement(tagName, options);
  }) as typeof document.createElement);

  return { click, input };
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('pf-timeline-layers reference import', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
  });

  it('imports the selected reference image into the project active when the picker opened', async () => {
    const contextA = createContext('Context A');
    const contextB = createContext('Context B');
    const file = new File([Uint8Array.from([1, 2, 3])], 'guide.png', { type: 'image/png' });
    const { input } = useReferenceImageInput([file], false);
    setActiveProjectContext(contextA);
    const layers = await createTimelineLayers();

    importReferenceButton(layers).click();
    setActiveProjectContext(contextB);
    input.dispatchEvent(new Event('change'));
    await flushImport();

    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/png,image/jpeg,image/webp');
    expect(importReferenceImageFileMock).toHaveBeenCalledTimes(1);
    expect(importReferenceImageFileMock).toHaveBeenCalledWith(contextA, file);
  });

  it('does nothing when the reference image picker is canceled', async () => {
    const context = createContext('Context A');
    const { click } = useReferenceImageInput([]);
    setActiveProjectContext(context);
    const layers = await createTimelineLayers();

    importReferenceButton(layers).click();
    await flushImport();

    expect(click).toHaveBeenCalledTimes(1);
    expect(importReferenceImageFileMock).not.toHaveBeenCalled();
  });
});
