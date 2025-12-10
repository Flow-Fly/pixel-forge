import { signal } from '../core/signal';
import { layerStore } from './layers';
import { animationStore } from './animation';
import { historyStore } from './history';
import { persistenceService } from '../services/persistence/indexed-db';
import { canvasToPngBytes, loadImageDataToCanvas } from '../utils/canvas-binary';
import { PROJECT_VERSION, type ProjectFile } from '../types/project';

/**
 * Check if image data has content.
 * Handles string (Base64), Uint8Array, and serialized Uint8Array (object with numeric keys from JSON).
 */
function hasImageData(data: string | Uint8Array | Record<string, number>): boolean {
  if (typeof data === 'string') return data.length > 0;
  if (data instanceof Uint8Array) return data.length > 0;
  // Serialized Uint8Array from JSON has numeric keys
  return Object.keys(data).length > 0;
}

class ProjectStore {
  width = signal(64);
  height = signal(64);
  /** Background color for export. null = transparent (default) */
  backgroundColor = signal<string | null>(null);
  /** Project name for display */
  name = signal('Untitled');
  /** Timestamp of last auto-save */
  lastSaved = signal<number | null>(null);

  setSize(width: number, height: number) {
    this.width.value = width;
    this.height.value = height;
  }

  resizeCanvas(newWidth: number, newHeight: number) {
    this.width.value = newWidth;
    this.height.value = newHeight;
  }

  async saveProject(): Promise<ProjectFile> {
    // Convert layers to binary format (including text layer metadata)
    const layers = await Promise.all(
      layerStore.layers.value.map(async layer => ({
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        data: layer.canvas
          ? await canvasToPngBytes(layer.canvas)
          : new Uint8Array(0),
        // Include text layer metadata if present
        ...(layer.textData && { textData: layer.textData })
      }))
    );

    // Convert frames/cels to binary format (including text cel data)
    const frames = await Promise.all(
      animationStore.frames.value.map(async frame => {
        const cels = await Promise.all(
          layerStore.layers.value.map(async layer => {
            const canvas = animationStore.getCelCanvas(frame.id, layer.id);
            const textCelData = animationStore.getTextCelData(layer.id, frame.id);
            return {
              layerId: layer.id,
              data: canvas
                ? await canvasToPngBytes(canvas)
                : new Uint8Array(0),
              // Include text cel data if present
              ...(textCelData && { textCelData })
            };
          })
        );

        return {
          id: frame.id,
          duration: frame.duration,
          cels
        };
      })
    );

    const currentFrameIndex = animationStore.frames.value.findIndex(
      f => f.id === animationStore.currentFrameId.value
    );

    return {
      version: PROJECT_VERSION,
      name: this.name.value,
      width: this.width.value,
      height: this.height.value,
      layers,
      frames,
      animation: {
        fps: animationStore.fps.value,
        currentFrameIndex: currentFrameIndex === -1 ? 0 : currentFrameIndex
      },
      tags: animationStore.tags.value
    };
  }

  async loadProject(file: ProjectFile) {
    // 1. Set dimensions and name
    this.setSize(file.width, file.height);
    this.name.value = file.name || 'Untitled';

    // 2. Restore Layers
    // Clear all layers (layerStore.removeLayer doesn't have a "last layer" guard)
    while (layerStore.layers.value.length > 0) {
      layerStore.removeLayer(layerStore.layers.value[0].id);
    }

    for (const l of file.layers) {
      // Check layer type (default to 'image' for backwards compatibility with pre-v2.1 files)
      const layerType = l.type || 'image';

      let layer;
      if (layerType === 'text' && l.textData) {
        // Create text layer with its metadata
        layer = layerStore.addTextLayer(l.textData, l.name, file.width, file.height);
      } else {
        // Create regular image layer
        layer = layerStore.addLayer(l.name, file.width, file.height);
      }

      layer.id = l.id;
      layer.visible = l.visible;
      layer.opacity = l.opacity;
      layer.blendMode = l.blendMode || 'normal';

      // Handle both Base64 (v1.x) and binary (v2.0+) formats for raster data
      if (hasImageData(l.data) && layer.canvas) {
        await loadImageDataToCanvas(l.data, layer.canvas);
      }
    }

    // 3. Restore Frames
    // Delete all frames except the last one (deleteFrame guards against deleting last)
    while (animationStore.frames.value.length > 1) {
      animationStore.deleteFrame(animationStore.frames.value[0].id);
    }

    // Now we have exactly 1 frame left - we'll replace it with loaded frames
    const placeholderFrameId = animationStore.frames.value[0]?.id;

    // Add frames from file
    for (const f of file.frames) {
      animationStore.addFrame(false); // false = don't duplicate content
      const newFrame = animationStore.frames.value[animationStore.frames.value.length - 1];
      newFrame.duration = f.duration;

      // Populate cels
      for (const c of f.cels) {
        const canvas = animationStore.getCelCanvas(newFrame.id, c.layerId);
        // Handle both Base64 (v1.x) and binary (v2.0+) formats
        if (canvas && hasImageData(c.data)) {
          await loadImageDataToCanvas(c.data, canvas);
        }

        // Restore text cel data if present (v2.1+)
        if (c.textCelData) {
          animationStore.setTextCelData(c.layerId, newFrame.id, c.textCelData);
        }
      }
    }

    // Delete the placeholder frame (now we have loaded frames)
    if (placeholderFrameId && animationStore.frames.value.length > 1) {
      animationStore.deleteFrame(placeholderFrameId);
    }

    // 4. Animation Settings
    animationStore.fps.value = file.animation.fps;

    const targetFrame = animationStore.frames.value[file.animation.currentFrameIndex];
    if (targetFrame) {
      animationStore.goToFrame(targetFrame.id);
    }

    // 5. Restore Tags (v2.0+)
    if (file.tags && Array.isArray(file.tags)) {
      animationStore.tags.value = file.tags;
    } else {
      animationStore.tags.value = [];
    }
  }

  /**
   * Create a new blank project with the specified dimensions.
   * Clears all existing content and resets to a fresh state.
   */
  async newProject(width: number, height: number) {
    // 1. Set new dimensions and reset name
    this.setSize(width, height);
    this.name.value = 'Untitled';
    this.lastSaved.value = null;

    // 2. Clear all layers
    while (layerStore.layers.value.length > 0) {
      layerStore.removeLayer(layerStore.layers.value[0].id);
    }

    // 3. Clear all frames except one (deleteFrame guards against last)
    while (animationStore.frames.value.length > 1) {
      animationStore.deleteFrame(animationStore.frames.value[0].id);
    }

    // 4. Clear the remaining frame's cels and resize
    const remainingFrame = animationStore.frames.value[0];
    if (remainingFrame) {
      remainingFrame.cels = [];
    }

    // 5. Create a fresh layer with new dimensions
    layerStore.addLayer('Layer 1', width, height);

    // 6. Ensure animation store syncs with the new layer
    animationStore.syncLayerCanvases();

    // 7. Clear undo/redo history
    historyStore.clear();

    // 8. Clear tags
    animationStore.tags.value = [];

    // 9. Reset animation settings
    animationStore.fps.value = 12;
    if (remainingFrame) {
      animationStore.goToFrame(remainingFrame.id);
    }

    // 10. Save the fresh state immediately
    const projectData = await this.saveProject();
    await persistenceService.saveCurrentProject(projectData);
  }
}

export const projectStore = new ProjectStore();
