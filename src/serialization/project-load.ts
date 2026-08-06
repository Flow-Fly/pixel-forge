import type { Cel, CelLinkType, Frame, FrameTag } from '../types/animation';
import type { Layer } from '../types/layer';
import type { ReferenceLayerData } from '../types/reference';
import type {
  ProjectCelFile,
  ProjectCompatibilityDiagnostics,
  ProjectFile,
  ProjectFrameFile,
  ProjectLayerFile,
} from '../types/project';
import { loadImageDataToCanvas } from '../utils/canvas-binary';
import { buildIndexBufferFromCanvas } from '../utils/indexed-color';
import { hasProjectImageData } from './project-data';

type WritableSignal<T> = {
  value: T;
};

export type ProjectLoadStores = {
  animation: {
    frames: WritableSignal<Frame[]>;
    cels: WritableSignal<Map<string, Cel>>;
    fps: WritableSignal<number>;
    tags: WritableSignal<FrameTag[]>;
    addFrame: (duplicate?: boolean) => void;
    deleteFrame: (frameId: string) => void;
    getCelCanvas: (frameId: string, layerId: string) => HTMLCanvasElement | undefined;
    getCelKey: (layerId: string, frameId: string) => string;
    goToFrame: (frameId: string) => void;
    isRuntimeEmptyCel: (cel: Cel) => boolean;
    linkCels: (celKeys: string[], linkType: CelLinkType) => string | null;
    rebuildAllCelCanvases: () => void;
    rebuildAllIndexBuffers: () => void;
    setFrameDuration: (frameId: string, duration: number) => void;
    setTextCelData: (
      layerId: string,
      frameId: string,
      data: NonNullable<ProjectCelFile['textCelData']>
    ) => void;
  };
  layers: {
    layers: WritableSignal<Layer[]>;
    addLayer: (name: string, width: number, height: number) => Layer;
    addTextLayer: (
      textData: NonNullable<ProjectLayerFile['textData']>,
      name: string,
      width: number,
      height: number
    ) => Layer;
    addReferenceLayer: (
      referenceData: NonNullable<ProjectLayerFile['referenceData']>,
      name: string
    ) => Layer;
    removeLayer: (id: string) => void;
    setActiveLayer: (id: string) => void;
    updateLayer: (id: string, updates: Partial<Layer>) => void;
  };
  palette: {
    findClosestColorIndex: (hex: string) => number;
    getColorByIndex: (index: number) => string | null;
    getColorIndex: (hex: string) => number;
    getOrAddColor: (hex: string) => number;
    refreshUsedColors: () => void;
    setPalette: (colors: string[]) => void;
  };
};

type LinkedCelGroup = {
  celKeys: string[];
  linkType: CelLinkType;
};

const COMPATIBILITY_WARNING_LAYER_LIMIT = 3;
const COMPATIBILITY_WARNING_LAYER_ID_LIMIT = 40;
const COMPATIBILITY_WARNING_MESSAGE_LIMIT = 240;

export function restoreProjectPaletteForLoad(stores: ProjectLoadStores, file: ProjectFile): void {
  const { palette } = stores;

  const filePalette = file.palette && Array.isArray(file.palette) ? file.palette : [];

  if (filePalette.length > 0) {
    palette.setPalette(filePalette);
  }
}

export async function hydrateProjectLayers(
  stores: ProjectLoadStores,
  file: ProjectFile
): Promise<void> {
  clearLoadedLayers(stores);

  for (const layerFile of file.layers) {
    await hydrateProjectLayer(stores, layerFile, file.width, file.height);
  }
}

export async function hydrateProjectFrames(
  stores: ProjectLoadStores,
  file: ProjectFile
): Promise<void> {
  const placeholderFrameId = prepareFramesForLoad(stores);
  const linkedCelGroups = new Map<string, LinkedCelGroup>();

  for (const frameFile of file.frames) {
    const frame = addLoadedFrame(stores, frameFile);
    await hydrateFrameCels(stores, frameFile, frame.id, file, linkedCelGroups);
  }

  restoreLinkedCelGroups(stores, linkedCelGroups);
  stores.animation.rebuildAllCelCanvases();
  deletePlaceholderFrame(stores, placeholderFrameId);
}

export function restoreProjectAnimationState(stores: ProjectLoadStores, file: ProjectFile): void {
  const { animation } = stores;

  animation.fps.value = file.animation.fps;

  const targetFrame = animation.frames.value[file.animation.currentFrameIndex];
  if (targetFrame) {
    animation.goToFrame(targetFrame.id);
  }
}

export function restoreProjectFrameTags(stores: ProjectLoadStores, file: ProjectFile): void {
  stores.animation.tags.value = file.tags && Array.isArray(file.tags) ? file.tags : [];
}

export function refreshProjectPaletteAfterLoad(stores: ProjectLoadStores): void {
  const { palette } = stores;

  palette.refreshUsedColors();
}

export function selectFirstLoadedLayer(stores: ProjectLoadStores): void {
  const { layers: layerStore } = stores;
  const layers = layerStore.layers.value;
  if (layers.length > 0) {
    layerStore.setActiveLayer(layers[0].id);
  }
}

export function dispatchProjectCompatibilityWarning(
  diagnostics: ProjectCompatibilityDiagnostics
): void {
  const message = describeProjectCompatibilityWarning(diagnostics);
  if (!message || typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('show-warning-toast', {
      detail: { message },
    })
  );
}

function describeProjectCompatibilityWarning(
  diagnostics: ProjectCompatibilityDiagnostics
): string | null {
  const repairedLayerIds = diagnostics.repairedParentLayerIds;
  if (repairedLayerIds.length === 0) return null;

  const visibleLayerIds = repairedLayerIds
    .slice(0, COMPATIBILITY_WARNING_LAYER_LIMIT)
    .map(limitCompatibilityWarningLayerId)
    .join(', ');
  const hiddenCount = repairedLayerIds.length - COMPATIBILITY_WARNING_LAYER_LIMIT;
  const remaining = hiddenCount > 0 ? `, and ${hiddenCount} more` : '';
  return limitCompatibilityWarningMessage(
    `Repaired invalid group links for layers: ${visibleLayerIds}${remaining}.`
  );
}

function limitCompatibilityWarningLayerId(layerId: string): string {
  if (layerId.length <= COMPATIBILITY_WARNING_LAYER_ID_LIMIT) return layerId;
  return `${layerId.slice(0, COMPATIBILITY_WARNING_LAYER_ID_LIMIT - 1)}…`;
}

function limitCompatibilityWarningMessage(message: string): string {
  if (message.length <= COMPATIBILITY_WARNING_MESSAGE_LIMIT) return message;
  return `${message.slice(0, COMPATIBILITY_WARNING_MESSAGE_LIMIT - 1)}…`;
}

function clearLoadedLayers(stores: ProjectLoadStores): void {
  const { layers } = stores;

  while (layers.layers.value.length > 0) {
    layers.removeLayer(layers.layers.value[0].id);
  }
}

async function hydrateProjectLayer(
  stores: ProjectLoadStores,
  layerFile: ProjectLayerFile,
  width: number,
  height: number
): Promise<void> {
  const { layers } = stores;
  const layerType = layerFile.type;
  const layer = createLoadedLayer(stores, layerFile, layerType, width, height);

  layers.updateLayer(layer.id, {
    id: layerFile.id,
    type: layerType,
    visible: layerFile.visible,
    locked: layerFile.locked,
    opacity: layerFile.opacity,
    blendMode: layerFile.blendMode || 'normal',
    continuous: layerFile.continuous || false,
    parentId: layerFile.parentId,
    ...(layerType === 'group' && { canvas: undefined }),
  });

  const restored = layers.layers.value.find((x) => x.id === layerFile.id);
  if (restored && hasProjectImageData(layerFile.data) && restored.canvas) {
    await loadImageDataToCanvas(layerFile.data, restored.canvas);
  }
}

function createLoadedLayer(
  stores: ProjectLoadStores,
  layerFile: ProjectLayerFile,
  layerType: Layer['type'],
  width: number,
  height: number
): Layer {
  const { layers } = stores;

  if (layerType === 'text' && layerFile.textData) {
    return layers.addTextLayer(layerFile.textData, layerFile.name, width, height);
  }

  if (layerType === 'reference') {
    return layers.addReferenceLayer(
      getReferenceDataForLoad(layerFile.referenceData),
      layerFile.name
    );
  }

  return layers.addLayer(layerFile.name, width, height);
}

function getReferenceDataForLoad(
  referenceData: ProjectLayerFile['referenceData']
): ReferenceLayerData {
  if (!referenceData) return createEmptyReferenceData();

  return {
    ...referenceData,
    position: referenceData.position ?? 'below',
  };
}

function createEmptyReferenceData(): ReferenceLayerData {
  return {
    bytes: new Uint8Array(0),
    mimeType: 'application/octet-stream',
    x: 0,
    y: 0,
    scale: 1,
    position: 'below',
  };
}

function prepareFramesForLoad(stores: ProjectLoadStores): string | undefined {
  const { animation } = stores;

  while (animation.frames.value.length > 1) {
    animation.deleteFrame(animation.frames.value[0].id);
  }

  return animation.frames.value[0]?.id;
}

function addLoadedFrame(stores: ProjectLoadStores, frameFile: ProjectFrameFile): Frame {
  const { animation } = stores;

  animation.addFrame(false);
  const frame = animation.frames.value[animation.frames.value.length - 1];
  animation.setFrameDuration(frame.id, frameFile.duration);
  return frame;
}

async function hydrateFrameCels(
  stores: ProjectLoadStores,
  frameFile: ProjectFrameFile,
  frameId: string,
  file: ProjectFile,
  linkedCelGroups: Map<string, LinkedCelGroup>
): Promise<void> {
  const { animation } = stores;

  for (const celFile of frameFile.cels) {
    const celKey = animation.getCelKey(celFile.layerId, frameId);

    giveSharedTransparentCelOwnCanvas(stores, celKey, celFile, file);
    await hydrateCelImage(stores, celKey, frameId, celFile, file);
    restoreTextCelData(stores, frameId, celFile);
    trackLinkedCelGroup(celKey, celFile, linkedCelGroups);
  }
}

function giveSharedTransparentCelOwnCanvas(
  stores: ProjectLoadStores,
  celKey: string,
  celFile: ProjectCelFile,
  file: ProjectFile
): void {
  const { animation } = stores;
  const cel = animation.cels.value.get(celKey);
  if (
    !cel ||
    !animation.isRuntimeEmptyCel(cel) ||
    (!hasProjectImageData(celFile.data) &&
      !(celFile.indexData && celFile.indexData.length > 0) &&
      !celFile.linkedCelId &&
      !celFile.textCelData)
  ) {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = file.width;
  canvas.height = file.height;
  const ctx = canvas.getContext('2d', {
    alpha: true,
    willReadFrequently: true,
  });
  if (ctx) ctx.imageSmoothingEnabled = false;

  const cels = new Map(animation.cels.value);
  cels.set(celKey, {
    ...cel,
    canvas,
    linkedCelId: undefined,
    linkType: undefined,
  });
  animation.cels.value = cels;
}

async function hydrateCelImage(
  stores: ProjectLoadStores,
  celKey: string,
  frameId: string,
  celFile: ProjectCelFile,
  file: ProjectFile
): Promise<void> {
  const canvas = stores.animation.getCelCanvas(frameId, celFile.layerId);
  if (canvas && hasProjectImageData(celFile.data)) {
    await loadImageDataToCanvas(celFile.data, canvas);
  }

  restoreCelIndexBuffer(stores, celKey, celFile, canvas, file);
}

function restoreCelIndexBuffer(
  stores: ProjectLoadStores,
  celKey: string,
  celFile: ProjectCelFile,
  canvas: HTMLCanvasElement | undefined,
  file: ProjectFile
): void {
  const { animation } = stores;
  const cel = animation.cels.value.get(celKey);
  if (!cel) return;

  const cels = new Map(animation.cels.value);
  const restoredCel = {
    ...cel,
    opacity: celFile.opacity,
  };
  cels.set(celKey, restoredCel);

  if (celFile.indexData && Array.isArray(celFile.indexData)) {
    cels.set(celKey, {
      ...restoredCel,
      indexBuffer: new Uint8Array(celFile.indexData),
    });
  } else if (canvas && hasProjectImageData(celFile.data) && !file.palette) {
    cels.set(celKey, {
      ...restoredCel,
      indexBuffer: buildIndexBufferFromCanvas(canvas, stores.palette, true),
    });
  }

  animation.cels.value = cels;
}

function restoreTextCelData(
  stores: ProjectLoadStores,
  frameId: string,
  celFile: ProjectCelFile
): void {
  if (celFile.textCelData) {
    stores.animation.setTextCelData(celFile.layerId, frameId, celFile.textCelData);
  }
}

function trackLinkedCelGroup(
  celKey: string,
  celFile: ProjectCelFile,
  linkedCelGroups: Map<string, LinkedCelGroup>
): void {
  if (!celFile.linkedCelId) return;

  if (!linkedCelGroups.has(celFile.linkedCelId)) {
    linkedCelGroups.set(celFile.linkedCelId, {
      celKeys: [],
      linkType: celFile.linkType ?? 'soft',
    });
  }

  linkedCelGroups.get(celFile.linkedCelId)!.celKeys.push(celKey);
}

function restoreLinkedCelGroups(
  stores: ProjectLoadStores,
  linkedCelGroups: Map<string, LinkedCelGroup>
): void {
  for (const [linkedCelId, { celKeys, linkType }] of linkedCelGroups) {
    if (celKeys.length >= 2) {
      stores.animation.linkCels(celKeys, linkType);
      continue;
    }

    if (celKeys.length === 1) {
      restoreOrphanedLinkedCel(stores, celKeys[0], linkedCelId, linkType);
    }
  }
}

function restoreOrphanedLinkedCel(
  stores: ProjectLoadStores,
  celKey: string,
  linkedCelId: string,
  linkType: CelLinkType
): void {
  const { animation } = stores;
  const cels = new Map(animation.cels.value);
  const cel = cels.get(celKey);
  if (!cel) return;

  cels.set(celKey, { ...cel, linkedCelId, linkType });
  animation.cels.value = cels;
}

function deletePlaceholderFrame(
  stores: ProjectLoadStores,
  placeholderFrameId: string | undefined
): void {
  const { animation } = stores;

  if (placeholderFrameId && animation.frames.value.length > 1) {
    animation.deleteFrame(placeholderFrameId);
  }
}
