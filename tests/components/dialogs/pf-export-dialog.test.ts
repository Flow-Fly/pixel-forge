import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../../../src/components/dialogs/pf-export-dialog';
import type { PFExportDialog } from '../../../src/components/dialogs/pf-export-dialog';
import { CRT_PRESETS } from '../../../src/services/view-effects';
import { settingsStore } from '../../../src/stores/settings';

function createDialog(): PFExportDialog {
  const dialog = document.createElement('pf-export-dialog') as PFExportDialog;
  document.body.append(dialog);
  dialog.open = true;
  return dialog;
}

describe('pf-export-dialog view-effect export', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    settingsStore.setActiveViewEffect(null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the opt-in control hidden without an active view effect', async () => {
    const dialog = createDialog();
    await dialog.updateComplete;

    const format = dialog.shadowRoot?.querySelector<HTMLSelectElement>('#export-format');
    expect(format).toBeTruthy();
    format!.value = 'png';
    format!.dispatchEvent(new Event('change'));
    await dialog.updateComplete;

    expect(dialog.shadowRoot?.querySelector('#apply-view-effect')).toBeNull();
  });

  it('opts into a labeled CRT copy and enforces the minimum scale', async () => {
    settingsStore.setViewEffectParams('crt', { ...CRT_PRESETS.arcade });
    settingsStore.setActiveViewEffect('crt');
    const dialog = createDialog();
    await dialog.updateComplete;

    const format = dialog.shadowRoot?.querySelector<HTMLSelectElement>('#export-format');
    format!.value = 'png';
    format!.dispatchEvent(new Event('change'));
    await dialog.updateComplete;

    const effect = dialog.shadowRoot?.querySelector<HTMLInputElement>('#apply-view-effect');
    expect(effect).toBeTruthy();
    expect(effect?.checked).toBe(false);

    effect!.checked = true;
    effect!.dispatchEvent(new Event('change'));
    await dialog.updateComplete;

    const scale = dialog.shadowRoot?.querySelector<HTMLSelectElement>('#export-scale');
    expect(scale?.value).toBe('4');
    expect(scale?.querySelector<HTMLOptionElement>('option[value="1"]')?.disabled).toBe(true);
    expect(dialog.shadowRoot?.textContent).toContain('CRT copy');
  });
});
