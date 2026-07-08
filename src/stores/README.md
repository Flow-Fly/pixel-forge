# Store reactivity convention

Stores hold state in signals (`src/core/signal.ts`, backed by
`@lit-labs/signals`). Signals only notify when **the signal's value is
reassigned** — mutating an object *inside* a signal is invisible to the
reactive graph and is the classic source of "the view didn't update" bugs.

## The rules

1. **Treat everything inside a signal as immutable.** To change an item,
   replace it (and the collection holding it), then reassign the signal:

   ```ts
   // ✅ good — updateLayer in stores/layers.ts
   this.layers.value = this.layers.value.map((l) =>
     l.id === id ? { ...l, ...updates } : l
   );

   // ❌ bad — invisible to signals, the UI will not react
   const layer = this.layers.value.find((l) => l.id === id);
   layer.visible = false;
   ```

2. **Go through the store's update methods** (`layerStore.updateLayer`,
   `animationStore.setFrameDuration`, cel-map clone + `cels.value = cels`,
   …) instead of reaching into a signal's contents from outside the store.
   If the method you need doesn't exist, add it to the store.

3. **Exception — canvases and buffers.** `HTMLCanvasElement`s and
   `Uint8Array` index buffers inside layers/cels are *bitmaps, not state*:
   they are mutated in place by design (drawing would be unusably slow
   otherwise). Their invalidation is explicit and separate:
   - mark changed pixels via `dirtyRectStore.markDirty(...)`,
   - re-render via `renderScheduler` / `historyStore.version` (bumped on
     every execute/undo/redo).

   If you mutate a bitmap outside a tool/command flow, you are responsible
   for triggering that invalidation yourself.

4. **Don't add new "version counter" signals.** `historyStore.version` is
   the one sanctioned invalidation channel for bitmap changes. If you feel
   the need for another manual poke-the-UI counter, the state you're
   poking about should probably live in a real signal instead.

## Why not deep-freeze / a state library?

The store graph predates this document; the codebase converged on
"immutable at the collection level, mutable bitmaps with explicit
invalidation" and that hybrid is fine — what causes bugs is *mixing the
styles for the same data*. These rules just make the existing pattern
explicit so new code (and refactors like #63/#71) stay consistent.

## ProjectContext ownership map

This checkout does not have `src/stores/index.ts`; use the real store files
below as the ProjectContext migration map.

### Per-project stores

These stores describe one open project, its canvas view, or session state that
must not leak between two open projects:

- `project.ts` - project identity, size, name, load/save/new-project flow.
- `layers.ts` - layer list, active layer, grouping, text/reference layers.
- `animation/` - frames, cels, playback state, tags, cel selection.
- `palette/` - project palette, custom palette state, used-color indicators.
- `selection/` - current selection/floating/transform state.
- `history.ts` - undo/redo stacks and the bitmap invalidation version.
- `history-highlight.ts` - command hover/expanded highlight state.
- `viewport.ts` - zoom, pan, viewport dimensions, cursor position.
- `dirty-rect.ts` - pending redraw and stroke dirty regions.
- `guides.ts` - ruler guides and mirror drawing state.
- `colors.ts` - active colors and palette-derived lightness variations.
- `grid.ts` - pixel/tile grid overlay settings for the current canvas.

Simple per-project stores now export factory functions next to their singleton
exports so later ProjectContext slices can compose fresh instances without
breaking existing imports such as `layerStore`, `paletteStore`, and
`animationStore`.

## ProjectContext shell

`project-context.ts` introduces the first composition root for per-project
state. `ProjectContext` constructs these per-project stores:

- `animation`
- `colors`
- `dirtyRect`
- `grid`
- `guides`
- `history`
- `historyHighlight`
- `layers`
- `palette`
- `project`
- `selection`
- `viewport`

The old singleton exports (`projectStore`, `layerStore`, `animationStore`,
and so on) are compatibility aliases for `defaultProjectContext`. This keeps
the current one-project app behavior while making the default stores come from
the same composition path as future project contexts.

`activeProjectContext` is the workspace-level signal for the currently selected
project context. It starts at `defaultProjectContext`, and the explicit
`getActiveProjectContext()`, `setActiveProjectContext()`, and
`restoreDefaultProjectContext()` helpers keep tests and later workspace code
from assigning the signal in scattered places.

Until later #114 slices move panels and components to `activeProjectContext`,
these compatibility paths intentionally stay on `defaultProjectContext`:

- direct store aliases in `project.ts`, `layers.ts`, `history.ts`,
  `history-highlight.ts`, `dirty-rect.ts`, `grid.ts`, `guides.ts`,
  `colors.ts`, and `viewport.ts`.
- barrel exports in `animation/index.ts`, `palette/index.ts`, and
  `selection/index.ts`.
- `selection/selected-layer.ts`, which still reads the default layer and
  selection stores together.
- `store-refs.ts` default helpers, which keep older singleton consumers wired
  while ProjectContext-created stores use context-local refs.

Components and panels should keep using the default singleton exports until a
dedicated rebind slice moves them.

### App-global stores

These stores belong to the editor session, user, or shell rather than one
project:

- `settings.ts` - app theme and checkerboard preferences.
- `tools.ts` - active tool and brush-editing override mode.
- `tool-settings.ts` - shared tool size and option values.
- `tool-groups.ts` - toolbar grouping preferences.
- `brush.ts` - user brush library and active brush.
- `panels.ts` - shell panel collapsed state.
- `clipboard.ts` - cross-project copy/paste buffer.
- `user.ts` - current user identity.

### Current migration seams

- `store-refs.ts` still exports default compatibility helpers for older imports.
  ProjectContext-created stores use context-local refs.
- `ProjectContext` starts palette sync for its animation store and exposes
  `dispose()` so future non-default contexts can stop those listeners when they
  are no longer needed.
