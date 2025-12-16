/**
 * Grid rendering utilities for the canvas viewport.
 *
 * Draws pixel and tile grids at screen resolution.
 */

import { gridStore } from '../../../stores/grid';
import { viewportStore } from '../../../stores/viewport';
import { projectStore } from '../../../stores/project';

/**
 * Initialize the grid canvas context.
 */
export function initGridCanvas(
  gridCanvas: HTMLCanvasElement | null
): CanvasRenderingContext2D | null {
  if (!gridCanvas) return null;
  return gridCanvas.getContext('2d');
}

/**
 * Resize grid canvas to match viewport dimensions.
 */
export function resizeGridCanvas(
  gridCanvas: HTMLCanvasElement | null,
  gridCtx: CanvasRenderingContext2D | null,
  clientWidth: number,
  clientHeight: number
): void {
  if (!gridCanvas) return;

  // Match canvas resolution to actual pixel size for crisp lines
  const dpr = window.devicePixelRatio || 1;
  gridCanvas.width = clientWidth * dpr;
  gridCanvas.height = clientHeight * dpr;

  if (gridCtx) {
    gridCtx.scale(dpr, dpr);
  }
}

/**
 * Draw all enabled grids.
 */
export function drawGrids(
  gridCanvas: HTMLCanvasElement | null,
  gridCtx: CanvasRenderingContext2D | null,
  clientWidth: number,
  clientHeight: number
): void {
  if (!gridCtx || !gridCanvas) return;

  const ctx = gridCtx;
  const dpr = window.devicePixelRatio || 1;
  const viewWidth = clientWidth;
  const viewHeight = clientHeight;

  // Clear the grid canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
  ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  ctx.scale(dpr, dpr); // Re-apply DPR scaling

  const zoom = viewportStore.zoom.value;
  const panX = viewportStore.panX.value;
  const panY = viewportStore.panY.value;
  const canvasWidth = projectStore.width.value;
  const canvasHeight = projectStore.height.value;

  // Pixel grid: only show at or above threshold
  if (
    gridStore.pixelGridEnabled.value &&
    zoom >= gridStore.autoShowThreshold.value
  ) {
    drawPixelGrid(
      ctx,
      viewWidth,
      viewHeight,
      zoom,
      panX,
      panY,
      canvasWidth,
      canvasHeight
    );
  }

  // Tile grid: always show if enabled
  if (gridStore.tileGridEnabled.value) {
    drawTileGrid(
      ctx,
      viewWidth,
      viewHeight,
      zoom,
      panX,
      panY,
      canvasWidth,
      canvasHeight
    );
  }
}

/**
 * Draw pixel grid (1px spacing between each pixel).
 */
function drawPixelGrid(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.save();
  ctx.strokeStyle = gridStore.pixelGridColor.value;
  ctx.globalAlpha = gridStore.pixelGridOpacity.value;
  ctx.lineWidth = 1;

  ctx.beginPath();

  // Calculate visible range in canvas coordinates
  const startX = Math.max(0, Math.floor(-panX / zoom));
  const endX = Math.min(canvasWidth, Math.ceil((viewWidth - panX) / zoom));
  const startY = Math.max(0, Math.floor(-panY / zoom));
  const endY = Math.min(canvasHeight, Math.ceil((viewHeight - panY) / zoom));

  // Vertical lines at each pixel boundary
  for (let x = startX; x <= endX; x++) {
    const screenX = Math.round(panX + x * zoom) + 0.5;
    if (screenX >= 0 && screenX <= viewWidth) {
      ctx.moveTo(screenX, Math.max(0, panY));
      ctx.lineTo(screenX, Math.min(viewHeight, panY + canvasHeight * zoom));
    }
  }

  // Horizontal lines at each pixel boundary
  for (let y = startY; y <= endY; y++) {
    const screenY = Math.round(panY + y * zoom) + 0.5;
    if (screenY >= 0 && screenY <= viewHeight) {
      ctx.moveTo(Math.max(0, panX), screenY);
      ctx.lineTo(Math.min(viewWidth, panX + canvasWidth * zoom), screenY);
    }
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Draw tile grid (larger spacing for sprite sheets).
 */
function drawTileGrid(
  ctx: CanvasRenderingContext2D,
  viewWidth: number,
  viewHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  const tileSize = gridStore.tileGridSize.value;

  ctx.save();
  ctx.strokeStyle = gridStore.tileGridColor.value;
  ctx.globalAlpha = gridStore.tileGridOpacity.value;
  ctx.lineWidth = 1;

  ctx.beginPath();

  // Calculate visible range
  const startX = Math.max(0, Math.floor(-panX / zoom / tileSize) * tileSize);
  const endX = Math.min(canvasWidth, Math.ceil((viewWidth - panX) / zoom));
  const startY = Math.max(0, Math.floor(-panY / zoom / tileSize) * tileSize);
  const endY = Math.min(canvasHeight, Math.ceil((viewHeight - panY) / zoom));

  // Vertical lines at tile intervals
  for (let x = startX; x <= endX; x += tileSize) {
    const screenX = Math.round(panX + x * zoom) + 0.5;
    if (screenX >= 0 && screenX <= viewWidth) {
      ctx.moveTo(screenX, Math.max(0, panY));
      ctx.lineTo(screenX, Math.min(viewHeight, panY + canvasHeight * zoom));
    }
  }

  // Horizontal lines at tile intervals
  for (let y = startY; y <= endY; y += tileSize) {
    const screenY = Math.round(panY + y * zoom) + 0.5;
    if (screenY >= 0 && screenY <= viewHeight) {
      ctx.moveTo(Math.max(0, panX), screenY);
      ctx.lineTo(Math.min(viewWidth, panX + canvasWidth * zoom), screenY);
    }
  }

  ctx.stroke();
  ctx.restore();
}
