import './styles/reset.css';
import './styles/tokens.css';
import './components/app/pixel-forge-app';
import { registerShortcuts } from './services/keyboard/register-shortcuts';
import { brushStore } from './stores/brush';

registerShortcuts();

// Initialize brush store (load custom brushes from IndexedDB)
brushStore.initialize();


