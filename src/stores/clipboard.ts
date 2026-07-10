/**
 * Clipboard Store - Manages copy/cut/paste for selections.
 *
 * Uses an internal buffer for pixel-perfect clipboard operations.
 */

import { signal } from '../core/signal';
import type { SelectionShape } from '../types/selection';

export interface ClipboardIndexedSelection {
  indexData: Uint8Array;
  sourceColors: string[];
  usedIndices: number[];
  shape: SelectionShape;
  mask?: Uint8Array;
  width: number;
  height: number;
}

interface ClipboardData {
  imageData: ImageData;
  shape: SelectionShape;
  mask?: Uint8Array;
  width: number;
  height: number;
  indexedSelection?: ClipboardIndexedSelection;
}

class ClipboardStore {
  private buffer = signal<ClipboardData | null>(null);

  /**
   * Check if the clipboard has data.
   */
  get hasData(): boolean {
    return this.buffer.value !== null;
  }

  /**
   * Get the current clipboard data.
   */
  getData(): ClipboardData | null {
    return this.buffer.value;
  }

  /**
   * Set clipboard data.
   */
  setData(data: ClipboardData): void {
    this.buffer.value = data;
  }

  /**
   * Clear the clipboard.
   */
  clear(): void {
    this.buffer.value = null;
  }
}

export const clipboardStore = new ClipboardStore();
