/**
 * Pixel font definition for text rendering.
 */
export interface PixelFont {
  /** Display name for UI (e.g., "Pixel 5x7") */
  name: string;
  /** Unique identifier (e.g., "pixel-5x7") */
  id: string;
  /** Fixed width per character in pixels */
  charWidth: number;
  /** Character height in pixels (line height) */
  charHeight: number;
  /** Spacing between characters in pixels */
  charSpacing: number;
  /** Character bitmap data: character -> 2D array of 0/1 values */
  chars: Record<string, number[][]>;
}

/**
 * Text-specific metadata stored at layer level.
 * Style properties that apply to all cels in this text layer.
 */
export interface TextLayerData {
  /** Font identifier (e.g., "pixel-5x7") */
  font: string;
  /** Text color as hex string */
  color: string;
}

/**
 * Text content stored per-cel.
 * Allows different text/position per frame for animation.
 */
export interface TextCelData {
  /** The text string to render */
  content: string;
  /** X position on canvas (in pixels) */
  x: number;
  /** Y position on canvas (in pixels) */
  y: number;
}

/**
 * Text editing state for the text tool.
 */
export interface TextEditingState {
  /** Whether currently in text editing mode */
  isEditing: boolean;
  /** The layer being edited (null if not editing) */
  layerId: string | null;
  /** The cel being edited (null if not editing) */
  celKey: string | null;
  /** Current cursor position (character index) */
  cursorPosition: number;
  /** Whether cursor is currently visible (for blinking) */
  cursorVisible: boolean;
}
