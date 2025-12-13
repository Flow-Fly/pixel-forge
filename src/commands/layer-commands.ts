import { type Command } from './index';
import { layerStore } from '../stores/layers';
import { animationStore } from '../stores/animation';
import { projectStore } from '../stores/project';
import { type Layer } from '../types/layer';
import { type Cel } from '../types/animation';

export class AddLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Add Layer';
  private layerId: string | null = null;

  execute() {
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    const layer = layerStore.addLayer(undefined, width, height);
    this.layerId = layer.id;
  }

  undo() {
    if (this.layerId) {
      layerStore.removeLayer(this.layerId);
    }
  }
}

export class DuplicateLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Duplicate Layer';
  private sourceLayerId: string;
  private newLayerId: string | null = null;
  private duplicatedCelKeys: string[] = [];

  constructor(sourceLayerId: string) {
    this.sourceLayerId = sourceLayerId;
  }

  execute() {
    const newLayer = layerStore.duplicateLayer(this.sourceLayerId);
    this.newLayerId = newLayer?.id ?? null;

    if (this.newLayerId) {
      // Duplicate all cels for this layer
      this.duplicateCels(this.sourceLayerId, this.newLayerId);
    }
  }

  private duplicateCels(sourceLayerId: string, newLayerId: string) {
    const frames = animationStore.frames.value;
    const cels = animationStore.cels.value;
    const newCels = new Map(cels);

    // Track which linkedCelIds map to new linkedCelIds (to preserve link groups)
    const linkIdMap = new Map<string, string>();

    for (const frame of frames) {
      const sourceKey = animationStore.getCelKey(sourceLayerId, frame.id);
      const sourceCel = cels.get(sourceKey);

      if (sourceCel) {
        const newKey = animationStore.getCelKey(newLayerId, frame.id);

        // Create new canvas and copy content
        const newCanvas = document.createElement('canvas');
        newCanvas.width = sourceCel.canvas.width;
        newCanvas.height = sourceCel.canvas.height;
        const ctx = newCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sourceCel.canvas, 0, 0);
        }

        // Map old linkedCelId to new one (preserve link groups within the duplicated layer)
        let newLinkedCelId: string | undefined;
        if (sourceCel.linkedCelId) {
          if (!linkIdMap.has(sourceCel.linkedCelId)) {
            linkIdMap.set(sourceCel.linkedCelId, crypto.randomUUID());
          }
          newLinkedCelId = linkIdMap.get(sourceCel.linkedCelId);
        }

        const newCel: Cel = {
          id: crypto.randomUUID(),
          layerId: newLayerId,
          frameId: frame.id,
          canvas: newCanvas,
          linkedCelId: newLinkedCelId,
          linkType: sourceCel.linkType,
          opacity: sourceCel.opacity,
          textCelData: sourceCel.textCelData ? { ...sourceCel.textCelData } : undefined,
        };

        newCels.set(newKey, newCel);
        this.duplicatedCelKeys.push(newKey);
      }
    }

    animationStore.cels.value = newCels;
  }

  undo() {
    if (this.newLayerId) {
      // Remove duplicated cels
      const cels = animationStore.cels.value;
      const newCels = new Map(cels);
      for (const key of this.duplicatedCelKeys) {
        newCels.delete(key);
      }
      animationStore.cels.value = newCels;
      this.duplicatedCelKeys = [];

      // Remove the layer
      layerStore.removeLayer(this.newLayerId);
    }
  }
}

export class RemoveLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Remove Layer';
  private layer: Layer;
  private index: number;

  constructor(layerId: string) {
    const layer = layerStore.layers.value.find(l => l.id === layerId);
    if (!layer) throw new Error('Layer not found');
    this.layer = { ...layer }; // Clone
    this.index = layerStore.layers.value.findIndex(l => l.id === layerId);
  }

  execute() {
    layerStore.removeLayer(this.layer.id);
  }

  undo() {
    // We need to insert it back at the specific index
    // layerStore.addLayer doesn't support index or restoring existing object
    // We might need to extend layerStore or manually manipulate the array
    
    const layers = [...layerStore.layers.value];
    layers.splice(this.index, 0, this.layer);
    layerStore.layers.value = layers;
    layerStore.activeLayerId.value = this.layer.id;
  }
}

export class UpdateLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Update Layer';
  private layerId: string;
  private oldUpdates: Partial<Layer>;
  private newUpdates: Partial<Layer>;

  constructor(layerId: string, updates: Partial<Layer>) {
    this.layerId = layerId;
    this.newUpdates = updates;
    
    const layer = layerStore.layers.value.find(l => l.id === layerId);
    if (!layer) throw new Error('Layer not found');
    
    this.oldUpdates = {};
    for (const key in updates) {
      // @ts-ignore
      this.oldUpdates[key] = layer[key];
    }
  }

  execute() {
    layerStore.updateLayer(this.layerId, this.newUpdates);
  }

  undo() {
    layerStore.updateLayer(this.layerId, this.oldUpdates);
  }
}
// ... existing commands ...

export class FlipLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Flip Layer';
  private layerId: string;
  private direction: 'horizontal' | 'vertical';

  constructor(layerId: string, direction: 'horizontal' | 'vertical') {
    this.layerId = layerId;
    this.direction = direction;
    this.name = `Flip Layer ${direction}`;
  }

  execute() {
    this.flip();
  }

  undo() {
    this.flip(); // Flipping again undoes the action
  }

  private flip() {
    const layer = layerStore.layers.value.find(l => l.id === this.layerId);
    if (!layer || !layer.canvas) return;

    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    const width = layer.canvas.width;
    const height = layer.canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);

    // Create temp canvas to draw flipped
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;

    tempCtx.save();
    if (this.direction === 'horizontal') {
      tempCtx.scale(-1, 1);
      tempCtx.drawImage(layer.canvas, -width, 0);
    } else {
      tempCtx.scale(1, -1);
      tempCtx.drawImage(layer.canvas, 0, -height);
    }
    tempCtx.restore();

    // Update layer canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0);
    
    // Trigger update
    layerStore.updateLayer(this.layerId, {}); 
  }
}

export class RotateLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Rotate Layer';
  private layerId: string;
  private angle: number; // 90, 180, -90

  constructor(layerId: string, angle: number) {
    this.layerId = layerId;
    this.angle = angle;
    this.name = `Rotate Layer ${angle}°`;
  }

  execute() {
    this.rotate(this.angle);
  }

  undo() {
    this.rotate(-this.angle);
  }

  private rotate(angle: number) {
    const layer = layerStore.layers.value.find(l => l.id === this.layerId);
    if (!layer || !layer.canvas) return;

    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    const width = layer.canvas.width;
    const height = layer.canvas.height;
    
    // Create temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;

    tempCtx.save();
    tempCtx.translate(width / 2, height / 2);
    tempCtx.rotate(angle * Math.PI / 180);
    tempCtx.translate(-width / 2, -height / 2);
    tempCtx.drawImage(layer.canvas, 0, 0);
    tempCtx.restore();

    // Update layer canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0);
    
    // Trigger update
    layerStore.updateLayer(this.layerId, {});
  }
}
