# Selection System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a complete selection system with marquee rectangle tool, floating selections, move/drag capability, and undo/redo integration.

**Architecture:** State machine in selectionStore (none → selecting → selected → floating), dedicated selection overlay component, CutToFloat and CommitFloat commands for history.

**Tech Stack:** TypeScript, Lit signals, existing command pattern

---

## Task 1: Update Selection Types

**Files:**
- Modify: `src/types/selection.ts`

**Step 1: Replace the selection types with new state machine types**

Replace the entire file:

```typescript
import { type Rect } from './geometry';

export type SelectionShape = 'rectangle' | 'ellipse' | 'freeform';

export type SelectionState =
  | { type: 'none' }
  | {
      type: 'selecting';
      shape: SelectionShape;
      startPoint: { x: number; y: number };
      currentBounds: Rect;
    }
  | {
      type: 'selected';
      shape: 'rectangle' | 'ellipse';
      bounds: Rect;
    }
  | {
      type: 'selected';
      shape: 'freeform';
      bounds: Rect;
      mask: Uint8Array;
    }
  | {
      type: 'floating';
      imageData: ImageData;
      originalBounds: Rect;
      currentOffset: { x: number; y: number };
      shape: SelectionShape;
      mask?: Uint8Array;
    };

// Helper type guards
export function isSelected(state: SelectionState): state is SelectionState & { type: 'selected' } {
  return state.type === 'selected';
}

export function isFloating(state: SelectionState): state is SelectionState & { type: 'floating' } {
  return state.type === 'floating';
}

export function hasSelection(state: SelectionState): boolean {
  return state.type === 'selected' || state.type === 'floating' || state.type === 'selecting';
}
```

**Step 2: Verify file**

Run: `head -30 src/types/selection.ts`

---

## Task 2: Rewrite Selection Store

**Files:**
- Modify: `src/stores/selection.ts`

**Step 1: Replace with full state machine implementation**

```typescript
import { signal } from '../core/signal';
import { type SelectionState, type SelectionShape, isFloating, isSelected } from '../types/selection';
import { type Rect } from '../types/geometry';

class SelectionStore {
  state = signal<SelectionState>({ type: 'none' });

  // Track the layer we're operating on
  private activeLayerId: string | null = null;

  // Convenience getters
  get isActive(): boolean {
    return this.state.value.type !== 'none';
  }

  get isFloating(): boolean {
    return this.state.value.type === 'floating';
  }

  get isSelecting(): boolean {
    return this.state.value.type === 'selecting';
  }

  get bounds(): Rect | null {
    const s = this.state.value;
    if (s.type === 'none') return null;
    if (s.type === 'selecting') return s.currentBounds;
    if (s.type === 'selected') return s.bounds;
    if (s.type === 'floating') {
      return {
        x: s.originalBounds.x + s.currentOffset.x,
        y: s.originalBounds.y + s.currentOffset.y,
        width: s.originalBounds.width,
        height: s.originalBounds.height,
      };
    }
    return null;
  }

  // ============================================
  // Creating selections
  // ============================================

  startSelection(shape: SelectionShape, point: { x: number; y: number }) {
    this.state.value = {
      type: 'selecting',
      shape,
      startPoint: point,
      currentBounds: { x: point.x, y: point.y, width: 1, height: 1 },
    };
  }

  updateSelection(currentPoint: { x: number; y: number }, modifiers?: { shift?: boolean }) {
    const s = this.state.value;
    if (s.type !== 'selecting') return;

    let width = Math.abs(currentPoint.x - s.startPoint.x) + 1;
    let height = Math.abs(currentPoint.y - s.startPoint.y) + 1;
    const x = Math.min(s.startPoint.x, currentPoint.x);
    const y = Math.min(s.startPoint.y, currentPoint.y);

    // Shift = square aspect ratio
    if (modifiers?.shift) {
      const size = Math.max(width, height);
      width = size;
      height = size;
    }

    this.state.value = {
      ...s,
      currentBounds: { x, y, width, height },
    };
  }

  finalizeSelection() {
    const s = this.state.value;
    if (s.type !== 'selecting') return;

    // Don't create selection if too small
    if (s.currentBounds.width < 2 && s.currentBounds.height < 2) {
      this.clear();
      return;
    }

    if (s.shape === 'freeform') {
      // Freeform would need mask - not implemented yet
      this.clear();
      return;
    }

    this.state.value = {
      type: 'selected',
      shape: s.shape as 'rectangle' | 'ellipse',
      bounds: s.currentBounds,
    };
  }

  // ============================================
  // Floating operations
  // ============================================

  /**
   * Called by CutToFloatCommand.execute()
   * Transitions from 'selected' to 'floating' with the cut pixels
   */
  setFloating(imageData: ImageData, originalBounds: Rect, shape: SelectionShape, mask?: Uint8Array) {
    this.state.value = {
      type: 'floating',
      imageData,
      originalBounds,
      currentOffset: { x: 0, y: 0 },
      shape,
      mask,
    };
  }

  /**
   * Called by CutToFloatCommand.undo()
   * Transitions from 'floating' back to 'selected'
   */
  setSelected(bounds: Rect, shape: SelectionShape, mask?: Uint8Array) {
    if (shape === 'freeform' && mask) {
      this.state.value = {
        type: 'selected',
        shape: 'freeform',
        bounds,
        mask,
      };
    } else {
      this.state.value = {
        type: 'selected',
        shape: shape as 'rectangle' | 'ellipse',
        bounds,
      };
    }
  }

  moveFloat(dx: number, dy: number) {
    const s = this.state.value;
    if (s.type !== 'floating') return;

    this.state.value = {
      ...s,
      currentOffset: {
        x: s.currentOffset.x + dx,
        y: s.currentOffset.y + dy,
      },
    };
  }

  /**
   * Called by CommitFloatCommand - just clears state
   * The command handles the actual pixel operations
   */
  clearAfterCommit() {
    this.state.value = { type: 'none' };
  }

  /**
   * Cancel floating selection (triggers undo externally)
   */
  cancelFloat() {
    // This is handled by historyStore.undo() externally
    // Just a placeholder for documentation
  }

  // ============================================
  // Utilities
  // ============================================

  clear() {
    this.state.value = { type: 'none' };
  }

  isPointInSelection(x: number, y: number): boolean {
    const s = this.state.value;

    if (s.type === 'selected') {
      return this.isPointInBounds(x, y, s.bounds, s.shape);
    }

    if (s.type === 'floating') {
      const floatBounds = {
        x: s.originalBounds.x + s.currentOffset.x,
        y: s.originalBounds.y + s.currentOffset.y,
        width: s.originalBounds.width,
        height: s.originalBounds.height,
      };
      return this.isPointInBounds(x, y, floatBounds, s.shape);
    }

    return false;
  }

  private isPointInBounds(x: number, y: number, bounds: Rect, shape: SelectionShape): boolean {
    const { x: bx, y: by, width: bw, height: bh } = bounds;

    if (x < bx || x >= bx + bw || y < by || y >= by + bh) {
      return false;
    }

    if (shape === 'rectangle') {
      return true;
    }

    if (shape === 'ellipse') {
      // Point in ellipse test
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const rx = bw / 2;
      const ry = bh / 2;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      return dx * dx + dy * dy <= 1;
    }

    // For freeform, would check mask - not implemented
    return true;
  }

  setActiveLayerId(layerId: string) {
    this.activeLayerId = layerId;
  }

  getActiveLayerId(): string | null {
    return this.activeLayerId;
  }
}

export const selectionStore = new SelectionStore();
```

**Step 2: Verify file compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "selection" || echo "No selection errors"`

---

## Task 3: Create Selection Commands

**Files:**
- Create: `src/commands/selection-commands.ts`

**Step 1: Create the selection commands file**

```typescript
import { type Command } from '../stores/history';
import { selectionStore } from '../stores/selection';
import { type SelectionShape } from '../types/selection';
import { type Rect } from '../types/geometry';

/**
 * Command for cutting selected pixels into a floating selection.
 * Execute: cuts pixels from layer, stores in floating state
 * Undo: restores pixels to layer, returns to selected state
 */
export class CutToFloatCommand implements Command {
  id: string;
  name = 'Move Selection';
  timestamp: number;

  private layerId: string;
  private bounds: Rect;
  private shape: SelectionShape;
  private cutImageData: ImageData;
  private canvas: HTMLCanvasElement;
  private mask?: Uint8Array;

  constructor(
    canvas: HTMLCanvasElement,
    layerId: string,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.layerId = layerId;
    this.bounds = { ...bounds };
    this.shape = shape;
    this.mask = mask;

    // Capture the pixels we're about to cut
    const ctx = canvas.getContext('2d')!;
    this.cutImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    // Clear the pixels from the canvas (cut them)
    if (this.shape === 'rectangle') {
      ctx.clearRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
    } else if (this.shape === 'ellipse') {
      // Clear ellipse region
      this.clearEllipse(ctx);
    }
    // freeform would use mask

    // Set selection store to floating state with the cut pixels
    selectionStore.setFloating(this.cutImageData, this.bounds, this.shape, this.mask);
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore the cut pixels
    ctx.putImageData(this.cutImageData, this.bounds.x, this.bounds.y);

    // Return to selected state
    selectionStore.setSelected(this.bounds, this.shape, this.mask);
  }

  private clearEllipse(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.bounds;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;

    // Get current image data
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    // Clear pixels inside ellipse
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = (px + 0.5 - width / 2) / rx;
        const dy = (py + 0.5 - height / 2) / ry;
        if (dx * dx + dy * dy <= 1) {
          const idx = (py * width + px) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        }
      }
    }

    ctx.putImageData(imageData, x, y);
  }
}

/**
 * Command for committing a floating selection to the canvas.
 * Execute: pastes floating pixels at destination, clears selection
 * Undo: removes pasted pixels, restores floating state at destination
 */
export class CommitFloatCommand implements Command {
  id: string;
  name = 'Commit Selection';
  timestamp: number;

  private layerId: string;
  private canvas: HTMLCanvasElement;
  private floatingImageData: ImageData;
  private destinationBounds: Rect;
  private overwrittenImageData: ImageData;
  private shape: SelectionShape;
  private mask?: Uint8Array;

  constructor(
    canvas: HTMLCanvasElement,
    layerId: string,
    floatingImageData: ImageData,
    originalBounds: Rect,
    offset: { x: number; y: number },
    shape: SelectionShape,
    mask?: Uint8Array
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.layerId = layerId;
    this.floatingImageData = floatingImageData;
    this.shape = shape;
    this.mask = mask;

    // Calculate destination bounds
    this.destinationBounds = {
      x: originalBounds.x + offset.x,
      y: originalBounds.y + offset.y,
      width: originalBounds.width,
      height: originalBounds.height,
    };

    // Capture what's currently at the destination (for undo)
    const ctx = canvas.getContext('2d')!;
    this.overwrittenImageData = ctx.getImageData(
      this.destinationBounds.x,
      this.destinationBounds.y,
      this.destinationBounds.width,
      this.destinationBounds.height
    );
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    // Paste the floating pixels at destination
    if (this.shape === 'rectangle') {
      ctx.putImageData(this.floatingImageData, this.destinationBounds.x, this.destinationBounds.y);
    } else if (this.shape === 'ellipse') {
      this.pasteEllipse(ctx);
    }
    // freeform would use mask

    // Clear selection state
    selectionStore.clearAfterCommit();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore what was overwritten at destination
    ctx.putImageData(this.overwrittenImageData, this.destinationBounds.x, this.destinationBounds.y);

    // Restore floating state at the destination position
    selectionStore.setFloating(
      this.floatingImageData,
      {
        x: this.destinationBounds.x,
        y: this.destinationBounds.y,
        width: this.destinationBounds.width,
        height: this.destinationBounds.height,
      },
      this.shape,
      this.mask
    );
    // Reset offset to 0 since we're now at destination
  }

  private pasteEllipse(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.destinationBounds;

    // Get destination image data
    const destData = ctx.getImageData(x, y, width, height);
    const srcData = this.floatingImageData.data;
    const dstData = destData.data;

    // Only paste pixels inside ellipse
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = (px + 0.5 - width / 2) / (width / 2);
        const dy = (py + 0.5 - height / 2) / (height / 2);
        if (dx * dx + dy * dy <= 1) {
          const idx = (py * width + px) * 4;
          dstData[idx] = srcData[idx];
          dstData[idx + 1] = srcData[idx + 1];
          dstData[idx + 2] = srcData[idx + 2];
          dstData[idx + 3] = srcData[idx + 3];
        }
      }
    }

    ctx.putImageData(destData, x, y);
  }
}

/**
 * Command for deleting selected pixels (without moving).
 * Execute: clears selected pixels
 * Undo: restores cleared pixels
 */
export class DeleteSelectionCommand implements Command {
  id: string;
  name = 'Delete Selection';
  timestamp: number;

  private canvas: HTMLCanvasElement;
  private bounds: Rect;
  private shape: SelectionShape;
  private deletedImageData: ImageData;
  private mask?: Uint8Array;

  constructor(
    canvas: HTMLCanvasElement,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.bounds = { ...bounds };
    this.shape = shape;
    this.mask = mask;

    // Capture pixels before deleting
    const ctx = canvas.getContext('2d')!;
    this.deletedImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    if (this.shape === 'rectangle') {
      ctx.clearRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
    } else if (this.shape === 'ellipse') {
      this.clearEllipse(ctx);
    }

    selectionStore.clear();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.deletedImageData, this.bounds.x, this.bounds.y);

    // Restore selection
    selectionStore.setSelected(this.bounds, this.shape, this.mask);
  }

  private clearEllipse(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.bounds;
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = (px + 0.5 - width / 2) / (width / 2);
        const dy = (py + 0.5 - height / 2) / (height / 2);
        if (dx * dx + dy * dy <= 1) {
          const idx = (py * width + px) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        }
      }
    }

    ctx.putImageData(imageData, x, y);
  }
}
```

**Step 2: Verify file created**

Run: `wc -l src/commands/selection-commands.ts`

---

## Task 4: Create Selection Overlay Component

**Files:**
- Create: `src/components/canvas/pf-selection-overlay.ts`

**Step 1: Create the selection overlay component**

```typescript
import { html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { selectionStore } from '../../stores/selection';
import { viewportStore } from '../../stores/viewport';

/**
 * Transparent canvas overlay that renders:
 * - Marching ants for active selections
 * - Floating selection pixels during move
 */
@customElement('pf-selection-overlay')
export class PFSelectionOverlay extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 45;
    }

    canvas {
      width: 100%;
      height: 100%;
    }
  `;

  @query('canvas') canvas!: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId = 0;
  private dashOffset = 0;
  private lastTimestamp = 0;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('resize', this.handleResize);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.handleResize);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  firstUpdated() {
    this.initCanvas();
    this.startAnimationLoop();
  }

  private initCanvas() {
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  private handleResize = () => {
    this.resizeCanvas();
  };

  private resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.clientWidth * dpr;
    this.canvas.height = this.clientHeight * dpr;
  }

  private startAnimationLoop() {
    const animate = (timestamp: number) => {
      const delta = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;

      // Update dash offset for marching ants animation
      this.dashOffset = (this.dashOffset + delta * 0.06) % 16;

      this.draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  private draw() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(dpr, dpr);

    const state = selectionStore.state.value;
    if (state.type === 'none') return;

    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    if (state.type === 'selecting' || state.type === 'selected') {
      const bounds = state.type === 'selecting' ? state.currentBounds : state.bounds;
      this.drawMarchingAnts(ctx, bounds, zoom, panX, panY);
    }

    if (state.type === 'floating') {
      // Draw floating pixels
      this.drawFloatingPixels(ctx, state, zoom, panX, panY);

      // Draw marching ants around floating selection
      const floatBounds = {
        x: state.originalBounds.x + state.currentOffset.x,
        y: state.originalBounds.y + state.currentOffset.y,
        width: state.originalBounds.width,
        height: state.originalBounds.height,
      };
      this.drawMarchingAnts(ctx, floatBounds, zoom, panX, panY);
    }
  }

  private drawMarchingAnts(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const screenX = bounds.x * zoom + panX;
    const screenY = bounds.y * zoom + panY;
    const screenWidth = bounds.width * zoom;
    const screenHeight = bounds.height * zoom;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // White dashes
    ctx.strokeStyle = 'white';
    ctx.lineDashOffset = -this.dashOffset;
    ctx.strokeRect(
      Math.round(screenX) + 0.5,
      Math.round(screenY) + 0.5,
      Math.round(screenWidth) - 1,
      Math.round(screenHeight) - 1
    );

    // Black dashes (offset to fill gaps)
    ctx.strokeStyle = 'black';
    ctx.lineDashOffset = -this.dashOffset + 4;
    ctx.strokeRect(
      Math.round(screenX) + 0.5,
      Math.round(screenY) + 0.5,
      Math.round(screenWidth) - 1,
      Math.round(screenHeight) - 1
    );

    ctx.restore();
  }

  private drawFloatingPixels(
    ctx: CanvasRenderingContext2D,
    state: { imageData: ImageData; originalBounds: { x: number; y: number; width: number; height: number }; currentOffset: { x: number; y: number } },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const destX = state.originalBounds.x + state.currentOffset.x;
    const destY = state.originalBounds.y + state.currentOffset.y;

    const screenX = destX * zoom + panX;
    const screenY = destY * zoom + panY;
    const screenWidth = state.originalBounds.width * zoom;
    const screenHeight = state.originalBounds.height * zoom;

    // Create temporary canvas to hold the floating pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = state.imageData.width;
    tempCanvas.height = state.imageData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(state.imageData, 0, 0);

    // Draw scaled to screen
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      tempCanvas,
      Math.round(screenX),
      Math.round(screenY),
      Math.round(screenWidth),
      Math.round(screenHeight)
    );
  }

  render() {
    // Access signals for reactivity
    void selectionStore.state.value;
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;

    return html`<canvas></canvas>`;
  }
}
```

**Step 2: Verify file created**

Run: `head -20 src/components/canvas/pf-selection-overlay.ts`

---

## Task 5: Add Selection Overlay to Viewport

**Files:**
- Modify: `src/components/canvas/pf-canvas-viewport.ts`

**Step 1: Import the selection overlay**

Find the imports section and add:

```typescript
import "./pf-selection-overlay";
```

**Step 2: Add selection overlay to the render template**

Find this line in the render method:
```typescript
<pf-marching-ants-overlay></pf-marching-ants-overlay>
```

Add the selection overlay before it:
```typescript
<pf-selection-overlay></pf-selection-overlay>
<pf-marching-ants-overlay></pf-marching-ants-overlay>
```

**Step 3: Verify changes**

Run: `grep -n "selection-overlay" src/components/canvas/pf-canvas-viewport.ts`

---

## Task 6: Update Marquee Tool with New Interaction Logic

**Files:**
- Modify: `src/tools/selection/marquee-rect-tool.ts`

**Step 1: Replace the entire marquee tool**

```typescript
import { BaseTool, type ModifierKeys } from '../base-tool';
import { selectionStore } from '../../stores/selection';
import { historyStore } from '../../stores/history';
import { layerStore } from '../../stores/layers';
import { CutToFloatCommand, CommitFloatCommand } from '../../commands/selection-commands';

export class MarqueeRectTool extends BaseTool {
  name = 'marquee-rect';
  cursor = 'crosshair';

  private mode: 'idle' | 'selecting' | 'dragging' = 'idle';
  private startX = 0;
  private startY = 0;
  private lastDragX = 0;
  private lastDragY = 0;

  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    // Check if clicking inside existing selection
    if (selectionStore.isPointInSelection(canvasX, canvasY)) {
      this.startDragging(canvasX, canvasY);
    } else {
      // Clicking outside - commit any floating selection first, then start new
      this.commitIfFloating();
      this.startNewSelection(canvasX, canvasY);
    }
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    if (this.mode === 'selecting') {
      selectionStore.updateSelection({ x: canvasX, y: canvasY }, { shift: modifiers?.shift });
    } else if (this.mode === 'dragging') {
      const dx = canvasX - this.lastDragX;
      const dy = canvasY - this.lastDragY;
      selectionStore.moveFloat(dx, dy);
      this.lastDragX = canvasX;
      this.lastDragY = canvasY;
    }
  }

  onUp(x: number, y: number, modifiers?: ModifierKeys) {
    if (this.mode === 'selecting') {
      selectionStore.finalizeSelection();
    }
    // If dragging, stay floating (wait for commit)

    this.mode = 'idle';
  }

  private startNewSelection(x: number, y: number) {
    this.mode = 'selecting';
    this.startX = x;
    this.startY = y;
    selectionStore.startSelection('rectangle', { x, y });
  }

  private startDragging(x: number, y: number) {
    const state = selectionStore.state.value;

    // If selected (not floating), cut to float first
    if (state.type === 'selected') {
      this.cutToFloat();
    }

    this.mode = 'dragging';
    this.lastDragX = x;
    this.lastDragY = y;
  }

  private cutToFloat() {
    const state = selectionStore.state.value;
    if (state.type !== 'selected') return;

    const layer = layerStore.activeLayer;
    if (!layer?.canvas) return;

    const command = new CutToFloatCommand(
      layer.canvas,
      layer.id,
      state.bounds,
      state.shape,
      state.shape === 'freeform' ? (state as any).mask : undefined
    );

    historyStore.execute(command);
  }

  private commitIfFloating() {
    const state = selectionStore.state.value;
    if (state.type !== 'floating') return;

    const layer = layerStore.activeLayer;
    if (!layer?.canvas) return;

    const command = new CommitFloatCommand(
      layer.canvas,
      layer.id,
      state.imageData,
      state.originalBounds,
      state.currentOffset,
      state.shape,
      state.mask
    );

    historyStore.execute(command);
  }
}
```

**Step 2: Verify file**

Run: `grep -n "CutToFloatCommand\|CommitFloatCommand" src/tools/selection/marquee-rect-tool.ts`

---

## Task 7: Add Selection Keyboard Shortcuts

**Files:**
- Modify: `src/services/keyboard/register-shortcuts.ts`

**Step 1: Add imports at the top**

Add after existing imports:

```typescript
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';
import { DeleteSelectionCommand, CommitFloatCommand } from '../../commands/selection-commands';
import { projectStore } from '../../stores/project';
```

**Step 2: Add selection shortcuts section**

Find a good place (after animation shortcuts) and add:

```typescript
  // ============================================
  // SELECTION SHORTCUTS
  // ============================================

  // Enter = Commit floating selection
  keyboardService.register('Enter', [], () => {
    const state = selectionStore.state.value;
    if (state.type === 'floating') {
      const layer = layerStore.activeLayer;
      if (!layer?.canvas) return;

      const command = new CommitFloatCommand(
        layer.canvas,
        layer.id,
        state.imageData,
        state.originalBounds,
        state.currentOffset,
        state.shape,
        state.mask
      );
      historyStore.execute(command);
    }
  }, 'Commit selection');

  // Escape = Cancel floating selection (undo cut)
  keyboardService.register('Escape', [], () => {
    const state = selectionStore.state.value;
    if (state.type === 'floating') {
      historyStore.undo();
    } else if (state.type === 'selected' || state.type === 'selecting') {
      selectionStore.clear();
    }
  }, 'Cancel selection');

  // Delete/Backspace = Delete selected pixels
  keyboardService.register('Delete', [], () => {
    const state = selectionStore.state.value;
    if (state.type === 'selected') {
      const layer = layerStore.activeLayer;
      if (!layer?.canvas) return;

      const command = new DeleteSelectionCommand(
        layer.canvas,
        state.bounds,
        state.shape,
        state.shape === 'freeform' ? (state as any).mask : undefined
      );
      historyStore.execute(command);
    }
  }, 'Delete selection');

  keyboardService.register('Backspace', [], () => {
    const state = selectionStore.state.value;
    if (state.type === 'selected') {
      const layer = layerStore.activeLayer;
      if (!layer?.canvas) return;

      const command = new DeleteSelectionCommand(
        layer.canvas,
        state.bounds,
        state.shape,
        state.shape === 'freeform' ? (state as any).mask : undefined
      );
      historyStore.execute(command);
    }
  }, 'Delete selection');

  // Ctrl+D = Deselect
  keyboardService.register('d', ['ctrl'], () => {
    const state = selectionStore.state.value;
    if (state.type === 'floating') {
      // Commit first, then clear
      const layer = layerStore.activeLayer;
      if (layer?.canvas) {
        const command = new CommitFloatCommand(
          layer.canvas,
          layer.id,
          state.imageData,
          state.originalBounds,
          state.currentOffset,
          state.shape,
          state.mask
        );
        historyStore.execute(command);
      }
    } else {
      selectionStore.clear();
    }
  }, 'Deselect');

  keyboardService.register('d', ['meta'], () => {
    const state = selectionStore.state.value;
    if (state.type === 'floating') {
      const layer = layerStore.activeLayer;
      if (layer?.canvas) {
        const command = new CommitFloatCommand(
          layer.canvas,
          layer.id,
          state.imageData,
          state.originalBounds,
          state.currentOffset,
          state.shape,
          state.mask
        );
        historyStore.execute(command);
      }
    } else {
      selectionStore.clear();
    }
  }, 'Deselect');

  // Ctrl+A = Select all
  keyboardService.register('a', ['ctrl'], () => {
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    selectionStore.state.value = {
      type: 'selected',
      shape: 'rectangle',
      bounds: { x: 0, y: 0, width, height },
    };
  }, 'Select all');

  keyboardService.register('a', ['meta'], () => {
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    selectionStore.state.value = {
      type: 'selected',
      shape: 'rectangle',
      bounds: { x: 0, y: 0, width, height },
    };
  }, 'Select all');
```

**Step 3: Verify shortcuts added**

Run: `grep -c "selection" src/services/keyboard/register-shortcuts.ts`

---

## Task 8: Auto-commit on Drawing Tool Switch

**Files:**
- Modify: `src/components/canvas/pf-drawing-canvas.ts`

**Step 1: Add imports**

Add to imports:

```typescript
import { selectionStore } from '../../stores/selection';
import { CommitFloatCommand } from '../../commands/selection-commands';
import { historyStore } from '../../stores/history';
```

**Step 2: Find the loadTool method and add auto-commit**

At the start of the `loadTool` method (or wherever tools are switched), add:

```typescript
// Auto-commit floating selection when switching to drawing tools
const drawingTools = ['pencil', 'eraser', 'fill', 'gradient', 'line', 'rectangle', 'ellipse'];
if (drawingTools.includes(toolType)) {
  const state = selectionStore.state.value;
  if (state.type === 'floating') {
    const layer = layerStore.activeLayer;
    if (layer?.canvas) {
      const command = new CommitFloatCommand(
        layer.canvas,
        layer.id,
        state.imageData,
        state.originalBounds,
        state.currentOffset,
        state.shape,
        state.mask
      );
      historyStore.execute(command);
    }
  }
}
```

**Step 3: Verify changes**

Run: `grep -n "floating" src/components/canvas/pf-drawing-canvas.ts`

---

## Task 9: Integration Testing

**Manual testing checklist:**

Run `npm run dev` and test:

- [ ] M key activates marquee tool
- [ ] Drag to create rectangle selection (marching ants appear)
- [ ] Shift+drag creates square selection
- [ ] Click inside selection and drag to move pixels
- [ ] Pixels are cut from original location (transparency left behind)
- [ ] Floating pixels follow cursor
- [ ] Press Enter to commit at new location
- [ ] Press Escape to cancel (pixels restored to original)
- [ ] Ctrl+Z undoes the cut (back to selected, not floating)
- [ ] Ctrl+Z again clears selection
- [ ] Delete key deletes selected pixels
- [ ] Ctrl+D deselects
- [ ] Ctrl+A selects entire canvas
- [ ] Switching to pencil tool auto-commits floating selection
- [ ] Click outside selection to start new selection (commits old)

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Update selection types | `src/types/selection.ts` |
| 2 | Rewrite selection store | `src/stores/selection.ts` |
| 3 | Create selection commands | `src/commands/selection-commands.ts` |
| 4 | Create selection overlay | `src/components/canvas/pf-selection-overlay.ts` |
| 5 | Add overlay to viewport | `src/components/canvas/pf-canvas-viewport.ts` |
| 6 | Update marquee tool | `src/tools/selection/marquee-rect-tool.ts` |
| 7 | Add keyboard shortcuts | `src/services/keyboard/register-shortcuts.ts` |
| 8 | Auto-commit on tool switch | `src/components/canvas/pf-drawing-canvas.ts` |
| 9 | Integration testing | Manual |

**Estimated commits:** 8-9
