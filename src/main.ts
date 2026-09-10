import type { PixelForgeApp } from './components/app/pixel-forge-app';
import { SiteToolHost } from './editor/site-tool-host';
import { SiteToolTransport } from './editor/site-tool-transport';
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
  import('./services/keyboard/register-shortcuts').then((m) => m.registerShortcuts());
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

// One browser host owns local consent and the visible Creative Run panel.
const editorApp = document.querySelector<PixelForgeApp>('pixel-forge-app');
const siteToolHost = new SiteToolHost(undefined, (controller) => {
  if (editorApp) editorApp.creativeRunController = controller;
});
if (editorApp) editorApp.siteToolHost = siteToolHost;

let siteTransport = new SiteToolTransport(siteToolHost.facade);
const registerSiteTools = () => {
  const surface = document as Document & { modelContext?: unknown };
  void siteTransport.register(surface.modelContext);
};
// The fallback exposes only the public tools, never browser approval helpers.
Object.defineProperty(window, 'pixelForgeSiteTools', {
  configurable: true,
  get: () => siteTransport.fallback,
});
registerSiteTools();
const suspendSiteTools = () => {
  siteTransport.suspend();
  siteToolHost.endAuthority();
};
const resumeSiteTools = () => {
  if (
    document.visibilityState !== 'visible' ||
    siteTransport.fallback.availability() !== 'suspended'
  )
    return;
  siteTransport = new SiteToolTransport(siteToolHost.facade);
  registerSiteTools();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') suspendSiteTools();
  else resumeSiteTools();
});
document.addEventListener('freeze', suspendSiteTools);
document.addEventListener('resume', resumeSiteTools);
window.addEventListener('pagehide', suspendSiteTools);
window.addEventListener('pageshow', resumeSiteTools);

declare global {
  interface Window {
    readonly pixelForgeSiteTools: SiteToolTransport['fallback'];
  }
}
