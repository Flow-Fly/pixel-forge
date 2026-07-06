import { signal } from "../core/signal";
import { v4 as uuidv4 } from "uuid";
import { layerStore } from "./layers";
import { animationStore } from "./animation";
import { historyStore } from "./history";
import { paletteStore } from "./palette";
import { projectRepository } from "../services/persistence/indexed-db";
import { onionSkinCache } from "../services/onion-skin-cache";
import { canvasToPngBytes } from "../utils/canvas-binary";
import { normalizeProjectFileImageData } from "../serialization/project-data";
import {
  hydrateProjectFrames,
  hydrateProjectLayers,
  refreshProjectPaletteAfterLoad,
  restoreProjectAnimationState,
  restoreProjectFrameTags,
  restoreProjectPaletteForLoad,
  selectFirstLoadedLayer,
} from "../serialization/project-load";
import {
  PROJECT_VERSION,
  type ProjectFile,
  type ProjectFileInput,
} from "../types/project";
import { log } from "../utils/log";

class ProjectStore {
  /** Storage identity of the open project (repository key). */
  id = signal<string>(uuidv4());
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
        continuous: layer.continuous,
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
  async loadProject(input: ProjectFileInput, fromAutoSave = false) {
    const file = normalizeProjectFileImageData(input);

    // Clear onion skin cache (old project's cels are no longer valid)
    onionSkinCache.clear();

    this.setSize(file.width, file.height);
    this.name.value = file.name || "Untitled";

    restoreProjectPaletteForLoad(file, fromAutoSave);
    await hydrateProjectLayers(file);
    await hydrateProjectFrames(file);
    restoreProjectAnimationState(file);
    restoreProjectFrameTags(file);
    refreshProjectPaletteAfterLoad(fromAutoSave);
    selectFirstLoadedLayer();

    // Let the app shell reset the viewport after Lit renders the new dimensions.
    window.dispatchEvent(new CustomEvent("project-loaded"));
  }

  /**
   * Create a new blank project with the specified dimensions.
   * Clears all existing content and resets to a fresh state.
   */
  async newProject(width: number, height: number) {
    // Clear onion skin cache (old project's cels are no longer valid)
    onionSkinCache.clear();

    // 0. New project = new storage identity (the old project stays stored)
    this.id.value = uuidv4();

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

    // 4. Clear all cels from animation store
    animationStore.cels.value = new Map();

    // 5. Create a fresh layer with new dimensions
    layerStore.addLayer("Layer 1", width, height);

    // 6. Ensure animation store syncs with the new layer
    animationStore.syncLayerCanvases();

    // 7. Clear undo/redo history
    historyStore.clear();

    // 8. Clear tags
    animationStore.tags.value = [];

    // 8b. Clear ephemeral colors (fresh start - no preserved colors needed)
    // Skip remap since we're starting fresh
    paletteStore.clearEphemeralColors(true);

    // 8c. Reset palette to default (DB32)
    paletteStore.loadPreset("db32");

    // 9. Reset animation settings
    animationStore.fps.value = 12;
    const firstFrame = animationStore.frames.value[0];
    if (firstFrame) {
      animationStore.goToFrame(firstFrame.id);
    }

    // 10. Save the fresh state immediately
    try {
      const projectData = await this.saveProject();
      await projectRepository.save(this.id.value, projectData);
      await projectRepository.setLastOpenedProjectId(this.id.value);
    } catch (error) {
      log.error("Failed to save new project:", error);
    }
  }
}

export const projectStore = new ProjectStore();
