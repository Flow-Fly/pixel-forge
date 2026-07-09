import { type Command } from './index';
import { getActiveProjectContext, type ProjectContext } from '../stores/project-context';
import { type Layer } from '../types/layer';
import { type Cel } from '../types/animation';
import type { ReferenceLayerTransform } from '../services/reference-transform-geometry';

type LayerCommandContext = Pick<ProjectContext, 'animation' | 'layers' | 'project'>;
type ReferenceTransformCommandContext = Pick<ProjectContext, 'dirtyRect' | 'layers'>;

export class AddLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Add Layer';
  private layerId: string | null = null;
  private readonly context: LayerCommandContext;

  constructor(context: LayerCommandContext = getActiveProjectContext()) {
    this.context = context;
  }

  execute() {
    const width = this.context.project.width.value;
    const height = this.context.project.height.value;
    const layer = this.context.layers.addLayer(undefined, width, height);
    this.layerId = layer.id;
  }

  undo() {
    if (this.layerId) {
      this.context.layers.removeLayer(this.layerId);
    }
  }
}

export class DuplicateLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Duplicate Layer';
  private sourceLayerId: string;
  private newLayerId: string | null = null;
  private duplicatedCelKeys: string[] = [];
  private readonly context: LayerCommandContext;

  constructor(sourceLayerId: string, context: LayerCommandContext = getActiveProjectContext()) {
    this.sourceLayerId = sourceLayerId;
    this.context = context;
  }

  execute() {
    const newLayer = this.context.layers.duplicateLayer(this.sourceLayerId);
    this.newLayerId = newLayer?.id ?? null;

    if (this.newLayerId) {
      // Duplicate all cels for this layer
      this.duplicateCels(this.sourceLayerId, this.newLayerId);
    }
  }

  private duplicateCels(sourceLayerId: string, newLayerId: string) {
    const frames = this.context.animation.frames.value;
    const cels = this.context.animation.cels.value;
    const newCels = new Map(cels);

    // Track which linkedCelIds map to new linkedCelIds (to preserve link groups)
    const linkIdMap = new Map<string, string>();

    for (const frame of frames) {
      const sourceKey = this.context.animation.getCelKey(sourceLayerId, frame.id);
      const sourceCel = cels.get(sourceKey);

      if (sourceCel) {
        const newKey = this.context.animation.getCelKey(newLayerId, frame.id);

        // Create new canvas and copy content
        const newCanvas = document.createElement('canvas');
        newCanvas.width = sourceCel.canvas.width;
        newCanvas.height = sourceCel.canvas.height;
        const ctx = newCanvas.getContext('2d', {
          alpha: true,
          willReadFrequently: true,
        });
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

    this.context.animation.cels.value = newCels;
  }

  undo() {
    if (this.newLayerId) {
      // Remove duplicated cels
      const cels = this.context.animation.cels.value;
      const newCels = new Map(cels);
      for (const key of this.duplicatedCelKeys) {
        newCels.delete(key);
      }
      this.context.animation.cels.value = newCels;
      this.duplicatedCelKeys = [];

      // Remove the layer
      this.context.layers.removeLayer(this.newLayerId);
    }
  }
}

export class RemoveLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Remove Layer';
  private layer: Layer;
  private index: number;
  private readonly context: LayerCommandContext;

  constructor(layerId: string, context: LayerCommandContext = getActiveProjectContext()) {
    this.context = context;

    const layer = this.context.layers.layers.value.find((l) => l.id === layerId);
    if (!layer) throw new Error('Layer not found');
    this.layer = { ...layer }; // Clone
    this.index = this.context.layers.layers.value.findIndex((l) => l.id === layerId);
  }

  execute() {
    this.context.layers.removeLayer(this.layer.id);
  }

  undo() {
    // We need to insert it back at the specific index
    // The store cannot insert an existing layer at an index, so restore the array.

    const layers = [...this.context.layers.layers.value];
    layers.splice(this.index, 0, this.layer);
    this.context.layers.layers.value = layers;
    this.context.layers.activeLayerId.value = this.layer.id;
  }
}

export class UpdateLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Update Layer';
  private layerId: string;
  private oldUpdates: Partial<Layer>;
  private newUpdates: Partial<Layer>;
  private readonly context: LayerCommandContext;

  constructor(
    layerId: string,
    updates: Partial<Layer>,
    context: LayerCommandContext = getActiveProjectContext()
  ) {
    this.layerId = layerId;
    this.newUpdates = updates;
    this.context = context;

    const layer = this.context.layers.layers.value.find((l) => l.id === layerId);
    if (!layer) throw new Error('Layer not found');

    this.oldUpdates = {};
    for (const key in updates) {
      // @ts-expect-error — keyof mapping between Partial<Layer> and Layer
      this.oldUpdates[key] = layer[key];
    }
  }

  execute() {
    this.context.layers.updateLayer(this.layerId, this.newUpdates);
  }

  undo() {
    this.context.layers.updateLayer(this.layerId, this.oldUpdates);
  }
}

export class TransformReferenceLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Transform Reference Layer';
  private readonly layerId: string;
  private readonly oldTransform: ReferenceLayerTransform;
  private readonly newTransform: ReferenceLayerTransform;
  private readonly context: ReferenceTransformCommandContext;

  constructor(
    layerId: string,
    oldTransform: ReferenceLayerTransform,
    newTransform: ReferenceLayerTransform,
    context: ReferenceTransformCommandContext = getActiveProjectContext()
  ) {
    this.layerId = layerId;
    this.oldTransform = oldTransform;
    this.newTransform = newTransform;
    this.context = context;
  }

  execute() {
    this.applyTransform(this.newTransform);
  }

  undo() {
    this.applyTransform(this.oldTransform);
  }

  private applyTransform(transform: ReferenceLayerTransform) {
    const layer = this.context.layers.layers.value.find((item) => item.id === this.layerId);
    if (layer?.type !== 'reference' || !layer.referenceData) return;

    this.context.layers.updateLayer(this.layerId, {
      referenceData: {
        ...layer.referenceData,
        ...transform,
      },
    });
    this.context.dirtyRect.requestFullRedraw();
  }
}
// ... existing commands ...

export class FlipLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Flip Layer';
  private layerId: string;
  private direction: 'horizontal' | 'vertical';
  private readonly context: LayerCommandContext;

  constructor(
    layerId: string,
    direction: 'horizontal' | 'vertical',
    context: LayerCommandContext = getActiveProjectContext()
  ) {
    this.layerId = layerId;
    this.direction = direction;
    this.context = context;
    this.name = `Flip Layer ${direction}`;
  }

  execute() {
    this.flip();
  }

  undo() {
    this.flip(); // Flipping again undoes the action
  }

  private flip() {
    const layer = this.context.layers.layers.value.find((l) => l.id === this.layerId);
    if (!layer || !layer.canvas) return;

    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    const width = layer.canvas.width;
    const height = layer.canvas.height;

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
    this.context.layers.updateLayer(this.layerId, {});
  }
}

export class RotateLayerCommand implements Command {
  id = crypto.randomUUID();
  name = 'Rotate Layer';
  private layerId: string;
  private angle: number; // 90, 180, -90
  private readonly context: LayerCommandContext;

  constructor(
    layerId: string,
    angle: number,
    context: LayerCommandContext = getActiveProjectContext()
  ) {
    this.layerId = layerId;
    this.angle = angle;
    this.context = context;
    this.name = `Rotate Layer ${angle}°`;
  }

  execute() {
    this.rotate(this.angle);
  }

  undo() {
    this.rotate(-this.angle);
  }

  private rotate(angle: number) {
    const layer = this.context.layers.layers.value.find((l) => l.id === this.layerId);
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
    tempCtx.rotate((angle * Math.PI) / 180);
    tempCtx.translate(-width / 2, -height / 2);
    tempCtx.drawImage(layer.canvas, 0, 0);
    tempCtx.restore();

    // Update layer canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0);

    // Trigger update
    this.context.layers.updateLayer(this.layerId, {});
  }
}

export class GroupLayersCommand implements Command {
  id = crypto.randomUUID();
  name = 'Group Layers';
  private layerIds: string[];
  private groupId: string | null = null;
  private originalParentIds: Map<string, string | null> = new Map();
  private originalLayerOrder: string[] = [];
  private readonly context: LayerCommandContext;

  constructor(layerIds: string[], context: LayerCommandContext = getActiveProjectContext()) {
    this.layerIds = layerIds;
    this.context = context;
    // Store original state for undo
    for (const id of layerIds) {
      const layer = this.context.layers.layers.value.find((l) => l.id === id);
      if (layer) {
        this.originalParentIds.set(id, layer.parentId);
      }
    }
    this.originalLayerOrder = this.context.layers.layers.value.map((l) => l.id);
  }

  execute() {
    this.groupId = this.context.layers.createGroup(this.layerIds);
  }

  undo() {
    if (!this.groupId) return;

    // Restore original parent IDs
    const layers = this.context.layers.layers.value.map((l) => {
      if (this.originalParentIds.has(l.id)) {
        return { ...l, parentId: this.originalParentIds.get(l.id) ?? null };
      }
      return l;
    });

    // Remove the group layer and restore order
    const withoutGroup = layers.filter((l) => l.id !== this.groupId);
    const reordered: Layer[] = [];

    for (const id of this.originalLayerOrder) {
      const layer = withoutGroup.find((l) => l.id === id);
      if (layer) {
        reordered.push(layer);
      }
    }

    this.context.layers.layers.value = reordered;

    // Select first of the original layers
    if (this.layerIds.length > 0) {
      this.context.layers.activeLayerId.value = this.layerIds[0];
    }
  }
}

export class UngroupLayersCommand implements Command {
  id = crypto.randomUUID();
  name = 'Ungroup Layers';
  private groupId: string;
  private groupLayer: Layer | null = null;
  private childIds: string[] = [];
  private originalLayerOrder: string[] = [];
  private readonly context: LayerCommandContext;

  constructor(groupId: string, context: LayerCommandContext = getActiveProjectContext()) {
    this.groupId = groupId;
    this.context = context;
    // Store original state for undo
    const group = this.context.layers.layers.value.find((l) => l.id === groupId);
    if (group) {
      this.groupLayer = { ...group };
    }
    this.childIds = this.context.layers.getGroupChildren(groupId).map((l) => l.id);
    this.originalLayerOrder = this.context.layers.layers.value.map((l) => l.id);
  }

  execute() {
    this.context.layers.ungroup(this.groupId);
  }

  undo() {
    if (!this.groupLayer) return;

    // Restore children's parentId and add the group back
    const layers = this.context.layers.layers.value.map((l) => {
      if (this.childIds.includes(l.id)) {
        return { ...l, parentId: this.groupId };
      }
      return l;
    });

    // Restore original order with group
    const reordered: Layer[] = [];
    for (const id of this.originalLayerOrder) {
      if (id === this.groupId) {
        reordered.push(this.groupLayer);
      } else {
        const layer = layers.find((l) => l.id === id);
        if (layer) {
          reordered.push(layer);
        }
      }
    }

    this.context.layers.layers.value = reordered;
    this.context.layers.activeLayerId.value = this.groupId;
  }
}
