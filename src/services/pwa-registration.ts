import { registerSW } from 'virtual:pwa-register';
import { pwaStore } from '../stores/pwa';
import { log } from '../utils/log';

/** Register the offline application shell without activating updates mid-session. */
export function registerPwa() {
  pwaStore.start();
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () => pwaStore.showUpdate(),
    onNeedReload: () => void pwaStore.handleUpdateControlling(),
    onRegisterError: (error) => log.error('PWA registration failed:', error),
  });
  pwaStore.setUpdateHandler(updateServiceWorker);
  return updateServiceWorker;
}
