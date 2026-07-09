import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

import '../../../src/components/color/pf-color-selector-compact';
import '../../../src/components/color/pf-lightness-bar';
import type { PFColorSelectorCompact } from '../../../src/components/color/pf-color-selector-compact';
import type { PFLightnessBar } from '../../../src/components/color/pf-lightness-bar';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';

const createdContexts: ProjectContext[] = [];

function createContext(primaryColor: string, secondaryColor: string) {
  const context = createProjectContext();
  context.colors.setPrimaryColor(primaryColor);
  context.colors.setSecondaryColor(secondaryColor);
  context.colors.updateLightnessVariations(primaryColor);
  createdContexts.push(context);
  return context;
}

async function waitForContextRender(element: { updateComplete: Promise<unknown> }) {
  await Promise.resolve();
  await Promise.resolve();
  await element.updateComplete;
}

async function createColorSelector() {
  const selector = document.createElement(
    'pf-color-selector-compact'
  ) as PFColorSelectorCompact;
  document.body.append(selector);
  await selector.updateComplete;
  return selector;
}

async function createLightnessBar() {
  const bar = document.createElement('pf-lightness-bar') as PFLightnessBar;
  document.body.append(bar);
  await bar.updateComplete;
  return bar;
}

function colorBoxStyle(selector: PFColorSelectorCompact, className: 'fg' | 'bg') {
  return selector.shadowRoot
    ?.querySelector<HTMLElement>(`.color-box.${className}`)
    ?.getAttribute('style');
}

function pickerValue(selector: PFColorSelectorCompact, id: 'fg-picker' | 'bg-picker') {
  return selector.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`)?.value;
}

describe('toolbar color controls active project context binding', () => {
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

  it('rerenders compact colors and mutates only the active project', async () => {
    const contextA = createContext('#111111', '#222222');
    const contextB = createContext('#abcdef', '#fedcba');
    setActiveProjectContext(contextA);
    const selector = await createColorSelector();

    expect(colorBoxStyle(selector, 'fg')).toBe('background-color: #111111');
    expect(colorBoxStyle(selector, 'bg')).toBe('background-color: #222222');
    expect(pickerValue(selector, 'fg-picker')).toBe('#111111');
    expect(pickerValue(selector, 'bg-picker')).toBe('#222222');

    setActiveProjectContext(contextB);
    await waitForContextRender(selector);

    expect(colorBoxStyle(selector, 'fg')).toBe('background-color: #abcdef');
    expect(colorBoxStyle(selector, 'bg')).toBe('background-color: #fedcba');
    expect(pickerValue(selector, 'fg-picker')).toBe('#abcdef');
    expect(pickerValue(selector, 'bg-picker')).toBe('#fedcba');

    const foregroundPicker = selector.shadowRoot?.querySelector<HTMLInputElement>('#fg-picker');
    foregroundPicker!.value = '#123456';
    foregroundPicker!.dispatchEvent(new Event('input'));

    expect(contextB.colors.primaryColor.value).toBe('#123456');
    expect(contextA.colors.primaryColor.value).toBe('#111111');

    selector.shadowRoot?.querySelector<HTMLButtonElement>('.swap-btn')?.click();

    expect(contextB.colors.primaryColor.value).toBe('#fedcba');
    expect(contextB.colors.secondaryColor.value).toBe('#123456');
    expect(contextA.colors.secondaryColor.value).toBe('#222222');

    selector.shadowRoot?.querySelector<HTMLButtonElement>('.reset-btn')?.click();

    expect(contextB.colors.primaryColor.value).toBe('#000000');
    expect(contextB.colors.secondaryColor.value).toBe('#ffffff');
    expect(contextA.colors.primaryColor.value).toBe('#111111');
    expect(contextA.colors.secondaryColor.value).toBe('#222222');
  });

  it('rerenders lightness choices and selects a shade only in the active project', async () => {
    const contextA = createContext('#111111', '#222222');
    const contextB = createContext('#abcdef', '#fedcba');
    contextA.colors.lightnessVariations.value = ['#111111', '#222222'];
    contextA.colors.lightnessIndex.value = 0;
    contextB.colors.lightnessVariations.value = ['#abcdef', '#fedcba', '#123456'];
    contextB.colors.lightnessIndex.value = 1;
    setActiveProjectContext(contextA);
    const bar = await createLightnessBar();

    expect(bar.shadowRoot?.querySelectorAll('.swatch')).toHaveLength(2);
    expect(bar.shadowRoot?.querySelector('.swatch.active')?.getAttribute('style')).toBe(
      'background-color: #111111'
    );

    setActiveProjectContext(contextB);
    await waitForContextRender(bar);

    const swatches = bar.shadowRoot?.querySelectorAll<HTMLElement>('.swatch');
    expect(swatches).toHaveLength(3);
    expect(bar.shadowRoot?.querySelector('.swatch.active')?.getAttribute('style')).toBe(
      'background-color: #fedcba'
    );

    swatches?.[2].click();

    expect(contextB.colors.lightnessIndex.value).toBe(2);
    expect(contextB.colors.primaryColor.value).toBe('#123456');
    expect(contextA.colors.lightnessIndex.value).toBe(0);
    expect(contextA.colors.primaryColor.value).toBe('#111111');
  });
});
