import { type Rect } from './geometry';

export type SelectionShape = 'rectangle' | 'ellipse' | 'freeform';

export type SelectionState =
  | { type: 'none' }
  | {
      type: 'selecting';
      shape: SelectionShape;
      startPoint: { x: number; y: number };
      currentBounds: Rect;
      previewPath?: { x: number; y: number }[];
    }
  | {
      type: 'selected';
      shape: 'rectangle' | 'ellipse';
      bounds: Rect;
    }
  | {
      type: 'selected';
      shape: 'freeform';
      bounds: Rect;
      mask: Uint8Array;
    }
  | {
      type: 'floating';
      imageData: ImageData;
      originalBounds: Rect;
      currentOffset: { x: number; y: number };
      shape: SelectionShape;
      mask?: Uint8Array;
    }
  | {
      type: 'transforming';
      imageData: ImageData;           // Original pixels (unrotated)
      originalBounds: Rect;           // Where it was cut from
      currentBounds: Rect;            // Expanded bounds after rotation
      currentOffset: { x: number; y: number };  // Movement offset during transform
      rotation: number;               // Degrees (0-360)
      previewData: ImageData | null;  // Nearest-neighbor preview (null until first rotation)
      shape: SelectionShape;
      mask?: Uint8Array;              // Original mask (for freeform)
    };

// Helper type guards
export function isSelected(state: SelectionState): state is SelectionState & { type: 'selected' } {
  return state.type === 'selected';
}

export function isFloating(state: SelectionState): state is SelectionState & { type: 'floating' } {
  return state.type === 'floating';
}

export function isTransforming(state: SelectionState): state is SelectionState & { type: 'transforming' } {
  return state.type === 'transforming';
}

export function hasSelection(state: SelectionState): boolean {
  return state.type === 'selected' || state.type === 'floating' || state.type === 'selecting' || state.type === 'transforming';
}
