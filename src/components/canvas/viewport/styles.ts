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
    background:
      radial-gradient(circle, rgba(226, 232, 240, 0.14) 0 1px, transparent 1.2px) 19px 23px / 149px 113px,
      linear-gradient(rgba(220, 228, 236, 0.026) 1px, transparent 1px) 0 0 / 32px 32px,
      linear-gradient(90deg, rgba(220, 228, 236, 0.026) 1px, transparent 1px) 0 0 / 32px 32px,
      linear-gradient(180deg, rgba(15, 19, 26, 0.62), rgba(7, 9, 13, 0.74));
    position: relative;
    /* Prevent browser back/forward gesture on two-finger horizontal swipe */
    overscroll-behavior: none;
    touch-action: none;
    /* Isolate this container - layout/paint changes don't affect outside */
    contain: strict;
  }

  .viewport-content {
    position: absolute;
    transform-origin: 0 0;
    /* will-change: transform removed - causes GPU layer issues with large canvases */
    /* Browser will still hardware accelerate due to transform property */
  }

  /* Checkerboard pattern to indicate transparency */
  ::slotted(pf-drawing-canvas) {
    background-image: linear-gradient(45deg, var(--pf-checker-light-color) 25%, transparent 25%),
      linear-gradient(-45deg, var(--pf-checker-light-color) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--pf-checker-light-color) 75%),
      linear-gradient(-45deg, transparent 75%, var(--pf-checker-light-color) 75%);
    background-size: calc(var(--pf-checker-tile-size) * 2) calc(var(--pf-checker-tile-size) * 2);
    background-position: 0 0, 0 var(--pf-checker-tile-size),
      var(--pf-checker-tile-size) calc(-1 * var(--pf-checker-tile-size)),
      calc(-1 * var(--pf-checker-tile-size)) 0;
    background-color: var(--pf-checker-dark-color);
    box-shadow: 0 0 0 1px var(--pf-color-border), 0 22px 70px rgba(0, 0, 0, 0.42);
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
    background: var(--pf-color-bg-secondary, #252525);
    z-index: 101;
  }
`;
