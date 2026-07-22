# PWA verification

Use a Chromium browser for the install and service-worker checks. The development server does not register the production service worker, so build and preview the app first.

```sh
npm run pwa:preview
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

## Project file handling

File associations are refreshed when the PWA is installed. After changing the manifest, uninstall Pixel Forge, run `npm run pwa:preview`, and install it again before testing.

1. In Finder, use **Open With → Pixel Forge** for a `.pf` project.
2. Repeat with `.ase` and `.aseprite` files.
3. Keep Pixel Forge open and use **Open With → Pixel Forge** again. Confirm the existing app window is focused and each project opens in a new internal tab.
4. Select multiple supported files in Finder and open them together. Confirm their tab order matches the selection order.
5. Fill all eight project tabs, then open one more valid project file. Confirm Pixel Forge explains that the import was saved to **Project Library** without replacing the active drawing.
6. Drag `.pf`, `.json`, `.ase`, and `.aseprite` files onto the app. Confirm they use the same new-project behavior and feedback.
7. Drop an unsupported file by itself. Confirm Pixel Forge leaves the browser's normal behavior alone.
8. Deny the browser-owned file-handling permission when prompted, then confirm the open project remains unchanged.
9. Open Pixel Forge in Firefox or Safari and confirm the editor starts normally. File-menu import and drag-and-drop should still work; operating-system association is unavailable there.

Pixel Forge reads only the files supplied for the current launch. It does not retain file handles, request write permission, or save changes back to the source file.
