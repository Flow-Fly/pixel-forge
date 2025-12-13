import { signal } from '../core/signal';
import { type Layer } from '../types/layer';
import type { TextLayerData } from '../types/text';
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

    // Get context with appropriate hints for layer canvases
    const ctx = canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true // Layers are read frequently for compositing and history
    });

    if (ctx) {
      ctx.imageSmoothingEnabled = false;
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

  /**
   * Duplicate an existing layer, copying its canvas content and properties.
   */
  duplicateLayer(sourceLayerId: string): Layer | null {
    const sourceLayer = this.layers.value.find(l => l.id === sourceLayerId);
    if (!sourceLayer || !sourceLayer.canvas) return null;

    // Create new canvas and copy content
    const canvas = document.createElement('canvas');
    canvas.width = sourceLayer.canvas.width;
    canvas.height = sourceLayer.canvas.height;

    const ctx = canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true
    });

    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sourceLayer.canvas, 0, 0);
    }

    const newLayer: Layer = {
      id: uuidv4(),
      name: `${sourceLayer.name} Copy`,
      type: sourceLayer.type,
      visible: sourceLayer.visible,
      locked: false, // Don't copy locked state
      opacity: sourceLayer.opacity,
      blendMode: sourceLayer.blendMode,
      parentId: sourceLayer.parentId,
      canvas,
      // Copy text data if it's a text layer
      textData: sourceLayer.textData ? { ...sourceLayer.textData } : undefined,
    };

    // Insert after the source layer
    const sourceIndex = this.layers.value.findIndex(l => l.id === sourceLayerId);
    const newLayers = [...this.layers.value];
    newLayers.splice(sourceIndex + 1, 0, newLayer);
    this.layers.value = newLayers;
    this.activeLayerId.value = newLayer.id;
    return newLayer;
  }

  /**
   * Add a new text layer.
   * Text layers render text using pixel fonts instead of storing pixel data directly.
   */
  addTextLayer(textData: TextLayerData, name?: string, width = 64, height = 64): Layer {
    // Text layers still have a canvas for rendering, but content is generated from text data
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true
    });

    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const newLayer: Layer = {
      id: uuidv4(),
      name: name || `Text ${this.layers.value.filter(l => l.type === 'text').length + 1}`,
      type: 'text',
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      parentId: null,
      canvas,
      textData,
    };

    this.layers.value = [...this.layers.value, newLayer];
    this.activeLayerId.value = newLayer.id;
    return newLayer;
  }

  /**
   * Check if a layer is a text layer.
   */
  isTextLayer(id: string): boolean {
    const layer = this.layers.value.find(l => l.id === id);
    return layer?.type === 'text';
  }

  /**
   * Get text data for a text layer.
   */
  getTextData(id: string): TextLayerData | undefined {
    const layer = this.layers.value.find(l => l.id === id);
    return layer?.textData;
  }

  /**
   * Update text layer style (font, color).
   */
  updateTextData(id: string, updates: Partial<TextLayerData>): void {
    const layer = this.layers.value.find(l => l.id === id);
    if (layer?.type === 'text' && layer.textData) {
      this.updateLayer(id, {
        textData: { ...layer.textData, ...updates }
      });
    }
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
