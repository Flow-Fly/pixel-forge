import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.png'],
      manifest: {
        id: './',
        name: 'Pixel Forge',
        short_name: 'Pixel Forge',
        description: 'A local-first pixel art editor.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0d1015',
        theme_color: '#0d1015',
        file_handlers: [
          {
            action: './',
            accept: {
              'application/x-pixelforge': ['.pf'],
              'application/x-aseprite': ['.ase', '.aseprite'],
            },
            launch_type: 'single-client',
          },
        ],
        launch_handler: {
          client_mode: 'focus-existing',
        },
        icons: [
          {
            src: 'icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        runtimeCaching: [
          {
            // F2 sync traffic must always reach the server instead of a stale cache.
            urlPattern: /\/api(?:\/|$)/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      }
    }
  }
});
