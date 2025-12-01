export type SelectionType = 'none' | 'rectangle' | 'ellipse' | 'lasso' | 'magic';

export interface Selection {
  type: SelectionType;
  mask: ImageData | null; // 1-bit mask where 1 = selected
  bounds: { x: number; y: number; w: number; h: number } | null;
}
