import { registerSW } from 'virtual:pwa-register';
import { pwaStore } from '../stores/pwa';

/** Register the offline application shell without activating updates mid-session. */
export function registerPwa() {
  pwaStore.start();
  return registerSW({ immediate: true });
}
