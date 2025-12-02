import { parseAseFile, celToImageData, type AseFile } from './aseprite-parser';
import { exportAseFile } from './aseprite-writer';
import { projectStore } from '../stores/project';
import { layerStore } from '../stores/layers';
import { animationStore } from '../stores/animation';

/**
 * Import an Aseprite file into the current project.
 * This replaces the current project content.
 */
export async function importAseFile(buffer: ArrayBuffer): Promise<void> {
  const aseFile = parseAseFile(buffer);

  // Set project dimensions
  projectStore.setSize(aseFile.header.width, aseFile.header.height);

  // Clear existing frames (keep one, deleteFrame won't delete the last)
  while (animationStore.frames.value.length > 1) {
    animationStore.deleteFrame(animationStore.frames.value[0].id);
  }

  // Clear existing layers (this will leave us with no layers temporarily)
  while (layerStore.layers.value.length > 0) {
    layerStore.removeLayer(layerStore.layers.value[0].id);
  }

  // Create layers (filter out groups, only use image layers)
  const imageLayers = aseFile.layers.filter((l) => l.type === 0);
  const layerIdMap = new Map<number, string>(); // Map Aseprite layer index to our layer ID

  imageLayers.forEach((aseLayer) => {
    // Find original index in the full layers array
    const originalIndex = aseFile.layers.indexOf(aseLayer);
    const layer = layerStore.addLayer(aseLayer.name, aseFile.header.width, aseFile.header.height);

    layer.visible = (aseLayer.flags & 1) !== 0;
    layer.opacity = aseLayer.opacity;

    // Map blend mode
    const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
    layer.blendMode = blendModes[aseLayer.blendMode] || 'normal';

    layerIdMap.set(originalIndex, layer.id);
  });

  // Track the old frame we need to delete later
  const oldFrameId = animationStore.frames.value[0]?.id;

  // Create frames and populate cels
  aseFile.frames.forEach((aseFrame) => {
    // Add frame (don't duplicate)
    animationStore.addFrame(false);
    const frames = animationStore.frames.value;
    const frame = frames[frames.length - 1];
    frame.duration = aseFrame.duration;

    // Process cels
    aseFrame.cels.forEach((cel) => {
      const layerId = layerIdMap.get(cel.layerIndex);
      if (!layerId) return; // Skip if layer doesn't exist (e.g., group layer)

      // Handle linked cels
      if (cel.celType === 1 && cel.linkedFrame !== undefined) {
        // Linked cel - copy from referenced frame
        const linkedFrameData = aseFile.frames[cel.linkedFrame];
        const linkedCel = linkedFrameData?.cels.find((c) => c.layerIndex === cel.layerIndex);
        if (linkedCel) {
          const imageData = celToImageData(linkedCel, aseFile.header, aseFile.palette);
          if (imageData) {
            drawCelToCanvas(frame.id, layerId, cel.x, cel.y, imageData);
          }
        }
      } else {
        // Regular or compressed cel
        const imageData = celToImageData(cel, aseFile.header, aseFile.palette);
        if (imageData) {
          drawCelToCanvas(frame.id, layerId, cel.x, cel.y, imageData);
        }
      }
    });
  });

  // Now delete the old placeholder frame (we have new ones now)
  if (oldFrameId && animationStore.frames.value.length > 1) {
    animationStore.deleteFrame(oldFrameId);
  }

  // Go to first frame
  const frames = animationStore.frames.value;
  if (frames.length > 0) {
    animationStore.goToFrame(frames[0].id);
  }
}

/**
 * Draw ImageData to a cel canvas at the specified position.
 */
function drawCelToCanvas(
  frameId: string,
  layerId: string,
  x: number,
  y: number,
  imageData: ImageData
): void {
  const celCanvas = animationStore.getCelCanvas(frameId, layerId);
  if (!celCanvas) return;

  const ctx = celCanvas.getContext('2d')!;

  // Create temporary canvas to hold the image data
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageData, 0, 0);

  // Draw at position
  ctx.drawImage(tempCanvas, x, y);
}

/**
 * Open file dialog to import an Aseprite file.
 */
export function openAseFile(): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ase,.aseprite';

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        await importAseFile(buffer);
        resolve();
      } catch (error) {
        reject(new Error(`Failed to import Aseprite file: ${error}`));
      }
    };

    input.click();
  });
}

// Re-export the export function for convenience
export { exportAseFile };
