import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';

@customElement('pf-canvas-viewport')
export class PFCanvasViewport extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #1a1a1a;
      position: relative;
    }

    /* Grab cursor only shows on the background, not the canvas */
    .viewport-content {
      position: absolute;
      transform-origin: 0 0;
      will-change: transform;
    }

    /* Checkerboard pattern to indicate transparency */
    ::slotted(pf-drawing-canvas) {
      background-image:
        linear-gradient(45deg, #404040 25%, transparent 25%),
        linear-gradient(-45deg, #404040 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #404040 75%),
        linear-gradient(-45deg, transparent 75%, #404040 75%);
      background-size: 16px 16px;
      background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
      background-color: #2a2a2a;
    }

    /* Show grab cursor when panning */
    :host([panning]) {
      cursor: grabbing;
    }
  `;

  @state() private scale = 1;
  @state() private panX = 0;
  @state() private panY = 0;
  @state() private isDragging = false;
  @state() private lastMouseX = 0;
  @state() private lastMouseY = 0;

  render() {
    return html`
      <div 
        class="viewport-content"
        style="transform: translate(${this.panX}px, ${this.panY}px) scale(${this.scale})"
        @mousedown=${this.handleMouseDown}
        @mousemove=${this.handleMouseMove}
        @mouseup=${this.handleMouseUp}
        @mouseleave=${this.handleMouseUp}
        @wheel=${this.handleWheel}
      >
        <slot></slot>
      </div>
    `;
  }

  private handleMouseDown(e: MouseEvent) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle click or Alt+Click to pan
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.toggleAttribute('panning', true);
      e.preventDefault();
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if (this.isDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;

      this.panX += dx;
      this.panY += dy;

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  }

  private handleMouseUp() {
    this.isDragging = false;
    this.toggleAttribute('panning', false);
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    
    const zoomIntensity = 0.1;
    const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
    const newScale = Math.max(0.1, Math.min(50, this.scale + delta));
    
    // Zoom towards mouse pointer
    // This is a simplified version, can be improved for precise zooming
    this.scale = newScale;
  }
}
