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
