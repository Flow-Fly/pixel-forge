import { signal } from '../core/signal';
import { type Layer } from '../types/layer';
import { v4 as uuidv4 } from 'uuid';

class LayerStore {
  layers = signal<Layer[]>([]);
  activeLayerId = signal<string | null>(null);

  constructor() {
    // Create initial layer
    this.addLayer();
  }

  addLayer(name?: string, width = 64, height = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // Fill with transparent data explicitly if needed, but new canvas is transparent
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const newLayer: Layer = {
      id: uuidv4(),
      name: name || `Layer ${this.layers.value.length + 1}`,
      type: 'image',
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      parentId: null,
      canvas,
    };

    this.layers.value = [...this.layers.value, newLayer];
    this.activeLayerId.value = newLayer.id;
    return newLayer;
  }

  removeLayer(id: string) {
    this.layers.value = this.layers.value.filter(l => l.id !== id);
    if (this.activeLayerId.value === id) {
      this.activeLayerId.value = this.layers.value.length > 0 ? this.layers.value[this.layers.value.length - 1].id : null;
    }
  }

  updateLayer(id: string, updates: Partial<Layer>) {
    this.layers.value = this.layers.value.map(l => 
      l.id === id ? { ...l, ...updates } : l
    );
  }

  toggleVisibility(id: string) {
    const layer = this.layers.value.find(l => l.id === id);
    if (layer) {
      this.updateLayer(id, { visible: !layer.visible });
    }
  }

  toggleLock(id: string) {
    const layer = this.layers.value.find(l => l.id === id);
    if (layer) {
      this.updateLayer(id, { locked: !layer.locked });
    }
  }

  setActiveLayer(id: string) {
    this.activeLayerId.value = id;
  }

  reorderLayer(id: string, direction: 'up' | 'down') {
    const layers = [...this.layers.value];
    const index = layers.findIndex(l => l.id === id);
    if (index === -1) return;

    if (direction === 'up' && index < layers.length - 1) {
      [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
    } else if (direction === 'down' && index > 0) {
      [layers[index], layers[index - 1]] = [layers[index - 1], layers[index]];
    }

    this.layers.value = layers;
  }
}

export const layerStore = new LayerStore();
