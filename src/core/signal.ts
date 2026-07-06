import { Signal, signal as createSignal } from '@lit-labs/signals';

/**
 * Enhanced signal interface that includes a .value accessor
 */
export interface WritableSignal<T> extends Signal.State<T> {
  value: T;
}

/**
 * Creates a signal with a .value property for getting/setting.
 * This wraps the @lit-labs/signals implementation to provide a consistent interface.
 */
export function signal<T>(initialValue: T): WritableSignal<T> {
  const s = createSignal(initialValue);
  
  Object.defineProperty(s, 'value', {
    get() { return s.get(); },
    set(v: T) { s.set(v); }
  });
  
  return s as WritableSignal<T>;
}

/**
 * Computed signal derived from other signals.
 * Note: @lit-labs/signals 'computed' is currently imported from the same package
 */
export { computed, SignalWatcher, watch } from '@lit-labs/signals';

/**
 * Run `fn` now and re-run it (batched on a microtask) whenever any signal it
 * reads changes. Returns a dispose function.
 *
 * This is the standard TC39 signal-polyfill effect pattern, for use in
 * services that need to react to store changes outside of a Lit component
 * (components should keep using SignalWatcher).
 */
export function effect(fn: () => void): () => void {
  let needsEnqueue = true;

  const watcher = new Signal.subtle.Watcher(() => {
    if (needsEnqueue) {
      needsEnqueue = false;
      queueMicrotask(processPending);
    }
  });

  const computedSignal = new Signal.Computed(() => {
    fn();
  });

  function processPending() {
    needsEnqueue = true;
    for (const s of watcher.getPending()) {
      s.get();
    }
    watcher.watch();
  }

  watcher.watch(computedSignal);
  computedSignal.get();

  return () => {
    watcher.unwatch(computedSignal);
  };
}
