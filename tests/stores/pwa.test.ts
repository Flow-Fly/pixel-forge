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
