import './sentry';
import './styles/reset.css';
import './styles/tokens.css';
import './components/app/pixel-forge-app';
// Keyboard shortcuts are now lazy loaded to reduce initial bundle size
// import { registerShortcuts } from './services/keyboard/register-shortcuts';
import { brushStore } from './stores/brush';
import './stores/settings'; // Initialize settings (applies saved accent color)
import { workspaceStore } from './stores/workspace';
import { autoSaveService } from './services/auto-save';
import { registerPwa } from './services/pwa-registration';

// Defer keyboard shortcuts registration after initial render for faster startup.
const deferShortcuts = () => {
  import('./services/keyboard/register-shortcuts').then(m => m.registerShortcuts());
};

if ('requestIdleCallback' in window) {
  requestIdleCallback(deferShortcuts, { timeout: 1000 });
} else {
  requestAnimationFrame(deferShortcuts);
}

// Initialize brush store (load custom brushes from IndexedDB)
brushStore.initialize();

// Initialize workspace store with the default project context.
workspaceStore.activate(workspaceStore.activeItemId.value);

// Persist the project on history changes / window blur
autoSaveService.start();

// Register after the editor has started. Updates remain waiting until the user
// explicitly chooses to restart.
registerPwa();
