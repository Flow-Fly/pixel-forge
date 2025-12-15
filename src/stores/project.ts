import { signal } from "../core/signal";
import { layerStore } from "./layers";
import { animationStore, EMPTY_CEL_LINK_ID } from "./animation";
import { historyStore } from "./history";
import { paletteStore } from "./palette";
import { persistenceService } from "../services/persistence/indexed-db";
import { onionSkinCache } from "../services/onion-skin-cache";
import {
  canvasToPngBytes,
  loadImageDataToCanvas,
} from "../utils/canvas-binary";
import { buildIndexBufferFromCanvas } from "../utils/indexed-color";
import { PROJECT_VERSION, type ProjectFile } from "../types/project";

/**
 * Check if image data has content.
 * Handles string (Base64), Uint8Array, and serialized Uint8Array (object with numeric keys from JSON).
 */
function hasImageData(
  data: string | Uint8Array | Record<string, number>
): boolean {
  if (typeof data === "string") return data.length > 0;
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
  name = signal("Untitled");
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
      layerStore.layers.value.map(async (layer) => ({
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
        ...(layer.textData && { textData: layer.textData }),
      }))
    );

    // Convert frames/cels to binary format (including text cel data, linked cel info, and index buffer)
    const frames = await Promise.all(
      animationStore.frames.value.map(async (frame) => {
        const cels = await Promise.all(
          layerStore.layers.value.map(async (layer) => {
            const celKey = animationStore.getCelKey(layer.id, frame.id);
            const cel = animationStore.cels.value.get(celKey);
            const canvas = cel?.canvas;
            const textCelData = animationStore.getTextCelData(
              layer.id,
              frame.id
            );

            // Serialize index buffer to array if present
            const indexData = cel?.indexBuffer
              ? Array.from(cel.indexBuffer)
              : undefined;

            return {
              layerId: layer.id,
              data: canvas ? await canvasToPngBytes(canvas) : new Uint8Array(0),
              // Include linked cel ID and type if present (v2.2+)
              ...(cel?.linkedCelId && { linkedCelId: cel.linkedCelId }),
              ...(cel?.linkType && { linkType: cel.linkType }),
              // Include text cel data if present
              ...(textCelData && { textCelData }),
              // Include index buffer data if present (v3.0+)
              ...(indexData && { indexData }),
            };
          })
        );

        return {
          id: frame.id,
          duration: frame.duration,
          cels,
        };
      })
    );

    const currentFrameIndex = animationStore.frames.value.findIndex(
      (f) => f.id === animationStore.currentFrameId.value
    );

    // Only include ephemeral palette if there are ephemeral colors
    const ephemeralPalette =
      paletteStore.ephemeralColors.value.length > 0
        ? paletteStore.ephemeralColors.value
        : undefined;

    return {
      version: PROJECT_VERSION,
      name: this.name.value,
      width: this.width.value,
      height: this.height.value,
      palette: paletteStore.mainColors.value, // v3.0+: Save the main palette
      ephemeralPalette, // v3.1+: Save ephemeral colors if any
      layers,
      frames,
      animation: {
        fps: animationStore.fps.value,
        currentFrameIndex: currentFrameIndex === -1 ? 0 : currentFrameIndex,
      },
      tags: animationStore.tags.value,
    };
  }

  /**
   * Load a project from file data.
   * @param file The project file data
   * @param fromAutoSave If true, palette is preserved from localStorage (auto-save reload).
   *                     If false, palette is loaded from file (explicit file import).
   */
  async loadProject(file: ProjectFile, fromAutoSave = false) {
    // Clear onion skin cache (old project's cels are no longer valid)
    onionSkinCache.clear();

    // 1. Set dimensions and name
    this.setSize(file.width, file.height);
    this.name.value = file.name || "Untitled";

    // 2. Restore Palette (v3.0+)
    // For auto-save reload: palette is already correct from localStorage, skip
    // For file import: load palette from file
    if (
      !fromAutoSave &&
      file.palette &&
      Array.isArray(file.palette) &&
      file.palette.length > 0
    ) {
      paletteStore.setPalette(file.palette);
    }

    // 2b. Restore Ephemeral Palette (v3.1+)
    // For auto-save reload: ephemeral will be rebuilt from drawing after all data is loaded
    // For file import: restore ephemeral from file
    if (!fromAutoSave) {
      if (
        file.ephemeralPalette &&
        Array.isArray(file.ephemeralPalette) &&
        file.ephemeralPalette.length > 0
      ) {
        paletteStore.ephemeralColors.value = file.ephemeralPalette;
        paletteStore.rebuildColorMap();
      } else {
        // Clear any existing ephemeral colors when loading a project without them
        paletteStore.clearEphemeralColors();
      }
    }

    // 3. Restore Layers
    // Clear all layers (layerStore.removeLayer doesn't have a "last layer" guard)
    while (layerStore.layers.value.length > 0) {
      layerStore.removeLayer(layerStore.layers.value[0].id);
    }

    for (const l of file.layers) {
      // Check layer type (default to 'image' for backwards compatibility with pre-v2.1 files)
      const layerType = l.type || "image";

      let layer;
      if (layerType === "text" && l.textData) {
        // Create text layer with its metadata
        layer = layerStore.addTextLayer(
          l.textData,
          l.name,
          file.width,
          file.height
        );
      } else {
        // Create regular image layer
        layer = layerStore.addLayer(l.name, file.width, file.height);
      }

      layer.id = l.id;
      layer.visible = l.visible;
      layer.opacity = l.opacity;
      layer.blendMode = l.blendMode || "normal";

      // Handle both Base64 (v1.x) and binary (v2.0+) formats for raster data
      if (hasImageData(l.data) && layer.canvas) {
        await loadImageDataToCanvas(l.data, layer.canvas);
      }
    }

    // 4. Restore Frames
    // Delete all frames except the last one (deleteFrame guards against deleting last)
    while (animationStore.frames.value.length > 1) {
      animationStore.deleteFrame(animationStore.frames.value[0].id);
    }

    // Now we have exactly 1 frame left - we'll replace it with loaded frames
    const placeholderFrameId = animationStore.frames.value[0]?.id;

    // Track linked cel groups for post-processing (v2.2+)
    // Maps linkedCelId -> { celKeys, linkType }
    const linkedCelGroups = new Map<
      string,
      { celKeys: string[]; linkType: "soft" | "hard" }
    >();

    // Add frames from file
    for (const f of file.frames) {
      animationStore.addFrame(false); // false = don't duplicate content
      const newFrame =
        animationStore.frames.value[animationStore.frames.value.length - 1];
      newFrame.duration = f.duration;

      // Populate cels
      for (const c of f.cels) {
        const celKey = animationStore.getCelKey(c.layerId, newFrame.id);
        const cel = animationStore.cels.value.get(celKey);

        // If cel uses shared transparent canvas and has data to load,
        // give it its own canvas first (fix for Phase 3 regression)
        if (
          cel &&
          cel.linkedCelId === EMPTY_CEL_LINK_ID &&
          hasImageData(c.data)
        ) {
          const newCanvas = document.createElement("canvas");
          newCanvas.width = file.width;
          newCanvas.height = file.height;
          const ctx = newCanvas.getContext("2d", {
            alpha: true,
            willReadFrequently: true,
          });
          if (ctx) ctx.imageSmoothingEnabled = false;

          // Update cel to use its own canvas and remove empty marker
          const cels = new Map(animationStore.cels.value);
          cels.set(celKey, {
            ...cel,
            canvas: newCanvas,
            linkedCelId: undefined,
            linkType: undefined,
          });
          animationStore.cels.value = cels;
        }

        // Now load data into the cel's (non-shared) canvas
        const canvas = animationStore.getCelCanvas(newFrame.id, c.layerId);
        // Handle both Base64 (v1.x) and binary (v2.0+) formats
        if (canvas && hasImageData(c.data)) {
          await loadImageDataToCanvas(c.data, canvas);
        }

        // Restore index buffer data (v3.0+)
        // If cel has indexData, restore it directly
        // If legacy file (no indexData), build index buffer from canvas content
        const currentCel = animationStore.cels.value.get(celKey);
        if (currentCel && hasImageData(c.data)) {
          const cels = new Map(animationStore.cels.value);

          if (c.indexData && Array.isArray(c.indexData)) {
            // v3.0+ file: restore index buffer from saved data
            cels.set(celKey, {
              ...currentCel,
              indexBuffer: new Uint8Array(c.indexData),
            });
          } else if (canvas && !file.palette) {
            // Legacy file migration: build index buffer from canvas content
            // This also adds any new colors to the palette
            const indexBuffer = buildIndexBufferFromCanvas(canvas, true);
            cels.set(celKey, {
              ...currentCel,
              indexBuffer,
            });
          }

          animationStore.cels.value = cels;
        }

        // Restore text cel data if present (v2.1+)
        if (c.textCelData) {
          animationStore.setTextCelData(c.layerId, newFrame.id, c.textCelData);
        }

        // Track linked cels for later linking (v2.2+)
        if (c.linkedCelId) {
          const celKey = animationStore.getCelKey(c.layerId, newFrame.id);
          if (!linkedCelGroups.has(c.linkedCelId)) {
            linkedCelGroups.set(c.linkedCelId, {
              celKeys: [],
              linkType: c.linkType ?? "soft", // Default to soft for backwards compat
            });
          }
          linkedCelGroups.get(c.linkedCelId)!.celKeys.push(celKey);
        }
      }
    }

    // Restore linked cel relationships (v2.2+)
    // Link cels that share the same linkedCelId, preserving linkType
    for (const [linkedCelId, { celKeys, linkType }] of linkedCelGroups) {
      if (celKeys.length >= 2) {
        animationStore.linkCels(celKeys, linkType);
      } else if (celKeys.length === 1) {
        // Single cel with linkedCelId - just set the property (orphaned link)
        const celKey = celKeys[0];
        const cels = new Map(animationStore.cels.value);
        const cel = cels.get(celKey);
        if (cel) {
          cels.set(celKey, { ...cel, linkedCelId, linkType });
          animationStore.cels.value = cels;
        }
      }
    }

    // Delete the placeholder frame (now we have loaded frames)
    if (placeholderFrameId && animationStore.frames.value.length > 1) {
      animationStore.deleteFrame(placeholderFrameId);
    }

    // 5. Animation Settings
    animationStore.fps.value = file.animation.fps;

    const targetFrame =
      animationStore.frames.value[file.animation.currentFrameIndex];
    if (targetFrame) {
      animationStore.goToFrame(targetFrame.id);
    }

    // 6. Restore Tags (v2.0+)
    if (file.tags && Array.isArray(file.tags)) {
      animationStore.tags.value = file.tags;
    } else {
      animationStore.tags.value = [];
    }

    // 7. Rebuild ephemeral colors from drawing (auto-save reload only)
    // When loading from auto-save, the palette comes from localStorage but the
    // index buffers might reference colors not in that palette. Scan the drawing
    // and add any missing colors to ephemeral.
    if (fromAutoSave) {
      paletteStore.rebuildEphemeralFromDrawing();
      // Now rebuild index buffers to match the new palette (main + ephemeral)
      animationStore.rebuildAllIndexBuffers();
    }

    // 8. Update used colors for palette usage indicators
    paletteStore.refreshUsedColors();
  }

  /**
   * Create a new blank project with the specified dimensions.
   * Clears all existing content and resets to a fresh state.
   */
  async newProject(width: number, height: number) {
    // Clear onion skin cache (old project's cels are no longer valid)
    onionSkinCache.clear();

    // 1. Set new dimensions and reset name
    this.setSize(width, height);
    this.name.value = "Untitled";
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
    layerStore.addLayer("Layer 1", width, height);

    // 6. Ensure animation store syncs with the new layer
    animationStore.syncLayerCanvases();

    // 7. Clear undo/redo history
    historyStore.clear();

    // 8. Clear tags
    animationStore.tags.value = [];

    // 8b. Clear ephemeral colors (fresh start - no preserved colors needed)
    paletteStore.clearEphemeralColors();

    // 8c. Reset palette to default (DB32)
    paletteStore.loadPreset("db32");

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
