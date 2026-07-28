import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const autoSaveServiceMock = vi.hoisted(() => ({
  saveNow: vi.fn(),
  saveUntilClean: vi.fn(),
  isDirty: vi.fn(),
}));

const workspaceStoreMock = vi.hoisted(() => ({
  items: { value: [] as Array<{ context: ProjectContext }> },
}));

vi.mock('../../../src/services/auto-save', () => ({
  autoSaveService: autoSaveServiceMock,
}));

vi.mock('../../../src/stores/workspace', () => ({
  workspaceStore: workspaceStoreMock,
}));

import '../../../src/components/app/pf-pwa-update-toast';
import type { PFPwaUpdateToast } from '../../../src/components/app/pf-pwa-update-toast';
import { pwaStore } from '../../../src/stores/pwa';
import {
  createProjectContext,
  defaultProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';

const createdContexts: ProjectContext[] = [];

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
    autoSaveServiceMock.saveUntilClean.mockResolvedValue(undefined);
    autoSaveServiceMock.isDirty.mockReturnValue(false);
    workspaceStoreMock.items.value = [{ context: defaultProjectContext }];
    pwaStore.stop();
  });

  afterEach(() => {
    document.body.replaceChildren();
    pwaStore.stop();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
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

    expect(autoSaveServiceMock.saveUntilClean).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(false);
    expect(autoSaveServiceMock.saveUntilClean.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0]
    );
  });

  it('saves every open project before restart, including inactive projects', async () => {
    const contextA = createProjectContext();
    const contextB = createProjectContext();
    createdContexts.push(contextA, contextB);
    setActiveProjectContext(contextB);
    workspaceStoreMock.items.value = [{ context: contextA }, { context: contextB }];
    const update = vi.fn().mockResolvedValue(undefined);
    pwaStore.setUpdateHandler(update);
    pwaStore.showUpdate();
    const element = await createToast();

    element.shadowRoot?.querySelector<HTMLButtonElement>('.restart')?.click();
    setActiveProjectContext(contextA);
    await flushUpdate(element);

    expect(autoSaveServiceMock.saveUntilClean).toHaveBeenCalledTimes(2);
    expect(autoSaveServiceMock.saveUntilClean).toHaveBeenCalledWith(contextA);
    expect(autoSaveServiceMock.saveUntilClean).toHaveBeenCalledWith(contextB);
    expect(update).toHaveBeenCalledWith(false);
  });

  it('rechecks every open project when one becomes dirty while another is saving', async () => {
    const contextA = createProjectContext();
    const contextB = createProjectContext();
    createdContexts.push(contextA, contextB);
    workspaceStoreMock.items.value = [{ context: contextA }, { context: contextB }];
    autoSaveServiceMock.isDirty
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);
    const update = vi.fn().mockResolvedValue(undefined);
    pwaStore.setUpdateHandler(update);
    pwaStore.showUpdate();
    const element = await createToast();

    element.shadowRoot?.querySelector<HTMLButtonElement>('.restart')?.click();
    await flushUpdate(element);

    expect(autoSaveServiceMock.saveUntilClean).toHaveBeenCalledTimes(4);
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith(false));
  });

  it('saves a project opened and dirtied while the first save is in flight', async () => {
    const contextA = createProjectContext();
    const contextB = createProjectContext();
    createdContexts.push(contextA, contextB);
    workspaceStoreMock.items.value = [{ context: contextA }];
    let finishFirstSave!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      finishFirstSave = resolve;
    });
    let savedContextB = false;
    autoSaveServiceMock.saveUntilClean.mockImplementation(async (context) => {
      if (context === contextA && !savedContextB) {
        await firstSave;
      }
      if (context === contextB) {
        savedContextB = true;
      }
    });
    autoSaveServiceMock.isDirty.mockImplementation(
      (context) => context === contextB && !savedContextB
    );
    const update = vi.fn().mockResolvedValue(undefined);
    pwaStore.setUpdateHandler(update);
    pwaStore.showUpdate();
    const element = await createToast();

    element.shadowRoot?.querySelector<HTMLButtonElement>('.restart')?.click();
    await vi.waitFor(() => {
      expect(autoSaveServiceMock.saveUntilClean).toHaveBeenCalledWith(contextA);
    });
    workspaceStoreMock.items.value = [{ context: contextA }, { context: contextB }];
    finishFirstSave();

    await vi.waitFor(() => expect(update).toHaveBeenCalledWith(false));
    expect(autoSaveServiceMock.saveUntilClean).toHaveBeenCalledWith(contextB);
  });

  it('keeps the session open when an inactive project cannot be saved', async () => {
    const activeContext = createProjectContext();
    const inactiveContext = createProjectContext();
    createdContexts.push(activeContext, inactiveContext);
    setActiveProjectContext(activeContext);
    workspaceStoreMock.items.value = [
      { context: activeContext },
      { context: inactiveContext },
    ];
    autoSaveServiceMock.saveUntilClean.mockImplementation(async (context) => {
      if (context === inactiveContext) throw new Error('storage full');
    });
    const update = vi.fn().mockResolvedValue(undefined);
    pwaStore.setUpdateHandler(update);
    pwaStore.showUpdate();
    const element = await createToast();

    element.shadowRoot?.querySelector<HTMLButtonElement>('.restart')?.click();
    await flushUpdate(element);

    expect(autoSaveServiceMock.saveUntilClean).toHaveBeenCalledWith(inactiveContext);
    expect(update).not.toHaveBeenCalled();
    expect(element.shadowRoot?.querySelector('.error')?.textContent).toContain(
      'current session stayed open'
    );
  });

  it('explains a save failure and does not restart', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    autoSaveServiceMock.saveUntilClean.mockRejectedValue(new Error('storage full'));
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
