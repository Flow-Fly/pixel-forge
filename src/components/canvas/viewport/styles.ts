/**
 * Canvas viewport styles.
 */

import { css } from 'lit';

export const viewportStyles = css`
  :host {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #1a1a1a;
    position: relative;
    /* Prevent browser back/forward gesture on two-finger horizontal swipe */
    overscroll-behavior: none;
    touch-action: none;
  }

  .viewport-content {
    position: absolute;
    transform-origin: 0 0;
    will-change: transform;
  }

  /* Checkerboard pattern to indicate transparency */
  ::slotted(pf-drawing-canvas) {
    background-image: linear-gradient(45deg, #404040 25%, transparent 25%),
      linear-gradient(-45deg, #404040 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #404040 75%),
      linear-gradient(-45deg, transparent 75%, #404040 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
    background-color: #2a2a2a;
  }

  /* Show grab cursor when spacebar is down */
  :host([space-down]) {
    cursor: grab;
  }
  :host([space-down]) ::slotted(*) {
    cursor: grab !important;
  }

  /* Show grabbing cursor when panning */
  :host([panning]) {
    cursor: grabbing;
  }
  :host([panning]) ::slotted(*) {
    cursor: grabbing !important;
  }

  /* Grid overlay canvas - renders at screen resolution, not scaled */
  #grid-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* Ruler positioning */
  pf-ruler[orientation="horizontal"] {
    left: 24px; /* Account for vertical ruler width */
  }

  pf-ruler[orientation="vertical"] {
    top: 24px; /* Account for horizontal ruler height */
  }

  /* Corner piece where rulers meet */
  .ruler-corner {
    position: absolute;
    top: 0;
    left: 0;
    width: 24px;
    height: 24px;
    background: var(--color-bg-secondary, #252525);
    z-index: 101;
  }
`;
