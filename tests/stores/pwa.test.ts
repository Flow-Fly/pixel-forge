import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaStore, type BeforeInstallPromptEvent } from '../../src/stores/pwa';

function createInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  return { event, prompt };
}

describe('PwaStore install prompt', () => {
  let store: PwaStore;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    store = new PwaStore();
    store.start();
  });

  afterEach(() => {
    store.stop();
    vi.unstubAllGlobals();
  });

  it('only offers installation after the browser provides a prompt', () => {
    const { event } = createInstallPrompt();

    expect(store.installAvailable.value).toBe(false);
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.installAvailable.value).toBe(true);
  });

  it('uses a captured prompt once and then hides the action', async () => {
    const { event, prompt } = createInstallPrompt();
    window.dispatchEvent(event);

    await store.promptInstall();

    expect(prompt).toHaveBeenCalledOnce();
    expect(store.installAvailable.value).toBe(false);
    await store.promptInstall();
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('hides the action when installation completes', () => {
    window.dispatchEvent(createInstallPrompt().event);

    window.dispatchEvent(new Event('appinstalled'));

    expect(store.installAvailable.value).toBe(false);
  });

  it('does not offer installation while already running standalone', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);

    window.dispatchEvent(createInstallPrompt().event);

    expect(store.installAvailable.value).toBe(false);
  });
});

describe('PwaStore update flow', () => {
  let store: PwaStore;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn();
    store = new PwaStore(reload);
  });

  afterEach(() => {
    store.stop();
  });

  it('waits for the user and saves before applying an update', async () => {
    const calls: string[] = [];
    const save = vi.fn(async () => {
      calls.push('save');
    });
    const update = vi.fn(async () => {
      calls.push('update');
    });
    store.setUpdateHandler(update);
    store.showUpdate();

    expect(store.updateAvailable.value).toBe(true);
    expect(await store.restartWithUpdate(save)).toBe(true);

    expect(calls).toEqual(['save', 'update']);
    expect(update).toHaveBeenCalledWith(false);
    expect(reload).not.toHaveBeenCalled();
    expect(store.applyingUpdate.value).toBe(true);

    await store.handleUpdateControlling();

    expect(calls).toEqual(['save', 'update', 'save']);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('waits for the final save when control changes during the initial save', async () => {
    let finishInitialSave!: () => void;
    let finishFinalSave!: () => void;
    const initialSave = new Promise<void>((resolve) => {
      finishInitialSave = resolve;
    });
    const finalSave = new Promise<void>((resolve) => {
      finishFinalSave = resolve;
    });
    const save = vi.fn()
      .mockReturnValueOnce(initialSave)
      .mockReturnValueOnce(finalSave);
    const update = vi.fn().mockResolvedValue(undefined);
    store.setUpdateHandler(update);
    store.showUpdate();

    const restart = store.restartWithUpdate(save);
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    const controlling = store.handleUpdateControlling();

    finishInitialSave();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(reload).not.toHaveBeenCalled();

    finishFinalSave();
    await expect(controlling).resolves.toBe(true);
    await expect(restart).resolves.toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps the updated session open and retryable when the final save fails', async () => {
    const save = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage full'))
      .mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(undefined);
    store.setUpdateHandler(update);
    store.showUpdate();

    expect(await store.restartWithUpdate(save)).toBe(true);
    await store.handleUpdateControlling();

    expect(reload).not.toHaveBeenCalled();
    expect(store.updateAvailable.value).toBe(true);
    expect(store.applyingUpdate.value).toBe(false);
    expect(store.updateError.value).toContain('could not save');

    expect(await store.restartWithUpdate(save)).toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('dismisses the notice without applying the update', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    store.setUpdateHandler(update);
    store.showUpdate();

    store.dismissUpdate();

    expect(store.updateAvailable.value).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the session open when saving fails', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    store.setUpdateHandler(update);
    store.showUpdate();

    const result = await store.restartWithUpdate(() => Promise.reject(new Error('storage full')));

    expect(result).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(store.updateAvailable.value).toBe(true);
    expect(store.updateError.value).toContain('could not save');
  });
});
