import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../../../src/components/toolbar/options/pf-option-checkbox';
import '../../../src/components/toolbar/options/pf-option-slider';
import type { PfOptionCheckbox } from '../../../src/components/toolbar/options/pf-option-checkbox';
import type { PfOptionSlider } from '../../../src/components/toolbar/options/pf-option-slider';
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

async function createSlider(storeKey: 'size' | 'opacity') {
  const element = document.createElement('pf-option-slider') as PfOptionSlider;
  element.label = storeKey;
  element.store = 'brush';
  element.storeKey = storeKey;
  element.min = storeKey === 'size' ? 1 : 0;
  element.max = storeKey === 'size' ? 64 : 100;
  element.step = 1;
  element.multiplier = storeKey === 'opacity' ? 100 : 1;
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

  it('preserves Size attributes and writes its native input value', async () => {
    const element = await createSlider('size');
    const input = element.shadowRoot?.querySelector<HTMLInputElement>('input[type="range"]');

    expect(input).toMatchObject({
      min: '1',
      max: '64',
      step: '1',
      value: '1',
    });

    input!.value = '12';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(brushStore.activeBrush.value.size).toBe(12);
  });

  it('maps the Opacity percentage back to its stored fraction', async () => {
    const element = await createSlider('opacity');
    const input = element.shadowRoot?.querySelector<HTMLInputElement>('input[type="range"]');

    expect(input?.value).toBe('50');

    input!.value = '63';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(brushStore.activeBrush.value.opacity).toBe(0.63);
  });
});
