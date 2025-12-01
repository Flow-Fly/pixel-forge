import { LitElement } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

/**
 * Base component class for PixelForge.
 * Automatically handles signal subscriptions via SignalWatcher.
 */
export class BaseComponent extends SignalWatcher(LitElement) {
  // Common functionality for all components can be added here
  // e.g., logging, error handling, shared event dispatching
}
