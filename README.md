# PixelForge

PixelForge is a browser-based pixel art and tilemap editor built with Lit, TypeScript, and Vite. It combines sprite drawing, animation, palette management, custom brushes, reference images, and map editing in one app.

## What The App Can Do

### Pixel Art

- Draw with pencil, eraser, fill, gradient, line, rectangle, ellipse, text, eyedropper, hand, and zoom tools
- Use rectangular, lasso, polygonal lasso, and magic wand selections
- Move, transform, cut, copy, paste, flip, and rotate artwork
- Work with layers, opacity, blend modes, and continuous layers

### Animation

- Create multi-frame projects with per-frame durations
- Organize timelines with frame tags
- Use linked cels and continuous layers to reuse content across frames
- Preview playback while you work
- Turn onion skinning on and tune previous/next frame visibility

### Color And Palettes

- Start from built-in palettes including DB32, PICO-8, GameBoy, NES, Endesga 32, and Sweetie 16
- Generate lightness variations from a selected color
- Keep temporary or uncommitted colors separate from the main palette
- Extract colors from the current drawing and add or replace a palette
- Save custom palettes locally

### Brushes And References

- Use built-in brushes or capture custom brushes from a selection
- Edit and persist custom brushes locally
- Control brush size, opacity, spacing, and pixel-perfect drawing behavior
- Import reference images and place them above or below the canvas
- Adjust reference image opacity, position, scale, visibility, and lock state

### Tilemaps And Tilesets

- Switch between Art mode and Map mode
- Configure map dimensions and tile size
- Import a tileset image with tile width, tile height, spacing, and margin controls
- Paint, erase, fill, and select tiles on map layers
- Manage tile layers with rename, reorder, visibility, lock, and delete actions
- Send artwork from the art workflow into a tileset
- Enter hero edit to edit a source tile and propagate changes to every placed instance that uses it

### Import, Save, And Export

- Open PixelForge projects in compressed `.pf` or uncompressed `.json` form
- Import Aseprite files: `.ase` and `.aseprite`
- Open image files as either a new project or a reference image
- Export PixelForge projects, PNGs, WebPs, animated WebPs, sprite sheet PNGs with optional JSON metadata, and `.ase` files
- Autosave the current project to IndexedDB
- Persist custom brushes and settings locally in the browser

## Stack

- Lit
- TypeScript
- Vite
- Vitest
- IndexedDB via `idb`

## Getting Started

### Prerequisites

- Node.js 20+ recommended
- npm

### Install

```bash
npm install
```

### Run The App

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview The Production Build

```bash
npm run preview
```

### Test

```bash
npm test
npm run test:run
npm run test:coverage
```

## Project Layout

- `src/components`: UI components, panels, dialogs, overlays
- `src/stores`: reactive application state
- `src/tools`: drawing, selection, transform, and tilemap tools
- `src/services`: import/export, persistence, rendering, shortcuts
- `tests`: component, tool, and user-story coverage

## Notes

- This is a browser app. Current project data, custom brushes, and some settings are stored locally in the browser.
- The README is based on the current code in this repository and is meant to describe what is implemented today, not a future roadmap.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) if you want to work on the app locally or contribute changes.
