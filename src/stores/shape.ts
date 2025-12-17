/**
 * Shape Store
 *
 * Wrapper around shapeSettings from tool-settings.ts for backwards compatibility.
 * The context bar and shape tools all use shapeSettings directly.
 */
import { shapeSettings } from "./tool-settings";

class ShapeStore {
  // Whether shapes should be filled or just outlines
  // Points to the same signal as shapeSettings.fill
  get filled() {
    return shapeSettings.fill;
  }

  // Stroke width for shape outlines
  // Points to the same signal as shapeSettings.thickness
  get strokeWidth() {
    return shapeSettings.thickness;
  }

  setFilled(filled: boolean) {
    shapeSettings.fill.value = filled;
  }

  setStrokeWidth(width: number) {
    shapeSettings.thickness.value = Math.max(1, Math.min(width, 10));
  }

  toggleFilled() {
    shapeSettings.fill.value = !shapeSettings.fill.value;
  }
}

export const shapeStore = new ShapeStore();
