import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../../../src/components/toolbar/options/pf-option-checkbox';
import type { PfOptionCheckbox } from '../../../src/components/toolbar/options/pf-option-checkbox';
import { brushStore } from '../../../src/stores/brush';
import type { Brush } from '../../../src/types/brush';

let originalBrush: Brush;

async function createCheckbox() {
  const element = document.createElement('pf-option-checkbox') as PfOptionCheckbox;
  element.label = 'Pixel Perfect';
  element.store = 'brush';
  element.storeKey = 'pixelPerfect';
  document.body.append(element);
  await element.updateComplete;
  return element;
}

describe('toolbar option controls', () => {
  beforeEach(() => {
    originalBrush = brushStore.activeBrush.value;
    brushStore.activeBrush.value = {
      ...originalBrush,
      size: 1,
      opacity: 0.5,
      pixelPerfect: false,
    };
  });

  afterEach(() => {
    document.body.replaceChildren();
    brushStore.activeBrush.value = originalBrush;
  });

  it('keeps the Pixel Perfect control native and disabled-safe', async () => {
    const element = await createCheckbox();
    const input = element.shadowRoot?.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input?.checked).toBe(false);

    input!.disabled = true;
    input!.click();
    expect(brushStore.activeBrush.value.pixelPerfect).toBe(false);

    input!.disabled = false;
    input!.click();
    await element.updateComplete;

    expect(brushStore.activeBrush.value.pixelPerfect).toBe(true);
  });
});
