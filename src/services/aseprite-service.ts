import { parseAseFile, celToImageData } from './aseprite-parser';
import { exportAseFile } from './aseprite-writer';
import {
  getActiveProjectContext,
  type ProjectAnimationStore,
  type ProjectContext,
} from '../stores/project-context';
import type { BlendMode } from '../types/layer';

// Track linked cels to establish links after all frames are created
interface LinkedCelRecord {
  sourceFrameIndex: number;
  targetFrameIndex: number;
  layerId: string;
}

/**
 * Import an Aseprite file into one project context.
 * Existing callers keep targeting the active project by default.
 */
export async function importAseFile(
  buffer: ArrayBuffer,
  context: ProjectContext = getActiveProjectContext()
): Promise<void> {
  const aseFile = parseAseFile(buffer);
  const { animation, layers, project } = context;

  // Set project dimensions
  project.setSize(aseFile.header.width, aseFile.header.height);

  // Clear existing frames (keep one, deleteFrame won't delete the last)
  while (animation.frames.value.length > 1) {
    animation.deleteFrame(animation.frames.value[0].id);
  }

  // Clear existing layers (this will leave us with no layers temporarily)
  while (layers.layers.value.length > 0) {
    layers.removeLayer(layers.layers.value[0].id);
  }

  // Create layers (filter out groups, only use image layers)
  const imageLayers = aseFile.layers.filter((l) => l.type === 0);
  const layerIdMap = new Map<number, string>(); // Map Aseprite layer index to our layer ID

  imageLayers.forEach((aseLayer) => {
    // Find original index in the full layers array
    const originalIndex = aseFile.layers.indexOf(aseLayer);
    const layer = layers.addLayer(aseLayer.name, aseFile.header.width, aseFile.header.height);

    layer.visible = (aseLayer.flags & 1) !== 0;
    layer.opacity = aseLayer.opacity;

    // Map blend mode
    const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
    layer.blendMode = (blendModes[aseLayer.blendMode] || 'normal') as BlendMode;

    layerIdMap.set(originalIndex, layer.id);
  });

  // Track the old frame we need to delete later
  const oldFrameId = animation.frames.value[0]?.id;

  // Track linked cels to establish links after all frames exist
  const linkedCelRecords: LinkedCelRecord[] = [];

  // Track created frames by index for later reference
  const createdFrameIds: string[] = [];

  // Create frames and populate cels
  aseFile.frames.forEach((aseFrame, frameIndex) => {
    // Add frame (don't duplicate)
    animation.addFrame(false);
    const frames = animation.frames.value;
    const frame = frames[frames.length - 1];
    frame.duration = aseFrame.duration;

    // Store frame ID for linking later
    createdFrameIds.push(frame.id);

    // Process cels
    aseFrame.cels.forEach((cel) => {
      const layerId = layerIdMap.get(cel.layerIndex);
      if (!layerId) return; // Skip if layer doesn't exist (e.g., group layer)

      // Handle linked cels
      if (cel.celType === 1 && cel.linkedFrame !== undefined) {
        // Record for linking after all frames exist
        linkedCelRecords.push({
          sourceFrameIndex: cel.linkedFrame,
          targetFrameIndex: frameIndex,
          layerId,
        });
        // Don't draw anything - we'll link to the source cel's canvas
      } else {
        // Regular or compressed cel - draw to canvas
        const imageData = celToImageData(cel, aseFile.header, aseFile.palette);
        if (imageData) {
          drawCelToCanvas(animation, frame.id, layerId, cel.x, cel.y, imageData);
        }
      }
    });
  });

  // Now delete the old placeholder frame (we have new ones now)
  if (oldFrameId && animation.frames.value.length > 1) {
    animation.deleteFrame(oldFrameId);
  }

  // Establish hard links for linked cels
  // Group by source frame + layer to link all cels that share the same source
  const linkGroups = new Map<string, string[]>(); // "sourceFrameIndex:layerId" -> [celKeys]

  for (const record of linkedCelRecords) {
    const sourceFrameId = createdFrameIds[record.sourceFrameIndex];
    const targetFrameId = createdFrameIds[record.targetFrameIndex];
    if (!sourceFrameId || !targetFrameId) continue;

    const groupKey = `${record.sourceFrameIndex}:${record.layerId}`;
    const sourceCelKey = animation.getCelKey(record.layerId, sourceFrameId);
    const targetCelKey = animation.getCelKey(record.layerId, targetFrameId);

    if (!linkGroups.has(groupKey)) {
      // Start with source cel
      linkGroups.set(groupKey, [sourceCelKey]);
    }
    linkGroups.get(groupKey)!.push(targetCelKey);
  }

  // Imported cels were painted directly, so synchronize their indexed-color
  // buffers before links share the source cel's canvas and buffer.
  animation.rebuildAllIndexBuffers();

  // Apply hard links
  for (const celKeys of linkGroups.values()) {
    if (celKeys.length >= 2) {
      animation.linkCels(celKeys, 'hard');
    }
  }

  // Import tags
  for (const aseTag of aseFile.tags) {
    // Convert RGB to hex color
    const color = `#${aseTag.color.r.toString(16).padStart(2, '0')}${aseTag.color.g
      .toString(16)
      .padStart(2, '0')}${aseTag.color.b.toString(16).padStart(2, '0')}`;
    animation.addFrameTag(aseTag.name, color, aseTag.fromFrame, aseTag.toFrame);
  }

  // Go to first frame
  const frames = animation.frames.value;
  if (frames.length > 0) {
    animation.goToFrame(frames[0].id);
  }
}

/**
 * Draw ImageData to a cel canvas at the specified position.
 * Ensures the cel has its own canvas (breaks soft links to shared empty canvas).
 */
function drawCelToCanvas(
  animation: ProjectAnimationStore,
  frameId: string,
  layerId: string,
  x: number,
  y: number,
  imageData: ImageData
): void {
  // Break any soft link to shared empty canvas - this cel needs its own canvas
  animation.ensureUnlinkedForEdit(layerId, frameId);

  const celCanvas = animation.getCelCanvas(frameId, layerId);
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

// Re-export the export function for convenience
export { exportAseFile };
