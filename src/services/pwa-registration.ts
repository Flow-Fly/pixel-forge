import { registerSW } from 'virtual:pwa-register';

/** Register the offline application shell without activating updates mid-session. */
export function registerPwa() {
  return registerSW({ immediate: true });
}
