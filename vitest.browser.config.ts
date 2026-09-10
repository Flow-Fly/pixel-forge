import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import appConfig from './vite.config';

export default mergeConfig(
  appConfig,
  defineConfig({
    optimizeDeps: { include: ['@lit-labs/signals', '@sentry/browser', 'idb', 'pako', 'uuid'] },
    test: {
      include: ['tests/browser/**/*.test.ts'],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
      },
    },
  })
);
