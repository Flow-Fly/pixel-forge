import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';
import { projectStore } from '../stores/project';

export interface SpritesheetOptions {
  direction: 'horizontal' | 'vertical' | 'grid';
  columns?: number; // For grid layout
  padding: number;
  includeJSON: boolean;
}

export interface SpritesheetFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

export interface SpritesheetMetadata {
  frames: Record<string, SpritesheetFrame>;
  meta: {
    app: string;
    version: string;
    image: string;
    size: { w: number; h: number };
    format: string;
  };
}

export interface SpritesheetResult {
  canvas: HTMLCanvasElement;
  metadata: SpritesheetMetadata;
}

/**
 * Composite all visible layers for a specific frame into a single canvas.
 */
function compositeFrame(frameId: string): HTMLCanvasElement {
  const width = projectStore.width.value;
  const height = projectStore.height.value;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Optionally fill background
  const bgColor = projectStore.backgroundColor.value;
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Composite layers for this frame
  const layers = layerStore.layers.value;
  for (const layer of layers) {
    if (!layer.visible) continue;

    const celCanvas = animationStore.getCelCanvas(frameId, layer.id);
    if (celCanvas) {
      ctx.globalAlpha = layer.opacity / 255;
      ctx.drawImage(celCanvas, 0, 0);
    }
  }
  ctx.globalAlpha = 1;

  return canvas;
}

/**
 * Generate a sprite sheet from all animation frames.
 */
export function generateSpritesheet(options: SpritesheetOptions): SpritesheetResult {
  const frames = animationStore.frames.value;
  const frameCount = frames.length;
  const frameWidth = projectStore.width.value;
  const frameHeight = projectStore.height.value;
  const padding = options.padding;

  // Calculate dimensions based on layout
  let columns: number;
  let rows: number;

  if (options.direction === 'horizontal') {
    columns = frameCount;
    rows = 1;
  } else if (options.direction === 'vertical') {
    columns = 1;
    rows = frameCount;
  } else {
    // Grid layout
    columns = options.columns || Math.ceil(Math.sqrt(frameCount));
    rows = Math.ceil(frameCount / columns);
  }

  const sheetWidth = columns * frameWidth + (columns - 1) * padding;
  const sheetHeight = rows * frameHeight + (rows - 1) * padding;

  // Create sprite sheet canvas
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = sheetWidth;
  sheetCanvas.height = sheetHeight;
  const sheetCtx = sheetCanvas.getContext('2d')!;

  // Build metadata
  const metadata: SpritesheetMetadata = {
    frames: {},
    meta: {
      app: 'PixelForge',
      version: '1.0',
      image: 'spritesheet.png',
      size: { w: sheetWidth, h: sheetHeight },
      format: 'RGBA8888',
    },
  };

  // Draw each frame
  frames.forEach((frame, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * (frameWidth + padding);
    const y = row * (frameHeight + padding);

    // Composite the frame
    const frameCanvas = compositeFrame(frame.id);
    sheetCtx.drawImage(frameCanvas, x, y);

    // Add to metadata (TexturePacker JSON Hash format)
    const frameName = `sprite_${index}`;
    metadata.frames[frameName] = {
      frame: { x, y, w: frameWidth, h: frameHeight },
      sourceSize: { w: frameWidth, h: frameHeight },
      duration: frame.duration,
    };
  });

  return {
    canvas: sheetCanvas,
    metadata,
  };
}

/**
 * Export sprite sheet as PNG and optionally JSON metadata.
 */
export function exportSpritesheet(
  filename: string,
  options: SpritesheetOptions
): void {
  const result = generateSpritesheet(options);

  // Export PNG
  const pngUrl = result.canvas.toDataURL('image/png');
  const pngLink = document.createElement('a');
  pngLink.href = pngUrl;
  pngLink.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  pngLink.click();

  // Export JSON metadata if requested
  if (options.includeJSON) {
    result.metadata.meta.image = pngLink.download;
    const jsonStr = JSON.stringify(result.metadata, null, 2);
    const jsonBlob = new Blob([jsonStr], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = filename.replace(/\.png$/, '') + '.json';
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);
  }
}
