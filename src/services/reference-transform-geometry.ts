import type { Layer } from '../types/layer';
import type { ReferenceLayerData } from '../types/reference';

export type ReferenceLayerTransform = Pick<ReferenceLayerData, 'x' | 'y' | 'scale'>;

export type ReferenceTransformHandlePosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface Point {
  x: number;
  y: number;
}

export interface ReferenceImageSize {
  width: number;
  height: number;
}

export interface ReferenceViewportTransform {
  panX: number;
  panY: number;
  zoom: number;
}

export interface ReferenceTransformHandle {
  position: ReferenceTransformHandlePosition;
  canvasX: number;
  canvasY: number;
  screenX: number;
  screenY: number;
  cursor: string;
}

export interface ReferenceTransformBox {
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  screenLeft: number;
  screenTop: number;
  screenRight: number;
  screenBottom: number;
  handles: ReferenceTransformHandle[];
}

const MIN_REFERENCE_SCALE = 0.01;

const HANDLE_CURSOR: Record<ReferenceTransformHandlePosition, string> = {
  'top-left': 'nwse-resize',
  'top-right': 'nesw-resize',
  'bottom-left': 'nesw-resize',
  'bottom-right': 'nwse-resize',
};

export function createReferenceTransformBox(
  layer: Layer | null | undefined,
  imageSize: ReferenceImageSize,
  viewport: ReferenceViewportTransform
): ReferenceTransformBox | null {
  if (!isEditableReferenceLayer(layer)) return null;
  if (!isPositiveImageSize(imageSize)) return null;

  const transform = layer.referenceData;
  const width = imageSize.width * transform.scale;
  const height = imageSize.height * transform.scale;
  const screenLeft = canvasToScreen(transform.x, viewport.panX, viewport.zoom);
  const screenTop = canvasToScreen(transform.y, viewport.panY, viewport.zoom);
  const screenRight = canvasToScreen(transform.x + width, viewport.panX, viewport.zoom);
  const screenBottom = canvasToScreen(transform.y + height, viewport.panY, viewport.zoom);

  return {
    layerId: layer.id,
    x: transform.x,
    y: transform.y,
    width,
    height,
    screenLeft,
    screenTop,
    screenRight,
    screenBottom,
    handles: createHandles(transform, imageSize, viewport),
  };
}

export function moveReferenceTransform(
  transform: ReferenceLayerTransform,
  startPointer: Point,
  currentPointer: Point,
  zoom: number
): ReferenceLayerTransform {
  const delta = screenDeltaToCanvasDelta(startPointer, currentPointer, zoom);

  return {
    ...transform,
    x: transform.x + delta.x,
    y: transform.y + delta.y,
  };
}

export function scaleReferenceTransformUniformly(
  transform: ReferenceLayerTransform,
  imageSize: ReferenceImageSize,
  handle: ReferenceTransformHandlePosition,
  startPointer: Point,
  currentPointer: Point,
  zoom: number
): ReferenceLayerTransform {
  if (!isPositiveImageSize(imageSize)) return transform;

  const delta = screenDeltaToCanvasDelta(startPointer, currentPointer, zoom);
  const anchor = getOppositeCorner(transform, imageSize, handle);
  const initialCorner = getHandleCorner(transform, imageSize, handle);
  const draggedCorner = {
    x: initialCorner.x + delta.x,
    y: initialCorner.y + delta.y,
  };
  const scaleX = Math.abs(draggedCorner.x - anchor.x) / imageSize.width;
  const scaleY = Math.abs(draggedCorner.y - anchor.y) / imageSize.height;
  const scale = Math.max(MIN_REFERENCE_SCALE, scaleX, scaleY);
  const width = imageSize.width * scale;
  const height = imageSize.height * scale;

  return {
    x: handle.includes('left') ? anchor.x - width : anchor.x,
    y: handle.includes('top') ? anchor.y - height : anchor.y,
    scale,
  };
}

export function screenDeltaToCanvasDelta(
  startPointer: Point,
  currentPointer: Point,
  zoom: number
): Point {
  const safeZoom = zoom === 0 ? 1 : zoom;

  return {
    x: (currentPointer.x - startPointer.x) / safeZoom,
    y: (currentPointer.y - startPointer.y) / safeZoom,
  };
}

function isEditableReferenceLayer(
  layer: Layer | null | undefined
): layer is Layer & { referenceData: ReferenceLayerData } {
  return layer?.type === 'reference' && layer.visible && !layer.locked && !!layer.referenceData;
}

function isPositiveImageSize(imageSize: ReferenceImageSize): boolean {
  return imageSize.width > 0 && imageSize.height > 0;
}

function createHandles(
  transform: ReferenceLayerTransform,
  imageSize: ReferenceImageSize,
  viewport: ReferenceViewportTransform
): ReferenceTransformHandle[] {
  return (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(
    (position) => {
      const corner = getHandleCorner(transform, imageSize, position);
      return {
        position,
        canvasX: corner.x,
        canvasY: corner.y,
        screenX: canvasToScreen(corner.x, viewport.panX, viewport.zoom),
        screenY: canvasToScreen(corner.y, viewport.panY, viewport.zoom),
        cursor: HANDLE_CURSOR[position],
      };
    }
  );
}

function getHandleCorner(
  transform: ReferenceLayerTransform,
  imageSize: ReferenceImageSize,
  handle: ReferenceTransformHandlePosition
): Point {
  const width = imageSize.width * transform.scale;
  const height = imageSize.height * transform.scale;

  return {
    x: handle.includes('right') ? transform.x + width : transform.x,
    y: handle.includes('bottom') ? transform.y + height : transform.y,
  };
}

function getOppositeCorner(
  transform: ReferenceLayerTransform,
  imageSize: ReferenceImageSize,
  handle: ReferenceTransformHandlePosition
): Point {
  const opposite: Record<ReferenceTransformHandlePosition, ReferenceTransformHandlePosition> = {
    'top-left': 'bottom-right',
    'top-right': 'bottom-left',
    'bottom-left': 'top-right',
    'bottom-right': 'top-left',
  };

  return getHandleCorner(transform, imageSize, opposite[handle]);
}

function canvasToScreen(value: number, pan: number, zoom: number): number {
  return value * zoom + pan;
}
