import { defineConfig } from 'vite';

function getManualChunk(id: string) {
  const modulePath = id.replace(/\\/g, '/');

  if (modulePath.includes('/node_modules/lit/') || modulePath.includes('/node_modules/@lit-labs/signals/')) {
    return 'vendor-lit';
  }

  if (modulePath.includes('/node_modules/pako/')) {
    return 'vendor-pako';
  }

  if (modulePath.includes('/node_modules/idb/')) {
    return 'vendor-idb';
  }
}

export default defineConfig({
  base: './', // Use relative paths so build works from any location
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      }
    }
  }
});
