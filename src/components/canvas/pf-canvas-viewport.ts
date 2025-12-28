import { html } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { viewportStore } from '../../stores/viewport';
import { gridStore } from '../../stores/grid';
import { projectStore } from '../../stores/project';
import './pf-selection-overlay';
import './pf-marching-ants-overlay';
import './pf-brush-cursor-overlay';
import './pf-transform-handles';
import './pf-text-input';
import './pf-ruler';
import './pf-guides-overlay';
import './pf-reference-below-overlay';
import './pf-reference-above-overlay';

import {
  viewportStyles,
  initGridCanvas,
  resizeGridCanvas,
  drawGrids,
  createKeyboardState,
  handleKeyDown,
  handleKeyUp,
  handleWindowBlur,
  createPanState,
  handleGlobalMouseDown,
  handleMouseDown as panHandleMouseDown,
  startDragging as panStartDragging,
  handleGlobalMouseMove,
  handleGlobalMouseUp,
  handleMouseMove as panHandleMouseMove,
  handleMouseLeave,
  handleContextMenu,
  handleWheel as wheelHandleWheel,
  handleGlobalWheel,
  handleRotationStart,
  handleResizeStart,
  handleRotationEnd,
  commitTransform,
  type KeyboardState,
  type PanState,
} from './viewport';

@customElement('pf-canvas-viewport')
export class PFCanvasViewport extends BaseComponent {
  static styles = viewportStyles;

  @query('#grid-overlay') gridCanvas!: HTMLCanvasElement;
  private gridCtx: CanvasRenderingContext2D | null = null;

  // State trackers
  private keyboardState: KeyboardState = createKeyboardState();
  private panState: PanState = createPanState();

  // ResizeObserver to detect flex layout changes
  private resizeObserver: ResizeObserver | null = null;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('commit-transform', this.onCommitTransform);
    window.addEventListener('mousedown', this.onGlobalMouseDown);
    window.addEventListener('wheel', this.onGlobalWheel, { passive: false });

    // Update container dimensions for zoomToFit
    this.updateContainerDimensions();

    // Use ResizeObserver to detect size changes from flex layout
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this);

    // Center canvas on launch
    requestAnimationFrame(() => {
      viewportStore.zoomToFit(this.clientWidth, this.clientHeight);
      this.initGrid();
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('commit-transform', this.onCommitTransform);
    window.removeEventListener('mousedown', this.onGlobalMouseDown);
    window.removeEventListener('wheel', this.onGlobalWheel);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    window.removeEventListener('mousemove', this.onGlobalMouseMove);
    window.removeEventListener('mouseup', this.onGlobalMouseUp);
  }

  private initGrid() {
    if (!this.gridCanvas) return;
    this.gridCtx = initGridCanvas(this.gridCanvas);
    this.resizeGrid();
  }

  private handleResize = () => {
    this.updateContainerDimensions();
    this.resizeGrid();
    this.requestUpdate();
  };

  private resizeGrid() {
    resizeGridCanvas(this.gridCanvas, this.gridCtx, this.clientWidth, this.clientHeight);
  }

  private updateContainerDimensions = () => {
    viewportStore.containerWidth.value = this.clientWidth;
    viewportStore.containerHeight.value = this.clientHeight;
  };

  render() {
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;
    const zoom = viewportStore.zoom.value;
    const isSpaceDown = viewportStore.isSpacebarDown.value;
    const isPanning = viewportStore.isPanning.value;

    // Access grid signals for reactive updates
    void gridStore.pixelGridEnabled.value;
    void gridStore.tileGridEnabled.value;
    void gridStore.tileGridSize.value;
    void gridStore.pixelGridColor.value;
    void gridStore.pixelGridOpacity.value;
    void gridStore.tileGridColor.value;
    void gridStore.tileGridOpacity.value;

    // Access project dimensions for grid redraw on project load
    void projectStore.width.value;
    void projectStore.height.value;

    // Update host attributes for cursor styling
    this.toggleAttribute('space-down', isSpaceDown && !isPanning);
    this.toggleAttribute('panning', isPanning);

    // Update slotted drawing canvas cursor for pan mode
    const drawingCanvas = this.querySelector('pf-drawing-canvas');
    if (drawingCanvas) {
      if (isPanning) {
        drawingCanvas.setAttribute('pan-cursor', 'grabbing');
      } else if (isSpaceDown) {
        drawingCanvas.setAttribute('pan-cursor', 'grab');
      } else {
        drawingCanvas.removeAttribute('pan-cursor');
      }
    }

    // Draw grids after render
    requestAnimationFrame(() => this.renderGrids());

    return html`
      <div
        class="viewport-content"
        style="transform: translate(${panX}px, ${panY}px) scale(${zoom})"
        @mousedown=${this.onMouseDown}
        @mousemove=${this.onMouseMove}
        @mouseleave=${this.onMouseLeave}
        @wheel=${this.onWheel}
        @contextmenu=${this.onContextMenu}
      >
        <pf-reference-below-overlay></pf-reference-below-overlay>
        <slot></slot>
      </div>
      <canvas id="grid-overlay"></canvas>
      <pf-reference-above-overlay></pf-reference-above-overlay>
      <pf-selection-overlay></pf-selection-overlay>
      <pf-marching-ants-overlay></pf-marching-ants-overlay>
      <pf-brush-cursor-overlay></pf-brush-cursor-overlay>
      <pf-transform-handles
        @rotation-start=${this.onRotationStart}
        @rotation-end=${this.onRotationEnd}
        @resize-start=${this.onResizeStart}
        @resize-end=${this.onResizeEnd}
      ></pf-transform-handles>
      <pf-text-input></pf-text-input>
      <pf-guides-overlay></pf-guides-overlay>
      <div class="ruler-corner"></div>
      <pf-ruler orientation="horizontal"></pf-ruler>
      <pf-ruler orientation="vertical"></pf-ruler>
    `;
  }

  private renderGrids() {
    if (!this.gridCtx) {
      this.initGrid();
      if (!this.gridCtx) return;
    }
    drawGrids(this.gridCanvas, this.gridCtx, this.clientWidth, this.clientHeight);
  }

  // ============================================
  // Event handler bindings
  // ============================================

  private readonly keyboardCallbacks = {
    requestUpdate: () => this.requestUpdate(),
    getClientWidth: () => this.clientWidth,
    getClientHeight: () => this.clientHeight,
    commitTransform: () => commitTransform(),
    setDragging: (value: boolean) => { this.panState.isDragging = value; },
    getDragging: () => this.panState.isDragging,
  };

  private readonly panCallbacks = {
    requestUpdate: () => this.requestUpdate(),
    querySelector: (selector: string) => this.querySelector(selector),
    getBoundingClientRect: () => this.getBoundingClientRect(),
  };

  private readonly wheelCallbacks = {
    requestUpdate: () => this.requestUpdate(),
    getBoundingClientRect: () => this.getBoundingClientRect(),
    contains: (node: Node) => this.contains(node),
  };

  private onKeyDown = (e: KeyboardEvent) => {
    handleKeyDown(e, this.keyboardState, this.keyboardCallbacks);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    handleKeyUp(e, this.keyboardState, this.keyboardCallbacks);
  };

  private onWindowBlur = () => {
    handleWindowBlur(this.keyboardState);
  };

  private onGlobalMouseDown = (e: MouseEvent) => {
    handleGlobalMouseDown(e, this.panState, (ev) => this.startDrag(ev));
  };

  private onMouseDown = (e: MouseEvent) => {
    panHandleMouseDown(e, this.panState, this.panCallbacks, (ev) => this.startDrag(ev));
  };

  private startDrag = (e: MouseEvent) => {
    panStartDragging(e, this.panState, this.panCallbacks, () => {
      window.addEventListener('mousemove', this.onGlobalMouseMove);
      window.addEventListener('mouseup', this.onGlobalMouseUp);
    });
  };

  private onGlobalMouseMove = (e: MouseEvent) => {
    handleGlobalMouseMove(e, this.panState, this.panCallbacks);
  };

  private onGlobalMouseUp = () => {
    handleGlobalMouseUp(this.panState, this.panCallbacks, () => {
      window.removeEventListener('mousemove', this.onGlobalMouseMove);
      window.removeEventListener('mouseup', this.onGlobalMouseUp);
    });
  };

  private onMouseMove = (e: MouseEvent) => {
    panHandleMouseMove(e, this.panState, () => this.getBoundingClientRect());
  };

  private onMouseLeave = () => {
    handleMouseLeave(this.panState);
  };

  private onContextMenu = (e: MouseEvent) => {
    handleContextMenu(e);
  };

  private onWheel = (e: WheelEvent) => {
    wheelHandleWheel(e, this.keyboardState, this.wheelCallbacks);
  };

  private onGlobalWheel = (e: WheelEvent) => {
    handleGlobalWheel(e, this.wheelCallbacks);
  };

  private onRotationStart = () => {
    handleRotationStart();
  };

  private onRotationEnd = () => {
    handleRotationEnd();
  };

  private onResizeStart = () => {
    handleResizeStart();
  };

  private onResizeEnd = () => {
    // Resize drag ended - transform will be committed when user
    // clicks outside or presses Enter
  };

  private onCommitTransform = () => {
    commitTransform();
  };
}
