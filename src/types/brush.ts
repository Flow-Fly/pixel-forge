// Spacing can be a number (pixels) or "match" (equals brush size)
export type BrushSpacing = number | "match";

// Brush type: builtin (preset) or custom (user-created)
export type BrushType = "builtin" | "custom";

// Image data for custom brushes stored as serializable format
export interface BrushImageData {
  width: number;
  height: number;
  data: number[]; // RGBA values flattened [r,g,b,a, r,g,b,a, ...]
}

export interface Brush {
  id: string;
  name: string;
  type: BrushType;
  size: number;
  shape: "square" | "circle";
  opacity: number;
  pixelPerfect: boolean;
  spacing: BrushSpacing; // Distance between brush stamps (1 = standard, 'match' = brush size)

  // For custom brushes - store as compact RGBA array
  imageData?: BrushImageData;

  // Metadata for custom brushes
  createdAt?: number;
  modifiedAt?: number;
}

// For IndexedDB storage (only custom brushes are persisted)
export interface StoredCustomBrush {
  id: string;
  name: string;
  imageData: BrushImageData;
  spacing: BrushSpacing;
  createdAt: number;
  modifiedAt: number;
}

// Maximum brush size limits
export const BRUSH_SIZE_LIMITS = {
  min: 1,
  defaultMax: 64,
  hardMax: 256,
} as const;
