import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const autoSaveServiceMock = vi.hoisted(() => ({
  saveNow: vi.fn(),
}));

vi.mock('../../../src/services/auto-save', () => ({
  autoSaveService: autoSaveServiceMock,
}));

import '../../../src/components/app/pf-pwa-update-toast';
import type { PFPwaUpdateToast } from '../../../src/components/app/pf-pwa-update-toast';
import { pwaStore } from '../../../src/stores/pwa';

async function createToast() {
  const element = document.createElement('pf-pwa-update-toast') as PFPwaUpdateToast;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

async function flushUpdate(element: PFPwaUpdateToast) {
  await Promise.resolve();
  await Promise.resolve();
  await element.updateComplete;
}

describe('pf-pwa-update-toast', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    autoSaveServiceMock.saveNow.mockResolvedValue(undefined);
    pwaStore.stop();
  });

  afterEach(() => {
    document.body.replaceChildren();
    pwaStore.stop();
  });

  it('stays hidden until an update is waiting', async () => {
    const element = await createToast();

    expect(element.shadowRoot?.querySelector('.notice')).toBeNull();

    pwaStore.setUpdateHandler(vi.fn().mockResolvedValue(undefined));
    pwaStore.showUpdate();
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain(
      'Update ready'
    );
  });

  it('lets the user defer the update', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    pwaStore.setUpdateHandler(update);
    pwaStore.showUpdate();
    const element = await createToast();

    element.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click();
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector('.notice')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('saves before restarting into the update', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    pwaStore.setUpdateHandler(update);
    pwaStore.showUpdate();
    const element = await createToast();

    element.shadowRoot?.querySelector<HTMLButtonElement>('.restart')?.click();
    await flushUpdate(element);

    expect(autoSaveServiceMock.saveNow).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(true);
    expect(autoSaveServiceMock.saveNow.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0]
    );
  });

  it('explains a save failure and does not restart', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    autoSaveServiceMock.saveNow.mockRejectedValue(new Error('storage full'));
    pwaStore.setUpdateHandler(update);
    pwaStore.showUpdate();
    const element = await createToast();

    element.shadowRoot?.querySelector<HTMLButtonElement>('.restart')?.click();
    await flushUpdate(element);

    expect(update).not.toHaveBeenCalled();
    expect(element.shadowRoot?.querySelector('.error')?.textContent).toContain(
      'current session stayed open'
    );
  });
});
