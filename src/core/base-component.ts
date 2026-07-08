import { LitElement } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { activeProjectContext, type ProjectContext } from '../stores/project-context';
import { effect } from './signal';

export type ActiveProjectContextCleanup = () => void;
export type ActiveProjectContextSubscription = (
  context: ProjectContext
) => ActiveProjectContextCleanup | void;

/**
 * Base component class for PixelForge.
 * Automatically handles signal subscriptions via SignalWatcher.
 */
export class BaseComponent extends SignalWatcher(LitElement) {
  private activeProjectContextDisposers = new Set<ActiveProjectContextCleanup>();

  disconnectedCallback() {
    super.disconnectedCallback();
    this.disposeActiveProjectContextSubscriptions();
  }

  protected subscribeToActiveProjectContext(
    subscribe: ActiveProjectContextSubscription
  ): ActiveProjectContextCleanup {
    let isDisposed = false;
    let cleanupContextSubscription: ActiveProjectContextCleanup | undefined;

    const cleanupCurrentContext = () => {
      cleanupContextSubscription?.();
      cleanupContextSubscription = undefined;
    };

    const stopWatching = effect(() => {
      if (isDisposed) return;

      const context = activeProjectContext.value;
      cleanupCurrentContext();
      cleanupContextSubscription = subscribe(context) ?? undefined;
    });

    const dispose = () => {
      if (isDisposed) return;

      isDisposed = true;
      this.activeProjectContextDisposers.delete(dispose);
      stopWatching();
      cleanupCurrentContext();
    };

    this.activeProjectContextDisposers.add(dispose);
    return dispose;
  }

  private disposeActiveProjectContextSubscriptions() {
    for (const dispose of [...this.activeProjectContextDisposers]) {
      dispose();
    }
  }
}
