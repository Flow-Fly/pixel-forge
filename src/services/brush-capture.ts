import { selectionStore } from "../stores/selection";
import { layerStore } from "../stores/layers";
import { animationStore } from "../stores/animation";
import { brushStore } from "../stores/brush";
import type { Brush, BrushImageData } from "../types/brush";
import { BRUSH_SIZE_LIMITS } from "../types/brush";

/**
 * Check if a brush can be captured from the current selection
 */
export function canCaptureBrush(): boolean {
  const state = selectionStore.state.value;
  return state.type === "selected" || state.type === "floating";
}

/**
 * Get the current selection bounds and content info
 */
function getSelectionInfo(): {
  bounds: { x: number; y: number; width: number; height: number };
  mask?: Uint8Array;
  imageData?: ImageData;
} | null {
  const state = selectionStore.state.value;

  if (state.type === "selected") {
    return {
      bounds: state.bounds,
      mask: state.shape === "freeform" ? (state as { mask: Uint8Array }).mask : undefined,
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
export function captureBrushFromSelection(name?: string): Brush | null {
  const info = getSelectionInfo();
  if (!info) {
    console.warn("No selection to capture brush from");
    return null;
  }

  const { bounds, mask } = info;

  // Validate size
  if (bounds.width > BRUSH_SIZE_LIMITS.hardMax || bounds.height > BRUSH_SIZE_LIMITS.hardMax) {
    console.warn(`Selection too large. Maximum size is ${BRUSH_SIZE_LIMITS.hardMax}x${BRUSH_SIZE_LIMITS.hardMax}`);
    return null;
  }

  if (bounds.width < BRUSH_SIZE_LIMITS.min || bounds.height < BRUSH_SIZE_LIMITS.min) {
    console.warn("Selection too small");
    return null;
  }

  // Get pixel data
  let pixelData: ImageData;

  if (info.imageData) {
    // Floating selection already has imageData
    pixelData = info.imageData;
  } else {
    // Get from active layer's canvas
    const activeLayerId = layerStore.activeLayerId.value;
    const currentFrame = animationStore.currentFrameId.value;

    if (!activeLayerId) {
      console.warn("No active layer");
      return null;
    }

    const canvas = animationStore.getCelCanvas(currentFrame, activeLayerId);

    if (!canvas) {
      console.warn("No canvas available to capture brush from");
      return null;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("Could not get canvas context");
      return null;
    }

    pixelData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  // Apply mask if freeform selection
  if (mask) {
    applyMaskToImageData(pixelData, mask);
  }

  // Check if brush has any non-transparent pixels
  if (!hasVisiblePixels(pixelData)) {
    console.warn("Selection contains no visible pixels");
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
export async function captureBrushAndAdd(name?: string): Promise<Brush | null> {
  const brush = captureBrushFromSelection(name);
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
