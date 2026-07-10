import { signal } from "../core/signal";
import { type StoreRefs } from "./store-refs";
import { v4 as uuidv4 } from "uuid";
import { projectRepository } from "../services/persistence/indexed-db";
import { onionSkinCache } from "../services/onion-skin-cache";
import { createProjectThumbnail } from "../services/project-thumbnail";
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
import type { createAnimationStore } from "./animation/store";
import type { createDirtyRectStore } from "./dirty-rect-store";
import type { createHistoryStore } from "./history-store";
import type { createGuidedDrawingStore } from "./guided-drawing-store";
import type { createLayerStore } from "./layers-store";
import type { createPaletteStore } from "./palette/store";
import type { createSelectionStore } from "./selection/store";

type ProjectAnimationStore = ReturnType<typeof createAnimationStore>;
type ProjectDirtyRectStore = ReturnType<typeof createDirtyRectStore>;
type ProjectHistoryStore = ReturnType<typeof createHistoryStore>;
type ProjectGuidedDrawingStore = ReturnType<typeof createGuidedDrawingStore>;
type ProjectLayerStore = ReturnType<typeof createLayerStore>;
type ProjectPaletteStore = ReturnType<typeof createPaletteStore>;
type ProjectSelectionStore = ReturnType<typeof createSelectionStore>;

export interface ProjectStoreDependencies {
  animation: ProjectAnimationStore;
  dirtyRect: ProjectDirtyRectStore;
  history: ProjectHistoryStore;
  guidedDrawing: ProjectGuidedDrawingStore;
  layers: ProjectLayerStore;
  palette: ProjectPaletteStore;
  refs: StoreRefs;
  selection: ProjectSelectionStore;
}

function layerSerializesCels(layer: Layer): boolean {
  return layer.type !== 'reference';
}

async function serializeCelForLayer(
  animation: ProjectAnimationStore,
  layer: Layer,
  frame: Frame
): Promise<ProjectCelFile> {
  const celKey = animation.getCelKey(layer.id, frame.id);
  const cel = animation.cels.value.get(celKey);

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

  const textCelData = animation.getTextCelData(layer.id, frame.id);
  if (textCelData) celFile.textCelData = textCelData;

  return celFile;
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
  private readonly animation: ProjectAnimationStore;
  private readonly dirtyRect: ProjectDirtyRectStore;
  private readonly history: ProjectHistoryStore;
  private readonly guidedDrawing: ProjectGuidedDrawingStore;
  private readonly layers: ProjectLayerStore;
  private readonly loadStores: ProjectLoadStores;
  private readonly palette: ProjectPaletteStore;
  private readonly refs: StoreRefs;
  private readonly selection: ProjectSelectionStore;

  constructor(dependencies: ProjectStoreDependencies) {
    this.animation = dependencies.animation;
    this.dirtyRect = dependencies.dirtyRect;
    this.history = dependencies.history;
    this.guidedDrawing = dependencies.guidedDrawing;
    this.layers = dependencies.layers;
    this.palette = dependencies.palette;
    this.refs = dependencies.refs;
    this.selection = dependencies.selection;
    this.loadStores = {
      animation: this.animation,
      layers: this.layers,
      palette: this.palette,
    };
    this.refs.registerCanvasSizeSource(this);
  }

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
      this.layers.layers.value.map(async (layer) => ({
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
      this.animation.frames.value.map(async (frame) => {
        const cels = await Promise.all(
          this.layers.layers.value
            .filter(layerSerializesCels)
            .map((layer) => serializeCelForLayer(this.animation, layer, frame))
        );

        return {
          id: frame.id,
          duration: frame.duration,
          cels,
        };
      })
    );

    const currentFrameIndex = this.animation.frames.value.findIndex(
      (f) => f.id === this.animation.currentFrameId.value
    );

    const guidedDrawing = this.guidedDrawing.toFile();

    return {
      version: PROJECT_VERSION,
      name: this.name.value,
      width: this.width.value,
      height: this.height.value,
      palette: this.palette.mainColors.value, // v3.0+: Save the main palette
      layers,
      frames,
      animation: {
        fps: this.animation.fps.value,
        currentFrameIndex: currentFrameIndex === -1 ? 0 : currentFrameIndex,
      },
      tags: this.animation.tags.value,
      ...(guidedDrawing && { guidedDrawing }),
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
    this.guidedDrawing.load(file.guidedDrawing);

    restoreProjectPaletteForLoad(this.loadStores, file);
    await hydrateProjectLayers(this.loadStores, file);
    await hydrateProjectFrames(this.loadStores, file);
    restoreProjectAnimationState(this.loadStores, file);
    restoreProjectFrameTags(this.loadStores, file);
    refreshProjectPaletteAfterLoad(this.loadStores);
    selectFirstLoadedLayer(this.loadStores);
    this.resetProjectLocalState();

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
    this.guidedDrawing.clear();

    // 2. Clear all layers
    while (this.layers.layers.value.length > 0) {
      this.layers.removeLayer(this.layers.layers.value[0].id);
    }

    // 3. Clear all frames except one (deleteFrame guards against last)
    while (this.animation.frames.value.length > 1) {
      this.animation.deleteFrame(this.animation.frames.value[0].id);
    }

    // 4. Clear all cels from animation store
    this.animation.cels.value = new Map();

    // 5. Create a fresh layer with new dimensions
    this.layers.addLayer("Layer 1", width, height);

    // 6. Ensure animation store syncs with the new layer
    this.animation.syncLayerCanvases();

    // 7. Clear undo/redo history
    this.history.clear();

    // 8. Clear tags
    this.animation.tags.value = [];

    // 8b. Clear session-only palette badges.
    this.palette.clearAllNewFlags();

    // 8c. Reset palette to default (DB32)
    this.palette.loadPreset(DEFAULT_PROJECT_PALETTE_ID);

    // 9. Reset animation settings
    this.animation.fps.value = 12;
    const firstFrame = this.animation.frames.value[0];
    if (firstFrame) {
      this.animation.goToFrame(firstFrame.id);
    }

    // 10. Save the fresh state immediately
    try {
      const projectData = await this.saveProject();
      await projectRepository.save(this.id.value, projectData, {
        thumbnail: await this.createThumbnailSafely(),
      });
      await projectRepository.setLastOpenedProjectId(this.id.value);
    } catch (error) {
      log.error("Failed to save new project:", error);
    }
  }

  private async createThumbnailSafely(): Promise<Uint8Array | undefined> {
    const frame = this.animation.frames.value[0];
    if (!frame) return undefined;

    try {
      return await createProjectThumbnail({
        compositeFrame: (frameId, targetCtx) => this.compositeFrame(frameId, targetCtx),
        frameId: frame.id,
        width: this.width.value,
        height: this.height.value,
      });
    } catch (error) {
      log.error("Thumbnail generation failed:", error);
      return undefined;
    }
  }

  private compositeFrame(
    frameId: string,
    targetCtx: CanvasRenderingContext2D,
  ): void {
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);

    for (const layer of this.layers.layers.value) {
      if (!layer.visible) continue;

      const key = this.animation.getCelKey(layer.id, frameId);
      const cel = this.animation.cels.value.get(key);
      const canvasToUse = cel?.canvas ?? layer.canvas;
      if (!canvasToUse) continue;

      targetCtx.globalAlpha = (layer.opacity / 255) * ((cel?.opacity ?? 100) / 100);
      targetCtx.globalCompositeOperation =
        layer.blendMode === "normal"
          ? "source-over"
          : (layer.blendMode as GlobalCompositeOperation);
      targetCtx.drawImage(canvasToUse, 0, 0);
    }

    targetCtx.globalAlpha = 1;
    targetCtx.globalCompositeOperation = "source-over";
  }

  private resetProjectLocalState() {
    this.history.clear();
    this.selection.resetForProject();
    this.animation.clearCelSelection();
    this.animation.selectionAnchor.value = null;
    this.dirtyRect.reset();
    // Clipboard is intentionally global so users can copy from one project and
    // paste into another.
  }
}

export function createProjectStore(dependencies: ProjectStoreDependencies) {
  return new ProjectStore(dependencies);
}
