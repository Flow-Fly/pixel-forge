import { signal } from '../core/signal';
import { type StoreRefs } from './store-refs';
import { v4 as uuidv4 } from 'uuid';
import { projectRepository } from '../services/persistence/indexed-db';
import { onionSkinCache } from '../services/onion-skin-cache';
import { createProjectThumbnail } from '../services/project-thumbnail';
import {
  createArtworkCompositionPlan,
  drawArtworkComposition,
} from '../services/export-composition';
import { DEFAULT_PROJECT_NAME, DEFAULT_PROJECT_PALETTE_ID } from '../services/project-defaults';
import { canvasToPngBytes } from '../utils/canvas-binary';
import {
  dispatchProjectCompatibilityWarning,
  hydrateProjectFrames,
  hydrateProjectLayers,
  refreshProjectPaletteAfterLoad,
  restoreProjectAnimationState,
  restoreProjectFrameTags,
  restoreProjectPaletteForLoad,
  selectFirstLoadedLayer,
  type ProjectLoadStores,
} from '../serialization/project-load';
import {
  PROJECT_VERSION,
  decodeProjectFileWithDiagnostics,
  type ProjectCelFile,
  type ProjectFile,
  type ProjectFileInput,
} from '../types/project';
import { log } from '../utils/log';
import type { Cel, Frame } from '../types/animation';
import type { Layer } from '../types/layer';
import type { createAnimationStore } from './animation/store';
import type { createDirtyRectStore } from './dirty-rect-store';
import type { createHistoryStore } from './history-store';
import type { createGuidedDrawingStore } from './guided-drawing-store';
import type { createLayerStore } from './layers-store';
import type { createPaletteStore } from './palette/store';
import type { createSelectionStore } from './selection/store';

export type ProjectChangeDomain = 'canvas-bounds' | 'raster-content';

export interface ProjectChangeEvent {
  type: 'project-change';
  target: string;
  fromRevision: number;
  toRevision: number;
  transactionId: string;
  domains: readonly ProjectChangeDomain[];
}

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

function hasRuntimeEmptyCel(
  animation: ProjectAnimationStore,
  cel: Cel,
  textCelData: ReturnType<ProjectAnimationStore['getTextCelData']>
): boolean {
  const hasPixelIndices = cel.indexBuffer?.some((index) => index !== 0) ?? false;
  return animation.isRuntimeEmptyCel(cel) && !textCelData && !hasPixelIndices;
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
      opacity: 100,
    };
  }

  return serializeExistingCel(animation, layer, frame, cel);
}

async function serializeExistingCel(
  animation: ProjectAnimationStore,
  layer: Layer,
  frame: Frame,
  cel: Cel
): Promise<ProjectCelFile> {
  const textCelData = animation.getTextCelData(layer.id, frame.id);
  if (hasRuntimeEmptyCel(animation, cel, textCelData)) {
    return {
      layerId: layer.id,
      data: new Uint8Array(0),
      opacity: cel.opacity ?? 100,
    };
  }

  const celFile: ProjectCelFile = {
    layerId: layer.id,
    data: await canvasToPngBytes(cel.canvas),
    opacity: cel.opacity ?? 100,
  };

  if (cel.linkedCelId) {
    celFile.linkedCelId = cel.linkedCelId;
    if (cel.linkType) celFile.linkType = cel.linkType;
  }
  if (cel.indexBuffer) celFile.indexData = Array.from(cel.indexBuffer);

  if (textCelData) celFile.textCelData = textCelData;

  return celFile;
}

class ProjectStore {
  /** Storage identity of the open project (repository key). */
  id = signal<string>(uuidv4());
  /** Monotonic revision of committed document changes for this project target. */
  revision = signal(0);
  /** Ordered in-process notifications for committed document changes. */
  readonly changeEvents = new EventTarget();
  width = signal(64);
  height = signal(64);
  /** Background color for export. null = transparent (default) */
  backgroundColor = signal<string | null>(null);
  /** Project name for display */
  name = signal('Untitled');
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
  // Group layers have no editor canvas. Keep their loaded bytes only for the
  // currently open project so saving does not replace a legacy payload.
  private loadedGroupLayerData = new Map<string, Uint8Array>();

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

  resetRevision() {
    this.revision.value = 0;
  }

  /** Advance semantic document identity for a successful history transition. */
  advanceRevision() {
    this.revision.value += 1;
  }

  commitChange(
    transactionId: string,
    domains: readonly ProjectChangeDomain[]
  ): ProjectChangeEvent {
    const fromRevision = this.revision.value;
    const event: ProjectChangeEvent = {
      type: 'project-change',
      target: this.id.value,
      fromRevision,
      toRevision: fromRevision + 1,
      transactionId,
      domains: [...domains],
    };

    this.revision.value = event.toRevision;
    this.changeEvents.dispatchEvent(
      new CustomEvent<ProjectChangeEvent>('project-change', { detail: event })
    );
    return event;
  }

  /**
   * Apply a prepared canvas-size state. Callers must validate and allocate all
   * replacement payloads before entering this method so the swap has no
   * failure path between its document stores.
   */
  applyCanvasSizeState(
    width: number,
    height: number,
    cels: Map<string, Cel>
  ) {
    this.width.value = width;
    this.height.value = height;
    this.animation.cels.value = cels;

    const currentFrameId = this.animation.currentFrameId.value;
    this.layers.layers.value = this.layers.layers.value.map((layer) => {
      if (layer.type === 'reference') return layer;

      const cel = cels.get(this.animation.getCelKey(layer.id, currentFrameId));
      return cel ? { ...layer, canvas: cel.canvas } : layer;
    });

    this.dirtyRect.requestFullRedraw();
  }

  async saveProject(): Promise<ProjectFile> {
    // Canvas pixels are the common output of every editing command. Rebuild
    // indices here so canvas-only operations cannot persist stale pixel data.
    this.animation.rebuildAllIndexBuffers(true);

    // Convert layers to binary format (including text layer metadata)
    const layers = await Promise.all(
      this.layers.layers.value.map(async (layer) => ({
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        continuous: layer.continuous,
        parentId: layer.parentId,
        data:
          layer.type === 'group'
            ? new Uint8Array(this.loadedGroupLayerData.get(layer.id) ?? [])
            : layer.canvas
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
  async loadProject(input: ProjectFileInput, _fromAutoSave = false): Promise<ProjectFile> {
    const { project: file, compatibility } = decodeProjectFileWithDiagnostics(input);
    const loadedGroupLayerData = new Map(
      file.layers
        .filter((layer) => layer.type === 'group')
        .map((layer) => [layer.id, new Uint8Array(layer.data)])
    );

    // Clear onion skin cache (old project's cels are no longer valid)
    onionSkinCache.clear();
    // Loading replaces the whole drawing. Drop outgoing cels before palette
    // restoration can rebuild or remap canvases that no longer belong here.
    this.animation.cels.value = new Map();

    this.setSize(file.width, file.height);
    this.resetRevision();
    this.name.value = file.name || DEFAULT_PROJECT_NAME;
    this.guidedDrawing.load(file.guidedDrawing);

    restoreProjectPaletteForLoad(this.loadStores, file);
    await hydrateProjectLayers(this.loadStores, file);
    await hydrateProjectFrames(this.loadStores, file);
    restoreProjectAnimationState(this.loadStores, file);
    restoreProjectFrameTags(this.loadStores, file);
    refreshProjectPaletteAfterLoad(this.loadStores);
    selectFirstLoadedLayer(this.loadStores);
    this.loadedGroupLayerData = loadedGroupLayerData;
    this.resetProjectLocalState();
    dispatchProjectCompatibilityWarning(compatibility);

    // Let the app shell reset the viewport after Lit renders the new dimensions.
    window.dispatchEvent(new CustomEvent('project-loaded'));

    return file;
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
    this.resetRevision();
    this.loadedGroupLayerData = new Map();

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
    this.layers.addLayer('Layer 1', width, height);

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
      log.error('Failed to save new project:', error);
    }
  }

  private async createThumbnailSafely(): Promise<Uint8Array | undefined> {
    const frame = this.animation.frames.value[0];
    if (!frame) return undefined;

    try {
      return await createProjectThumbnail({
        compositeFrame: (frameId, targetCtx) => {
          targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
          drawArtworkComposition(
            targetCtx,
            createArtworkCompositionPlan({
              frameId,
              layers: this.layers.layers.value,
              cels: this.animation.cels.value,
              getCelKey: this.animation.getCelKey,
            })
          );
        },
        frameId: frame.id,
        width: this.width.value,
        height: this.height.value,
      });
    } catch (error) {
      log.error('Thumbnail generation failed:', error);
      return undefined;
    }
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
