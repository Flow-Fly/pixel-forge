import { signal } from '../core/signal';
import type { Brush } from '../types/brush';

class BrushStore {
  brushes = signal<Brush[]>([
    { id: 'pixel-1', name: '1px Pixel', size: 1, shape: 'square', opacity: 1 },
    { id: 'round-3', name: '3px Round', size: 3, shape: 'circle', opacity: 1 },
    { id: 'round-5', name: '5px Round', size: 5, shape: 'circle', opacity: 1 },
    { id: 'square-3', name: '3px Square', size: 3, shape: 'square', opacity: 1 },
    { id: 'square-5', name: '5px Square', size: 5, shape: 'square', opacity: 1 },
  ]);

  activeBrush = signal<Brush>(this.brushes.value[0]);

  setActiveBrush(brush: Brush) {
    this.activeBrush.value = brush;
  }

  updateActiveBrushSettings(updates: Partial<Brush>) {
    this.activeBrush.value = { ...this.activeBrush.value, ...updates };
  }

  addBrush(brush: Brush) {
    this.brushes.value = [...this.brushes.value, brush];
  }
}

export const brushStore = new BrushStore();
