import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../../src/components/color/pf-save-palette-dialog';
import type { PfSavePaletteDialog } from '../../../src/components/color/pf-save-palette-dialog';

async function settle(dialog: PfSavePaletteDialog) {
  await Promise.resolve();
  await dialog.updateComplete;
}

async function createDialog() {
  const dialog = document.createElement('pf-save-palette-dialog') as PfSavePaletteDialog;
  dialog.defaultName = 'Forest';
  dialog.open = true;
  document.body.append(dialog);
  await settle(dialog);
  return dialog;
}

describe('pf-save-palette-dialog', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('locks its fields and close paths while a save is pending', async () => {
    const dialog = await createDialog();
    const saveSpy = vi.fn();
    const cancelSpy = vi.fn();
    dialog.addEventListener('save', saveSpy);
    dialog.addEventListener('cancel', cancelSpy);
    dialog.pending = true;
    await settle(dialog);

    const input = dialog.shadowRoot?.querySelector<HTMLInputElement>('.form-input');
    const save = dialog.shadowRoot?.querySelector<HTMLButtonElement>('.btn-save');
    const cancel = dialog.shadowRoot?.querySelector<HTMLButtonElement>('.btn-cancel');
    expect(input?.disabled).toBe(true);
    expect(save?.disabled).toBe(true);
    expect(save?.textContent).toContain('Saving…');
    expect(cancel?.disabled).toBe(true);

    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialog.shadowRoot
      ?.querySelector<HTMLElement>('.overlay')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(saveSpy).not.toHaveBeenCalled();
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('exposes parent failures as an accessible error and requests clearing on input', async () => {
    const dialog = await createDialog();
    const inputSpy = vi.fn();
    dialog.addEventListener('name-input', inputSpy);
    dialog.errorMessage = 'Palette could not be saved. Try again.';
    await settle(dialog);

    const input = dialog.shadowRoot?.querySelector<HTMLInputElement>('.form-input');
    const error = dialog.shadowRoot?.querySelector('#palette-save-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('Palette could not be saved');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-describedby')).toBe('palette-save-error');

    if (input) {
      input.value = 'Forest 2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(inputSpy).toHaveBeenCalledTimes(1);
  });
});
