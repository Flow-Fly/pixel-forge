import { brushStore } from "../stores/brush";
import {
  getActiveProjectContext,
  type ProjectContext,
} from "../stores/project-context";
import type { Brush, BrushImageData } from "../types/brush";
import { BRUSH_SIZE_LIMITS } from "../types/brush";
import { log } from "../utils/log";
import { isReferenceLayer } from "../utils/layer-capabilities";

/**
 * Check if a brush can be captured from the current selection
 */
type BrushCaptureContext = Pick<ProjectContext, "animation" | "layers" | "selection">;

export function canCaptureBrush(
  context: BrushCaptureContext = getActiveProjectContext()
): boolean {
  const state = context.selection.state.value;
  return state.type === "selected" || state.type === "floating";
}

/**
 * Get the current selection bounds and content info
 */
function getSelectionInfo(context: BrushCaptureContext): {
  bounds: { x: number; y: number; width: number; height: number };
  mask?: Uint8Array;
  imageData?: ImageData;
} | null {
  const state = context.selection.state.value;

  if (state.type === "selected") {
    return {
      bounds: state.bounds,
      mask:
        state.shape === "freeform"
          ? (state as { mask: Uint8Array }).mask
          : undefined,
    };
  }

  if (state.type === "floating") {
    // Floating selection has its own imageData
    return {
      bounds: {
        x: state.originalBounds.x + state.currentOffset.x,
        y: state.originalBounds.y + state.currentOffset.y,
        width: state.originalBounds.width,
        height: state.originalBounds.height,
      },
      imageData: state.imageData,
      mask: state.mask,
    };
  }

  return null;
}

/**
 * Capture a brush from the current selection
 * @param name Optional name for the brush (defaults to dimensions)
 * @returns The captured brush or null if capture failed
 */
function captureBrushFromSelection(
  name: string | undefined,
  context: BrushCaptureContext
): Brush | null {
  const info = getSelectionInfo(context);
  if (!info) {
    log.warn("No selection to capture brush from");
    return null;
  }

  const { bounds, mask } = info;

  if (!isValidBrushSize(bounds)) return null;

  const pixelData = readSelectionPixels(info, context);
  if (!pixelData) return null;

  // Apply mask if freeform selection
  if (mask) {
    applyMaskToImageData(pixelData, mask);
  }

  // Check if brush has any non-transparent pixels
  if (!hasVisiblePixels(pixelData)) {
    log.warn("Selection contains no visible pixels");
    return null;
  }

  // Convert to brush format
  const imageData: BrushImageData = {
    width: pixelData.width,
    height: pixelData.height,
    data: Array.from(pixelData.data),
  };

  const brushName = name || `Brush ${bounds.width}x${bounds.height}`;
  const now = Date.now();

  const brush: Brush = {
    id: `custom-${now}`,
    name: brushName,
    type: "custom",
    size: Math.max(bounds.width, bounds.height),
    shape: "square",
    opacity: 1,
    pixelPerfect: false,
    spacing: "match",
    imageData,
    createdAt: now,
    modifiedAt: now,
  };

  return brush;
}

function isValidBrushSize(bounds: { width: number; height: number }): boolean {
  if (
    bounds.width > BRUSH_SIZE_LIMITS.hardMax ||
    bounds.height > BRUSH_SIZE_LIMITS.hardMax
  ) {
    log.warn(
      `Selection too large. Maximum size is ${BRUSH_SIZE_LIMITS.hardMax}x${BRUSH_SIZE_LIMITS.hardMax}`
    );
    return false;
  }

  if (
    bounds.width < BRUSH_SIZE_LIMITS.min ||
    bounds.height < BRUSH_SIZE_LIMITS.min
  ) {
    log.warn("Selection too small");
    return false;
  }

  return true;
}

function readSelectionPixels(
  info: NonNullable<ReturnType<typeof getSelectionInfo>>,
  context: BrushCaptureContext
): ImageData | null {
  if (info.imageData) {
    return info.imageData;
  }

  const activeLayerId = context.layers.activeLayerId.value;
  const currentFrame = context.animation.currentFrameId.value;

  if (!activeLayerId) {
    log.warn("No active layer");
    return null;
  }

  const activeLayer = context.layers.layers.value.find((layer) => layer.id === activeLayerId);
  if (isReferenceLayer(activeLayer)) {
    log.warn("Reference layers cannot be captured as brushes");
    return null;
  }

  const canvas = context.animation.getCelCanvas(currentFrame, activeLayerId);
  if (!canvas) {
    log.warn("No canvas available to capture brush from");
    return null;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    log.warn("Could not get canvas context");
    return null;
  }

  return ctx.getImageData(
    info.bounds.x,
    info.bounds.y,
    info.bounds.width,
    info.bounds.height
  );
}

/**
 * Apply a selection mask to image data (clear pixels outside mask)
 */
function applyMaskToImageData(imageData: ImageData, mask: Uint8Array): void {
  const { data } = imageData;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 255) {
      // Clear pixels outside mask
      const pixelIndex = i * 4;
      data[pixelIndex + 3] = 0; // Set alpha to 0
    }
  }
}

/**
 * Check if image data has any visible (non-transparent) pixels
 */
function hasVisiblePixels(imageData: ImageData): boolean {
  const { data } = imageData;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return true;
  }
  return false;
}

/**
 * Capture brush from selection and add to brush store
 * Returns the captured brush or null if capture failed
 */
export async function captureBrushAndAdd(
  name?: string,
  context: BrushCaptureContext = getActiveProjectContext()
): Promise<Brush | null> {
  const brush = captureBrushFromSelection(name, context);
  if (!brush) return null;

  await brushStore.addCustomBrush(brush);
  brushStore.setActiveBrush(brush);

  // Dispatch event for UI notification
  window.dispatchEvent(
    new CustomEvent("brush-captured", {
      detail: { brush },
    })
  );

  return brush;
}
