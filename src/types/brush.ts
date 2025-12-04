// Spacing can be a number (pixels) or "match" (equals brush size)
export type BrushSpacing = number | 'match';

export interface Brush {
  id: string;
  name: string;
  size: number;
  shape: 'circle' | 'square';
  opacity: number;
  pixelPerfect: boolean;
  spacing: BrushSpacing; // Distance between brush stamps (1 = standard, 'match' = brush size)
  pattern?: number[][]; // Optional 2D array for custom patterns (0-1 values)
}
