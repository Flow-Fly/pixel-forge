import './sentry';
import './styles/reset.css';
import './styles/tokens.css';
import './components/app/pixel-forge-app';
// Keyboard shortcuts are now lazy loaded to reduce initial bundle size
// import { registerShortcuts } from './services/keyboard/register-shortcuts';
import { brushStore } from './stores/brush';
import './stores/settings'; // Initialize settings (applies saved accent color)
import { autoSaveService } from './services/auto-save';

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

// Persist the project on history changes / window blur
autoSaveService.start();

