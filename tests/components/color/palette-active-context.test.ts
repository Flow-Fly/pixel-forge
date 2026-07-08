import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock('../../../src/components/color/pf-color-picker-popup', () => ({}));

import '../../../src/components/color/palette-panel/pf-palette-grid';
import '../../../src/components/color/pf-palette-panel';
import '../../../src/components/color/pf-palette-selector';
import type { PFPaletteGrid } from '../../../src/components/color/palette-panel/pf-palette-grid';
import type { PFPalettePanel } from '../../../src/components/color/pf-palette-panel';
import type { PfPaletteSelector } from '../../../src/components/color/pf-palette-selector';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';
import type { CustomPalette } from '../../../src/types/palette';

const createdContexts: ProjectContext[] = [];

function createContextWithPalette(colors: string[]) {
  const context = createProjectContext();
  context.palette.setPalette(colors);
  createdContexts.push(context);
  return context;
}

function makeCustomPalette(id: string, name: string, colors: string[]): CustomPalette {
  return {
    id,
    name,
    colors,
    createdAt: 1,
    updatedAt: 1,
  };
}

async function waitForContextRender(element: { updateComplete: Promise<unknown> }) {
  await Promise.resolve();
  await Promise.resolve();
  await element.updateComplete;
}

async function settlePaletteLoads() {
  await Promise.resolve();
  await Promise.resolve();
}

async function createPaletteGrid() {
  const grid = document.createElement('pf-palette-grid') as PFPaletteGrid;
  document.body.append(grid);
  await grid.updateComplete;
  return grid;
}

async function createPaletteSelector() {
  const selector = document.createElement('pf-palette-selector') as PfPaletteSelector;
  document.body.append(selector);
  await selector.updateComplete;
  return selector;
}

async function createPalettePanel() {
  const panel = document.createElement('pf-palette-panel') as PFPalettePanel;
  document.body.append(panel);
  await panel.updateComplete;
  const grid = panel.shadowRoot?.querySelector<PFPaletteGrid>('pf-palette-grid');
  await grid?.updateComplete;
  return { panel, grid };
}

function renderedSwatchColors(grid: PFPaletteGrid) {
  return [...(grid.shadowRoot?.querySelectorAll<HTMLElement>('.swatch') ?? [])].map((swatch) =>
    swatch.getAttribute('style')
  );
}

function selectorLabel(selector: PfPaletteSelector) {
  return selector.shadowRoot?.querySelector('.trigger-label')?.textContent ?? '';
}

describe('palette active project context binding', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
  });

  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    vi.restoreAllMocks();
  });

  it('rerenders palette grid colors after the active context changes', async () => {
    const contextA = createContextWithPalette(['#111111', '#222222']);
    const contextB = createContextWithPalette(['#abcdef']);
    setActiveProjectContext(contextA);

    const grid = await createPaletteGrid();

    expect(renderedSwatchColors(grid)).toEqual([
      'background-color: #111111',
      'background-color: #222222',
    ]);

    setActiveProjectContext(contextB);
    await waitForContextRender(grid);

    expect(renderedSwatchColors(grid)).toEqual(['background-color: #abcdef']);
  });

  it('rerenders the palette selector name after the active context changes', async () => {
    const contextA = createContextWithPalette(['#111111']);
    const contextB = createContextWithPalette(['#222222']);
    await settlePaletteLoads();
    contextA.palette.customPalettes.value = [
      makeCustomPalette('palette-a', 'Palette A', ['#111111']),
    ];
    contextA.palette.currentPresetId.value = null;
    contextA.palette.currentCustomPaletteId.value = 'palette-a';
    contextB.palette.customPalettes.value = [
      makeCustomPalette('palette-b', 'Palette B', ['#222222']),
    ];
    contextB.palette.currentPresetId.value = null;
    contextB.palette.currentCustomPaletteId.value = 'palette-b';
    setActiveProjectContext(contextA);

    const selector = await createPaletteSelector();

    expect(selectorLabel(selector)).toBe('Palette A');

    setActiveProjectContext(contextB);
    await waitForContextRender(selector);

    expect(selectorLabel(selector)).toBe('Palette B');
  });

  it('applies a palette edit to the context that opened the color picker', async () => {
    const contextA = createContextWithPalette(['#111111']);
    const contextB = createContextWithPalette(['#222222']);
    setActiveProjectContext(contextA);
    const { panel, grid } = await createPalettePanel();
    expect(grid).toBeTruthy();

    grid?.dispatchEvent(
      new CustomEvent('swatch-edit', {
        detail: {
          color: '#111111',
          index: 0,
          anchor: grid,
          context: contextA,
        },
        bubbles: true,
        composed: true,
      })
    );
    await panel.updateComplete;

    setActiveProjectContext(contextB);
    await waitForContextRender(panel);

    panel.shadowRoot?.querySelector('pf-color-picker-popup')?.dispatchEvent(
      new CustomEvent('apply', {
        detail: { color: '#333333', paletteIndex: 0 },
        bubbles: true,
        composed: true,
      })
    );
    await waitForContextRender(panel);

    expect(contextA.palette.mainColors.value).toEqual(['#333333']);
    expect(contextA.history.undoStack.value).toHaveLength(1);
    expect(contextB.palette.mainColors.value).toEqual(['#222222']);
    expect(contextB.history.undoStack.value).toHaveLength(0);

    await contextA.history.undo();

    expect(contextA.palette.mainColors.value).toEqual(['#111111']);
  });
});
