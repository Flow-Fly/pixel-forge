import { signal } from '../core/signal';
import { type Layer } from '../types/layer';
import type { TextLayerData } from '../types/text';
import { v4 as uuidv4 } from 'uuid';
import { createLayerCanvas } from '../utils/canvas-factory';

class LayerStore {
  layers = signal<Layer[]>([]);
  activeLayerId = signal<string | null>(null);

  constructor() {
    // Create initial layer
    this.addLayer();
  }

  addLayer(name?: string, width = 64, height = 64) {
    const { canvas, ctx } = createLayerCanvas(width, height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
    const { canvas, ctx } = createLayerCanvas(
      sourceLayer.canvas.width,
      sourceLayer.canvas.height
    );
    ctx.drawImage(sourceLayer.canvas, 0, 0);

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
    const { canvas, ctx } = createLayerCanvas(width, height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  toggleContinuous(id: string) {
    const layer = this.layers.value.find(l => l.id === id);
    if (layer) {
      this.updateLayer(id, { continuous: !layer.continuous });
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

  /**
   * Create a group layer containing the specified layers.
   * Returns the group layer ID, or null if grouping failed.
   */
  createGroup(layerIds: string[], groupName?: string): string | null {
    if (layerIds.length === 0) return null;

    const layers = this.layers.value;
    const layersToGroup = layers.filter(l => layerIds.includes(l.id));

    // Don't group layers that are already in different groups
    const parentIds = new Set(layersToGroup.map(l => l.parentId));
    if (parentIds.size > 1) return null;

    // Create the group layer
    const groupId = uuidv4();
    const groupLayer: Layer = {
      id: groupId,
      name: groupName || `Group ${layers.filter(l => l.type === 'group').length + 1}`,
      type: 'group',
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      parentId: layersToGroup[0]?.parentId || null, // Inherit parent from first layer
    };

    // Find the position to insert the group (where the topmost layer is)
    const indices = layerIds.map(id => layers.findIndex(l => l.id === id)).filter(i => i !== -1);
    const insertIndex = Math.max(...indices);

    // Build new layers array:
    // 1. Insert group at the position of the topmost layer
    // 2. Update parentId of grouped layers
    // 3. Move grouped layers right after the group
    const newLayers = layers.filter(l => !layerIds.includes(l.id));

    // Update parentId for grouped layers
    const groupedLayers = layersToGroup.map(l => ({
      ...l,
      parentId: groupId,
    }));

    // Insert group and its children at the correct position
    const adjustedIndex = Math.min(insertIndex, newLayers.length);
    newLayers.splice(adjustedIndex, 0, groupLayer, ...groupedLayers);

    this.layers.value = newLayers;
    this.activeLayerId.value = groupId;
    return groupId;
  }

  /**
   * Ungroup a group layer, moving its children to the group's parent.
   * Returns the IDs of the ungrouped layers, or null if ungrouping failed.
   */
  ungroup(groupId: string): string[] | null {
    const layers = this.layers.value;
    const group = layers.find(l => l.id === groupId);

    if (!group || group.type !== 'group') return null;

    // Find children of this group
    const children = layers.filter(l => l.parentId === groupId);
    if (children.length === 0) {
      // Empty group - just remove it
      this.layers.value = layers.filter(l => l.id !== groupId);
      return [];
    }

    // Move children to the group's parent and remove the group
    const newLayers = layers
      .filter(l => l.id !== groupId)
      .map(l => {
        if (l.parentId === groupId) {
          return { ...l, parentId: group.parentId };
        }
        return l;
      });

    this.layers.value = newLayers;

    // Select the first child
    if (children.length > 0) {
      this.activeLayerId.value = children[0].id;
    }

    return children.map(c => c.id);
  }

  /**
   * Get all children of a group layer (direct children only).
   */
  getGroupChildren(groupId: string): Layer[] {
    return this.layers.value.filter(l => l.parentId === groupId);
  }

  /**
   * Check if a layer is inside a group.
   */
  isInGroup(layerId: string): boolean {
    const layer = this.layers.value.find(l => l.id === layerId);
    return layer?.parentId !== null;
  }
}

export const layerStore = new LayerStore();
