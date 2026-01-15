import { signal } from '../core/signal';

export class RootStore {
  // Example global state
  theme = signal<'dark' | 'light'>('dark');

  constructor() {
    // Initialize stores
  }
}

export const rootStore = new RootStore();

// Mode store for art/map mode switching
export { modeStore } from './mode';
