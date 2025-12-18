import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Use relative paths so build works from any location
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-lit': ['lit', '@lit-labs/signals'],
          'vendor-pako': ['pako'],
          'vendor-idb': ['idb'],
        }
      }
    }
  }
});
