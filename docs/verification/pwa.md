# PWA verification

Use a Chromium browser for the install and service-worker checks. The development server does not register the production service worker, so build and preview the app first.

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

## Install

1. Open the preview URL and wait for the application to finish loading.
2. Open **File** and choose **Install Pixel Forge**.
3. Accept the browser-owned install prompt.
4. Confirm Pixel Forge opens in its own standalone window.
5. Reopen **File** and confirm the install action is gone.

The menu action is intentionally absent when the browser does not expose an install prompt.

## Offline editing

1. Load the preview once while online and wait for the service worker to become active in DevTools **Application → Service Workers**.
2. In DevTools **Network**, select **Offline**, then reload.
3. Confirm the editor shell loads without the network.
4. Draw a visible change and wait for auto-save.
5. Reload again while still offline.
6. Confirm the saved project and drawing return from IndexedDB.

## User-confirmed update

1. Keep the installed or previewed app open as version A.
2. Make a visible local copy change, then run `npm run build` again to create version B while the preview server stays open.
3. In DevTools **Application → Service Workers**, choose **Update** for the active registration.
4. Confirm the non-modal **Update ready** notice appears and the editor does not reload on its own.
5. Choose **Later** and confirm the current session continues unchanged.
6. Ask the service worker to update again, then choose **Restart**.
7. Confirm the current project is saved before the waiting worker activates and version B loads.

To exercise the save-failure path, temporarily make IndexedDB unavailable before choosing **Restart**. Pixel Forge should remain open and explain that the current session stayed open.
