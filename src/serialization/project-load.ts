import type { Cel, CelLinkType, Frame, FrameTag } from '../types/animation';
import type { Layer } from '../types/layer';
import type {
  ProjectCelFile,
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
    getCelCanvas: (
      frameId: string,
      layerId: string
    ) => HTMLCanvasElement | undefined;
    getCelKey: (layerId: string, frameId: string) => string;
    goToFrame: (frameId: string) => void;
    linkCels: (celKeys: string[], linkType: CelLinkType) => string | null;
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
    removeLayer: (id: string) => void;
    setActiveLayer: (id: string) => void;
    updateLayer: (id: string, updates: Partial<Layer>) => void;
  };
  palette: {
    ephemeralColors: WritableSignal<string[]>;
    clearEphemeralColors: (skipRemap?: boolean) => void;
    rebuildColorMap: () => void;
    rebuildEphemeralFromDrawing: () => void;
    refreshUsedColors: () => void;
    setPalette: (colors: string[]) => void;
  };
};

type LinkedCelGroup = {
  celKeys: string[];
  linkType: CelLinkType;
};

// Keep this boundary free of store imports; this mirrors the animation store
// marker for shared transparent cels.
const EMPTY_CEL_LINK_ID = '__empty__';

export function restoreProjectPaletteForLoad(
  stores: ProjectLoadStores,
  file: ProjectFile,
  fromAutoSave: boolean
): void {
  const { palette } = stores;

  if (
    !fromAutoSave &&
    file.palette &&
    Array.isArray(file.palette) &&
    file.palette.length > 0
  ) {
    palette.setPalette(file.palette);
  }

  if (fromAutoSave) return;

  if (
    file.ephemeralPalette &&
    Array.isArray(file.ephemeralPalette) &&
    file.ephemeralPalette.length > 0
  ) {
    palette.ephemeralColors.value = file.ephemeralPalette;
    palette.rebuildColorMap();
    return;
  }

  palette.clearEphemeralColors(true);
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
  deletePlaceholderFrame(stores, placeholderFrameId);
}

export function restoreProjectAnimationState(
  stores: ProjectLoadStores,
  file: ProjectFile
): void {
  const { animation } = stores;

  animation.fps.value = file.animation.fps;

  const targetFrame = animation.frames.value[file.animation.currentFrameIndex];
  if (targetFrame) {
    animation.goToFrame(targetFrame.id);
  }
}

export function restoreProjectFrameTags(
  stores: ProjectLoadStores,
  file: ProjectFile
): void {
  stores.animation.tags.value =
    file.tags && Array.isArray(file.tags) ? file.tags : [];
}

export function refreshProjectPaletteAfterLoad(
  stores: ProjectLoadStores,
  fromAutoSave: boolean
): void {
  const { animation, palette } = stores;

  palette.rebuildEphemeralFromDrawing();

  if (fromAutoSave) {
    animation.rebuildAllIndexBuffers();
  }

  palette.refreshUsedColors();
}

export function selectFirstLoadedLayer(stores: ProjectLoadStores): void {
  const { layers: layerStore } = stores;
  const layers = layerStore.layers.value;
  if (layers.length > 0) {
    layerStore.setActiveLayer(layers[0].id);
  }
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
  const layerType = layerFile.type || 'image';
  const layer =
    layerType === 'text' && layerFile.textData
      ? layers.addTextLayer(layerFile.textData, layerFile.name, width, height)
      : layers.addLayer(layerFile.name, width, height);

  layers.updateLayer(layer.id, {
    id: layerFile.id,
    visible: layerFile.visible,
    opacity: layerFile.opacity,
    blendMode: layerFile.blendMode || 'normal',
    continuous: layerFile.continuous || false,
  });

  const restored = layers.layers.value.find((x) => x.id === layerFile.id);
  if (restored && hasProjectImageData(layerFile.data) && restored.canvas) {
    await loadImageDataToCanvas(layerFile.data, restored.canvas);
  }
}

function prepareFramesForLoad(stores: ProjectLoadStores): string | undefined {
  const { animation } = stores;

  while (animation.frames.value.length > 1) {
    animation.deleteFrame(animation.frames.value[0].id);
  }

  return animation.frames.value[0]?.id;
}

function addLoadedFrame(
  stores: ProjectLoadStores,
  frameFile: ProjectFrameFile
): Frame {
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
    cel.linkedCelId !== EMPTY_CEL_LINK_ID ||
    !hasProjectImageData(celFile.data)
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
  if (!cel || !hasProjectImageData(celFile.data)) return;

  const cels = new Map(animation.cels.value);

  if (celFile.indexData && Array.isArray(celFile.indexData)) {
    cels.set(celKey, {
      ...cel,
      indexBuffer: new Uint8Array(celFile.indexData),
    });
  } else if (canvas && !file.palette) {
    cels.set(celKey, {
      ...cel,
      indexBuffer: buildIndexBufferFromCanvas(canvas, true),
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
    stores.animation.setTextCelData(
      celFile.layerId,
      frameId,
      celFile.textCelData
    );
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
