/**
 * Axis-aligned bounding box for dirty rectangle tracking.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the union of two rectangles (smallest rect containing both).
 */
export function rectUnion(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute the intersection of two rectangles (null if no overlap).
 */
export function rectIntersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Expand a rectangle by brush size (accounts for brush radius).
 */
export function rectExpand(rect: Rect, brushSize: number): Rect {
  const half = Math.ceil(brushSize / 2);
  return {
    x: rect.x - half,
    y: rect.y - half,
    width: rect.width + brushSize,
    height: rect.height + brushSize
  };
}

/**
 * Clamp a rectangle to canvas bounds and convert to integers.
 */
export function rectClamp(rect: Rect, canvasWidth: number, canvasHeight: number): Rect {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(canvasWidth, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(canvasHeight, Math.ceil(rect.y + rect.height));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
