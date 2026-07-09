import { type Rect } from './geometry';

export type SelectionShape = 'rectangle' | 'ellipse' | 'freeform';

export interface FloatingIndexedPaste {
  remappedIndexData: Uint8Array;
  paletteBeforeCommit: {
    colors: string[];
    newColorFlags: Set<string>;
  };
}

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
      indexedPaste?: FloatingIndexedPaste;
    }
  | {
      type: 'transforming';
      imageData: ImageData;           // Original pixels (unrotated, unscaled)
      originalBounds: Rect;           // Where it was cut from
      currentBounds: Rect;            // Expanded bounds after rotation/scale
      currentOffset: { x: number; y: number };  // Movement offset during transform
      rotation: number;               // Degrees (0-360)
      scale: { x: number; y: number }; // Scale factors (1.0 = original)
      previewData: ImageData | null;  // Nearest-neighbor preview (null until first transform)
      shape: SelectionShape;
      mask?: Uint8Array;              // Original mask (for freeform)
    };
