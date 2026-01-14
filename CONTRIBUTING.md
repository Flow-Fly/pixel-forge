# Contributing to PixelForge

Thanks for your interest in contributing! This guide covers everything you need to know to work on the codebase.

## Tech Stack

- **Framework**: [Lit](https://lit.dev/) 3.x — Fast, lightweight web components
- **Language**: [TypeScript](https://www.typescriptlang.org/) 5.x (strict mode)
- **Build Tool**: [Vite](https://vite.dev/) 7.x
- **State Management**: `@lit-labs/signals` with custom singleton stores
- **Persistence**: IndexedDB via `idb`
- **Compression**: `pako` for project file compression
- **Testing**: Vitest with happy-dom

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/Flow-Fly/pixel-forge.git
cd pixel-forge

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # TypeScript check + Vite build to dist/
npm test             # Run Vitest in watch mode
npm run test:run     # Run tests once
npm run test:ui      # Vitest with UI
```

Tests are in `tests/` and use happy-dom environment.
A lot of tests still need to be written!

---

## Architecture

### Project Structure

```
src/
├── commands/       # Undo/redo command implementations
├── components/     # Lit web components (pf-* prefix)
├── core/           # Base component class, signal wrapper
├── data/           # Static data (preset palettes, fonts)
├── services/       # Business logic (file I/O, shortcuts, export)
├── stores/         # Signal-based state management
├── styles/         # CSS reset and design tokens
├── tools/          # Drawing tool implementations
├── types/          # TypeScript interfaces
└── utils/          # Helper functions and algorithms
```

### Component Pattern

All components extend `BaseComponent` which wraps `SignalWatcher(LitElement)`:

```typescript
import { BaseComponent } from "../core/base-component";
import { customElement } from "lit/decorators.js";

@customElement("pf-my-component")
export class PfMyComponent extends BaseComponent {
  // Automatically tracks signal subscriptions
}
```

### State Management

Singleton stores with signals live in `src/stores/`. Each store exports a singleton instance:

```typescript
import { layerStore } from "../stores/layers";

// Read signal value
const layers = layerStore.layers.value;

// Mutate through store methods
layerStore.addLayer();
```

**Core Stores:**

- `projectStore` — Canvas dimensions, project metadata
- `layerStore` — Layer management, visibility, blend modes
- `animationStore` — Frames, cels, tags, playback
- `toolStore` — Active tool, tool settings
- `colorStore` — Primary/secondary colors, lightness variations
- `paletteStore` — Palette management, tracked/ephemeral colors
- `brushStore` — Brush settings, custom brushes
- `selectionStore` — Selection state, floating selections
- `historyStore` — Undo/redo command stack

### Tool System

Tools extend `BaseTool` in `src/tools/base-tool.ts`:

```typescript
export abstract class BaseTool {
  abstract name: string;
  abstract cursor: string;
  abstract onDown(x: number, y: number, modifiers?: ModifierKeys): void;
  abstract onDrag(x: number, y: number, modifiers?: ModifierKeys): void;
  abstract onUp(x: number, y: number, modifiers?: ModifierKeys): void;
  protected markDirty(
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void;
}
```

Tools are dynamically loaded via `src/tools/tool-loader.ts` with metadata in `src/tools/tool-registry.ts`.

### Command Pattern (Undo/Redo)

All undoable operations go through the history store:

```typescript
import { historyStore } from "../stores/history";
import { DrawCommand } from "../commands/drawing-commands";

const command = new DrawCommand(layerId, beforeData, afterData);
historyStore.execute(command);
```

### Data Flow

```
User Input → Component → Tool → Canvas → Store Update → Signal → Re-render
                                    ↓
                            History Command
```

### Layers & Cels

- **Layer**: Drawing surface with visibility, opacity, lock, blend mode
- **Frame**: Point in time in animation
- **Cel**: Intersection of layer and frame (contains actual pixel data as canvas)

```
animationStore.frames[].cels[] → { layerId, canvas }
```

---

## Naming Conventions

| Type       | Convention                           | Example                         |
| ---------- | ------------------------------------ | ------------------------------- |
| Components | `pf-*` prefix, kebab-case            | `pf-layers-panel`               |
| Stores     | camelCase singleton exports          | `layerStore`                    |
| Types      | PascalCase interfaces                | `Layer`, `Frame`, `Cel`         |
| Commands   | PascalCase with Command suffix       | `DrawCommand`                   |
| Tools      | kebab-case files, PascalCase classes | `pencil-tool.ts` → `PencilTool` |

---

## Adding New Features

### New Tool

1. Create `src/tools/my-tool.ts` extending `BaseTool`
2. Add loader entry in `src/tools/tool-loader.ts`
3. Add metadata in `src/tools/tool-registry.ts`
4. Add button in `src/components/toolbar/pf-toolbar.ts`

### New Store

1. Create `src/stores/my-store.ts` with signal-based state
2. Export singleton instance
3. Import in components that need it

### New Component

1. Create in appropriate `src/components/*/` subdirectory
2. Extend `BaseComponent`
3. Use `@customElement('pf-name')` decorator

---

## CSS Design Tokens

Use CSS custom properties from `src/styles/tokens.css`:

```css
/* Colors */
--color-bg-primary
--color-bg-secondary
--color-accent
--color-text-primary

/* Spacing */
--spacing-xs    /* 4px */
--spacing-sm    /* 8px */
--spacing-md    /* 16px */
--spacing-lg    /* 24px */

/* Borders */
--border-radius
--border-color
```

---

## Performance Considerations

PixelForge uses several optimizations to stay smooth:

- **Dirty Rectangle Tracking** — Only redraws changed portions of the canvas
- **Index Buffers** — Uint8Array palette indices instead of full RGBA per pixel
- **Packed Pixels** — Uint32Array view for efficient pixel manipulation in algorithms
- **requestAnimationFrame Throttling** — Coalesces rapid updates
- **Cached Empty Cels** — Singleton transparent canvas for memory efficiency

When adding features, keep these in mind to avoid performance regressions.

---

## UX Documentation

Detailed UX specifications live in `ux/`:

- `testing-UX-roadmap.md` — Full feature status and test cases
- `tools/drawing-tool-ux.md` — Pencil, eraser, eyedropper, fill, gradient specs
- `tools/selection-tool-ux.md` — Selection tools and operations

---

## Questions?

Open an issue or start a discussion. We're happy to help!
