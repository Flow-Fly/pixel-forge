import { signal } from "../core/signal";
import { registerCanvasSizeSource } from "./store-refs";
import { v4 as uuidv4 } from "uuid";
import { layerStore } from "./layers";
import { animationStore } from "./animation";
import { historyStore } from "./history";
import { dirtyRectStore } from "./dirty-rect";
import { paletteStore } from "./palette";
import { selectionStore } from "./selection";
import { viewportStore } from "./viewport";
import { projectRepository } from "../services/persistence/indexed-db";
import { onionSkinCache } from "../services/onion-skin-cache";
import {
  DEFAULT_PROJECT_NAME,
  DEFAULT_PROJECT_PALETTE_ID,
} from "../services/project-defaults";
import { canvasToPngBytes } from "../utils/canvas-binary";
import { normalizeProjectFileImageData } from "../serialization/project-data";
import {
  hydrateProjectFrames,
  hydrateProjectLayers,
  migrateProjectFileForLoad,
  refreshProjectPaletteAfterLoad,
  restoreProjectAnimationState,
  restoreProjectFrameTags,
  restoreProjectPaletteForLoad,
  selectFirstLoadedLayer,
  type ProjectLoadStores,
} from "../serialization/project-load";
import {
  PROJECT_VERSION,
  type ProjectCelFile,
  type ProjectFile,
  type ProjectFileInput,
} from "../types/project";
import { log } from "../utils/log";
import type { Frame } from "../types/animation";
import type { Layer } from "../types/layer";

function layerSerializesCels(layer: Layer): boolean {
  return layer.type !== 'reference';
}

async function serializeCelForLayer(
  layer: Layer,
  frame: Frame
): Promise<ProjectCelFile> {
  const celKey = animationStore.getCelKey(layer.id, frame.id);
  const cel = animationStore.cels.value.get(celKey);

  if (!cel) {
    return {
      layerId: layer.id,
      data: new Uint8Array(0),
    };
  }

  const celFile: ProjectCelFile = {
    layerId: layer.id,
    data: await canvasToPngBytes(cel.canvas),
  };

  if (cel.linkedCelId) celFile.linkedCelId = cel.linkedCelId;
  if (cel.linkType) celFile.linkType = cel.linkType;
  if (cel.indexBuffer) celFile.indexData = Array.from(cel.indexBuffer);

  const textCelData = animationStore.getTextCelData(layer.id, frame.id);
  if (textCelData) celFile.textCelData = textCelData;

  return celFile;
}

const projectLoadStores: ProjectLoadStores = {
  animation: animationStore,
  layers: layerStore,
  palette: paletteStore,
};

function resetProjectLocalState() {
  historyStore.clear();
  selectionStore.resetForProject();
  animationStore.clearCelSelection();
  animationStore.selectionAnchor.value = null;
  viewportStore.resetView();
  dirtyRectStore.reset();
  // Clipboard is intentionally global so users can copy from one project and
  // paste into another.
}

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
        // Include reference layer metadata if present. Reference layers keep
        // original source bytes and do not serialize animation cels.
        ...(layer.referenceData && { referenceData: layer.referenceData }),
      }))
    );

    // Convert frames/cels to binary format (including text cel data, linked cel info, and index buffer)
    const frames = await Promise.all(
      animationStore.frames.value.map(async (frame) => {
        const cels = await Promise.all(
          layerStore.layers.value
            .filter(layerSerializesCels)
            .map((layer) => serializeCelForLayer(layer, frame))
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

    return {
      version: PROJECT_VERSION,
      name: this.name.value,
      width: this.width.value,
      height: this.height.value,
      palette: paletteStore.mainColors.value, // v3.0+: Save the main palette
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
   * @param _fromAutoSave Kept for call-site compatibility. All load paths now
   *                      restore the palette from the file.
   */
  async loadProject(input: ProjectFileInput, _fromAutoSave = false) {
    const file = migrateProjectFileForLoad(normalizeProjectFileImageData(input));

    // Clear onion skin cache (old project's cels are no longer valid)
    onionSkinCache.clear();

    this.setSize(file.width, file.height);
    this.name.value = file.name || DEFAULT_PROJECT_NAME;

    restoreProjectPaletteForLoad(projectLoadStores, file);
    await hydrateProjectLayers(projectLoadStores, file);
    await hydrateProjectFrames(projectLoadStores, file);
    restoreProjectAnimationState(projectLoadStores, file);
    restoreProjectFrameTags(projectLoadStores, file);
    refreshProjectPaletteAfterLoad(projectLoadStores);
    selectFirstLoadedLayer(projectLoadStores);
    resetProjectLocalState();

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
    this.name.value = DEFAULT_PROJECT_NAME;
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

    // 8b. Clear session-only palette badges.
    paletteStore.clearAllNewFlags();

    // 8c. Reset palette to default (DB32)
    paletteStore.loadPreset(DEFAULT_PROJECT_PALETTE_ID);

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
registerCanvasSizeSource(projectStore);
