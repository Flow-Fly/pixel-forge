import { signal } from "../core/signal";

class ShapeStore {
  // Whether shapes should be filled or just outlines
  filled = signal(false);

  // Stroke width for shape outlines
  strokeWidth = signal(1);

  setFilled(filled: boolean) {
    this.filled.value = filled;
  }

  setStrokeWidth(width: number) {
    this.strokeWidth.value = Math.max(1, Math.min(width, 10));
  }

  toggleFilled() {
    console.log("Toggling filled state");
    this.filled.value = !this.filled.value;
  }
}

export const shapeStore = new ShapeStore();
