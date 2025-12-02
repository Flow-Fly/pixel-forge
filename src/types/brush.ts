export interface Brush {
  id: string;
  name: string;
  size: number;
  shape: 'circle' | 'square';
  opacity: number;
  pixelPerfect: boolean;
  pattern?: number[][]; // Optional 2D array for custom patterns (0-1 values)
}
