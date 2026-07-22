import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../src/components/dialogs/pf-export-dialog';
import type { PFExportDialog } from '../../../src/components/dialogs/pf-export-dialog';
import { CRT_PRESETS } from '../../../src/services/view-effects';
import { FileService } from '../../../src/services/file-service';
import {
  createProjectContext,
  defaultProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';
import { settingsStore } from '../../../src/stores/settings';
import { productTelemetry } from '../../../src/services/telemetry';

vi.mock('../../../src/services/export-composition', () => ({
  composeExportFrame: vi.fn(() => document.createElement('canvas')),
}));

const createdContexts: ProjectContext[] = [];

function createDialog(context?: ProjectContext): PFExportDialog {
  const dialog = document.createElement('pf-export-dialog') as PFExportDialog;
  if (context) {
    (dialog as PFExportDialog & { context: ProjectContext }).context = context;
  }
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
    vi.restoreAllMocks();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
  });

  it('exports the project context that opened the dialog', async () => {
    const record = vi.spyOn(productTelemetry, 'record');
    const contextB = createProjectContext();
    contextB.project.name.value = 'Tab B';
    createdContexts.push(contextB);
    setActiveProjectContext(contextB);
    const projectA = { name: 'Tab A' };
    const projectB = { name: 'Tab B' };
    vi.spyOn(defaultProjectContext.project, 'saveProject').mockResolvedValue(
      projectA as never
    );
    vi.spyOn(contextB.project, 'saveProject').mockResolvedValue(projectB as never);
    const saveCompressed = vi
      .spyOn(FileService, 'saveCompressed')
      .mockImplementation(() => {});
    const dialog = createDialog(contextB);
    await dialog.updateComplete;

    dialog.shadowRoot?.querySelector<HTMLButtonElement>('.btn-export')?.click();
    await vi.waitFor(() => {
      expect(saveCompressed).toHaveBeenCalled();
    });

    expect(saveCompressed).toHaveBeenCalledWith(projectB, 'Tab B.pf');
    expect(record).toHaveBeenCalledWith({
      name: 'export_completed',
      dimensions: { format: 'pixel_forge' },
    });
  });

  // #412: Completion telemetry must follow confirmed static WebP completion.
  it('waits for static WebP completion before recording the export', async () => {
    let finishExport: (() => void) | undefined;
    const exportFinished = new Promise<void>((resolve) => {
      finishExport = resolve;
    });
    const exportToWebP = vi
      .spyOn(FileService, 'exportToWebP')
      .mockImplementation(() => exportFinished);
    const record = vi.spyOn(productTelemetry, 'record');
    const dialog = createDialog();
    await dialog.updateComplete;

    const format = dialog.shadowRoot?.querySelector<HTMLSelectElement>('#export-format');
    format!.value = 'webp';
    format!.dispatchEvent(new Event('change'));
    await dialog.updateComplete;

    dialog.shadowRoot?.querySelector<HTMLButtonElement>('.btn-export')?.click();
    await vi.waitFor(() => expect(exportToWebP).toHaveBeenCalledOnce());

    expect(record).not.toHaveBeenCalled();

    finishExport?.();
    await vi.waitFor(() => {
      expect(record).toHaveBeenCalledWith({
        name: 'export_completed',
        dimensions: { format: 'webp' },
      });
    });
  });

  it('does not record a static WebP export when blob creation fails', async () => {
    vi.spyOn(FileService, 'exportToWebP').mockRejectedValue(
      new Error('Failed to create WebP blob')
    );
    const record = vi.spyOn(productTelemetry, 'record');
    const dialog = createDialog();
    await dialog.updateComplete;

    const format = dialog.shadowRoot?.querySelector<HTMLSelectElement>('#export-format');
    format!.value = 'webp';
    format!.dispatchEvent(new Event('change'));
    await dialog.updateComplete;

    dialog.shadowRoot?.querySelector<HTMLButtonElement>('.btn-export')?.click();

    await vi.waitFor(() => {
      expect(dialog.shadowRoot?.textContent).toContain('Could not export this file.');
    });
    expect(record).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
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
