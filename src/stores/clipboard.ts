import { signal } from "../core/signal";
import { type SelectionShape } from "../types/selection";
import { type Rect } from "../types/geometry";

/**
 * Data stored in the clipboard after a copy operation.
 */
export interface ClipboardData {
  imageData: ImageData; // RGBA pixel data
  bounds: Rect; // Original bounds (width/height for sizing)
  shape: SelectionShape; // rectangle, ellipse, or freeform
  mask?: Uint8Array; // For freeform selections
}

/**
 * Internal clipboard store for copy/paste operations.
 * Stores pixel data between copy and paste operations.
 */
class ClipboardStore {
  // The clipboard contents (null if empty)
  data = signal<ClipboardData | null>(null);

  /**
   * Check if there's data available to paste.
   */
  get hasData(): boolean {
    return this.data.value !== null;
  }

  /**
   * Store pixel data in clipboard.
   * Creates a deep copy of the ImageData to avoid mutations.
   */
  copy(
    imageData: ImageData,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array
  ) {
    // Deep copy ImageData
    const copiedData = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );

    // Deep copy mask if present
    const copiedMask = mask ? new Uint8Array(mask) : undefined;

    this.data.value = {
      imageData: copiedData,
      bounds: { ...bounds },
      shape,
      mask: copiedMask,
    };
  }

  /**
   * Clear clipboard contents.
   */
  clear() {
    this.data.value = null;
  }

  /**
   * Get clipboard data for pasting.
   * Returns a deep copy to prevent mutation.
   */
  getData(): ClipboardData | null {
    const current = this.data.value;
    if (!current) return null;

    // Return deep copy
    return {
      imageData: new ImageData(
        new Uint8ClampedArray(current.imageData.data),
        current.imageData.width,
        current.imageData.height
      ),
      bounds: { ...current.bounds },
      shape: current.shape,
      mask: current.mask ? new Uint8Array(current.mask) : undefined,
    };
  }
}

export const clipboardStore = new ClipboardStore();
