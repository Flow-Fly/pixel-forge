import { animationStore, EMPTY_CEL_LINK_ID } from '../stores/animation';
import { layerStore } from '../stores/layers';
import { paletteStore } from '../stores/palette';
import type { CelLinkType, Frame } from '../types/animation';
import type {
  ProjectCelFile,
  ProjectFile,
  ProjectFrameFile,
  ProjectLayerFile,
} from '../types/project';
import { loadImageDataToCanvas } from '../utils/canvas-binary';
import { buildIndexBufferFromCanvas } from '../utils/indexed-color';
import { hasProjectImageData } from './project-data';

type LinkedCelGroup = {
  celKeys: string[];
  linkType: CelLinkType;
};

export function restoreProjectPaletteForLoad(
  file: ProjectFile,
  fromAutoSave: boolean
): void {
  if (
    !fromAutoSave &&
    file.palette &&
    Array.isArray(file.palette) &&
    file.palette.length > 0
  ) {
    paletteStore.setPalette(file.palette);
  }

  if (fromAutoSave) return;

  if (
    file.ephemeralPalette &&
    Array.isArray(file.ephemeralPalette) &&
    file.ephemeralPalette.length > 0
  ) {
    paletteStore.ephemeralColors.value = file.ephemeralPalette;
    paletteStore.rebuildColorMap();
    return;
  }

  paletteStore.clearEphemeralColors(true);
}

export async function hydrateProjectLayers(file: ProjectFile): Promise<void> {
  clearLoadedLayers();

  for (const layerFile of file.layers) {
    await hydrateProjectLayer(layerFile, file.width, file.height);
  }
}

export async function hydrateProjectFrames(file: ProjectFile): Promise<void> {
  const placeholderFrameId = prepareFramesForLoad();
  const linkedCelGroups = new Map<string, LinkedCelGroup>();

  for (const frameFile of file.frames) {
    const frame = addLoadedFrame(frameFile);
    await hydrateFrameCels(frameFile, frame.id, file, linkedCelGroups);
  }

  restoreLinkedCelGroups(linkedCelGroups);
  deletePlaceholderFrame(placeholderFrameId);
}

export function restoreProjectAnimationState(file: ProjectFile): void {
  animationStore.fps.value = file.animation.fps;

  const targetFrame =
    animationStore.frames.value[file.animation.currentFrameIndex];
  if (targetFrame) {
    animationStore.goToFrame(targetFrame.id);
  }
}

export function restoreProjectFrameTags(file: ProjectFile): void {
  animationStore.tags.value =
    file.tags && Array.isArray(file.tags) ? file.tags : [];
}

export function refreshProjectPaletteAfterLoad(fromAutoSave: boolean): void {
  paletteStore.rebuildEphemeralFromDrawing();

  if (fromAutoSave) {
    animationStore.rebuildAllIndexBuffers();
  }

  paletteStore.refreshUsedColors();
}

export function selectFirstLoadedLayer(): void {
  const layers = layerStore.layers.value;
  if (layers.length > 0) {
    layerStore.setActiveLayer(layers[0].id);
  }
}

function clearLoadedLayers(): void {
  while (layerStore.layers.value.length > 0) {
    layerStore.removeLayer(layerStore.layers.value[0].id);
  }
}

async function hydrateProjectLayer(
  layerFile: ProjectLayerFile,
  width: number,
  height: number
): Promise<void> {
  const layerType = layerFile.type || 'image';
  const layer =
    layerType === 'text' && layerFile.textData
      ? layerStore.addTextLayer(layerFile.textData, layerFile.name, width, height)
      : layerStore.addLayer(layerFile.name, width, height);

  layerStore.updateLayer(layer.id, {
    id: layerFile.id,
    visible: layerFile.visible,
    opacity: layerFile.opacity,
    blendMode: layerFile.blendMode || 'normal',
    continuous: layerFile.continuous || false,
  });

  const restored = layerStore.layers.value.find((x) => x.id === layerFile.id);
  if (restored && hasProjectImageData(layerFile.data) && restored.canvas) {
    await loadImageDataToCanvas(layerFile.data, restored.canvas);
  }
}

function prepareFramesForLoad(): string | undefined {
  while (animationStore.frames.value.length > 1) {
    animationStore.deleteFrame(animationStore.frames.value[0].id);
  }

  return animationStore.frames.value[0]?.id;
}

function addLoadedFrame(frameFile: ProjectFrameFile): Frame {
  animationStore.addFrame(false);
  const frame =
    animationStore.frames.value[animationStore.frames.value.length - 1];
  animationStore.setFrameDuration(frame.id, frameFile.duration);
  return frame;
}

async function hydrateFrameCels(
  frameFile: ProjectFrameFile,
  frameId: string,
  file: ProjectFile,
  linkedCelGroups: Map<string, LinkedCelGroup>
): Promise<void> {
  for (const celFile of frameFile.cels) {
    const celKey = animationStore.getCelKey(celFile.layerId, frameId);

    giveSharedTransparentCelOwnCanvas(celKey, celFile, file);
    await hydrateCelImage(celKey, frameId, celFile, file);
    restoreTextCelData(frameId, celFile);
    trackLinkedCelGroup(celKey, celFile, linkedCelGroups);
  }
}

function giveSharedTransparentCelOwnCanvas(
  celKey: string,
  celFile: ProjectCelFile,
  file: ProjectFile
): void {
  const cel = animationStore.cels.value.get(celKey);
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

  const cels = new Map(animationStore.cels.value);
  cels.set(celKey, {
    ...cel,
    canvas,
    linkedCelId: undefined,
    linkType: undefined,
  });
  animationStore.cels.value = cels;
}

async function hydrateCelImage(
  celKey: string,
  frameId: string,
  celFile: ProjectCelFile,
  file: ProjectFile
): Promise<void> {
  const canvas = animationStore.getCelCanvas(frameId, celFile.layerId);
  if (canvas && hasProjectImageData(celFile.data)) {
    await loadImageDataToCanvas(celFile.data, canvas);
  }

  restoreCelIndexBuffer(celKey, celFile, canvas, file);
}

function restoreCelIndexBuffer(
  celKey: string,
  celFile: ProjectCelFile,
  canvas: HTMLCanvasElement | undefined,
  file: ProjectFile
): void {
  const cel = animationStore.cels.value.get(celKey);
  if (!cel || !hasProjectImageData(celFile.data)) return;

  const cels = new Map(animationStore.cels.value);

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

  animationStore.cels.value = cels;
}

function restoreTextCelData(frameId: string, celFile: ProjectCelFile): void {
  if (celFile.textCelData) {
    animationStore.setTextCelData(celFile.layerId, frameId, celFile.textCelData);
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
  linkedCelGroups: Map<string, LinkedCelGroup>
): void {
  for (const [linkedCelId, { celKeys, linkType }] of linkedCelGroups) {
    if (celKeys.length >= 2) {
      animationStore.linkCels(celKeys, linkType);
      continue;
    }

    if (celKeys.length === 1) {
      restoreOrphanedLinkedCel(celKeys[0], linkedCelId, linkType);
    }
  }
}

function restoreOrphanedLinkedCel(
  celKey: string,
  linkedCelId: string,
  linkType: CelLinkType
): void {
  const cels = new Map(animationStore.cels.value);
  const cel = cels.get(celKey);
  if (!cel) return;

  cels.set(celKey, { ...cel, linkedCelId, linkType });
  animationStore.cels.value = cels;
}

function deletePlaceholderFrame(placeholderFrameId: string | undefined): void {
  if (placeholderFrameId && animationStore.frames.value.length > 1) {
    animationStore.deleteFrame(placeholderFrameId);
  }
}
