import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components/color/pf-color-picker-popup', () => ({}));

import '../../../src/components/color/pf-palette-panel';
import type { PFPalettePanel } from '../../../src/components/color/pf-palette-panel';
import type { PfSavePaletteDialog } from '../../../src/components/color/pf-save-palette-dialog';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';

let context: ProjectContext;

async function settle(panel: PFPalettePanel) {
  await Promise.resolve();
  await panel.updateComplete;
  await Promise.resolve();
  await panel.updateComplete;
}

async function settleWithDialog(panel: PFPalettePanel, dialog: PfSavePaletteDialog) {
  await settle(panel);
  await dialog.updateComplete;
  await panel.updateComplete;
}

function shadowElement<T extends Element>(
  host: { shadowRoot: ShadowRoot | null },
  selector: string,
): T {
  const element = host.shadowRoot?.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

describe('pf-palette-panel save dialog', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    context = createProjectContext();
    context.palette.setPalette(['#112233']);
    setActiveProjectContext(context);
  });

  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    restoreDefaultProjectContext();
    context.dispose();
    vi.restoreAllMocks();
  });

  it('keeps a failed Save As open and announces the recoverable error', async () => {
    let rejectSave = (_reason: Error) => {
      throw new Error('Save rejection was not initialized');
    };
    const saveAsNewPalette = vi.spyOn(context.palette, 'saveAsNewPalette')
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectSave = reject;
      }));
    const panel = document.createElement('pf-palette-panel') as PFPalettePanel;
    document.body.append(panel);
    await settle(panel);

    shadowElement(panel, 'pf-palette-toolbar').dispatchEvent(
      new CustomEvent('menu-save-as'),
    );
    await settle(panel);

    const dialog = shadowElement<PfSavePaletteDialog>(
      panel,
      'pf-save-palette-dialog',
    );
    const input = shadowElement<HTMLInputElement>(dialog, '.form-input');
    input.value = 'Forest';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settleWithDialog(panel, dialog);
    const save = shadowElement<HTMLButtonElement>(dialog, '.btn-save');
    save.click();
    save.click();
    await settleWithDialog(panel, dialog);

    expect(saveAsNewPalette).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    expect(dialog.pending).toBe(true);
    expect(shadowElement<HTMLInputElement>(dialog, '.form-input').disabled).toBe(true);
    expect(shadowElement<HTMLButtonElement>(dialog, '.btn-save').textContent)
      .toContain('Saving…');

    rejectSave(new Error('IndexedDB write failed'));
    await settleWithDialog(panel, dialog);

    const error = shadowElement(dialog, '#palette-save-error');
    expect(dialog.open).toBe(true);
    expect(dialog.pending).toBe(false);
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain('Palette could not be saved');

    const retryInput = shadowElement<HTMLInputElement>(dialog, '.form-input');
    retryInput.value = 'Forest retry';
    retryInput.dispatchEvent(new Event('input', { bubbles: true }));
    await settleWithDialog(panel, dialog);

    expect(dialog.shadowRoot?.querySelector('#palette-save-error')).toBeNull();
  });
});
