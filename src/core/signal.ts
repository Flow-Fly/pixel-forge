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
