import type { Cel } from '../types/animation';
import type { Layer } from '../types/layer';
import { getDefaultFont, getFont, renderText } from '../utils/pixel-fonts';

export interface ArtworkCompositionContext {
  readonly frameId: string;
  readonly layers: readonly Layer[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly getCelKey?: (layerId: string, frameId: string) => string;
}

interface ArtworkStepCommon {
  readonly layerId: string;
  readonly alpha: number;
  readonly compositeOperation: GlobalCompositeOperation;
}

export interface ImageArtworkStep extends ArtworkStepCommon {
  readonly kind: 'image';
  readonly canvas: HTMLCanvasElement;
}

export interface GroupCelArtworkStep extends ArtworkStepCommon {
  readonly kind: 'group-cel';
  readonly canvas: HTMLCanvasElement;
}

export interface TextArtworkStep extends ArtworkStepCommon {
  readonly kind: 'text';
  readonly textData: Readonly<NonNullable<Layer['textData']>>;
  readonly textCelData: Readonly<NonNullable<Cel['textCelData']>>;
}

export type ArtworkCompositionStep =
  | ImageArtworkStep
  | GroupCelArtworkStep
  | TextArtworkStep;

export interface ArtworkCompositionPlan {
  readonly frameId: string;
  readonly steps: readonly ArtworkCompositionStep[];
}

function getCelKey(layerId: string, frameId: string, context: ArtworkCompositionContext): string {
  return context.getCelKey?.(layerId, frameId) ?? `${layerId}:${frameId}`;
}

function getCelForLayer(
  layer: Layer,
  context: ArtworkCompositionContext
): Cel | undefined {
  return context.cels.get(getCelKey(layer.id, context.frameId, context));
}

function getCompositeOperation(layer: Layer): GlobalCompositeOperation {
  return layer.blendMode === 'normal'
    ? 'source-over'
    : (layer.blendMode as GlobalCompositeOperation);
}

function getCombinedAlpha(layer: Layer, cel: Cel): number {
  const layerAlpha = Math.max(0, Math.min(255, layer.opacity)) / 255;
  const celAlpha = Math.max(0, Math.min(100, cel.opacity ?? 100)) / 100;
  return layerAlpha * celAlpha;
}

function createCanvasStep(
  layer: Layer,
  cel: Cel,
  alpha: number,
  compositeOperation: GlobalCompositeOperation
): ImageArtworkStep | GroupCelArtworkStep | undefined {
  if (!cel.canvas) return undefined;

  if (layer.type === 'group') {
    return {
      kind: 'group-cel',
      layerId: layer.id,
      canvas: cel.canvas,
      alpha,
      compositeOperation,
    };
  }

  return {
    kind: 'image',
    layerId: layer.id,
    canvas: cel.canvas,
    alpha,
    compositeOperation,
  };
}

function createTextStep(
  layer: Layer,
  cel: Cel,
  alpha: number,
  compositeOperation: GlobalCompositeOperation
): TextArtworkStep | undefined {
  if (layer.type !== 'text' || !layer.textData || !cel.textCelData) return undefined;

  return {
    kind: 'text',
    layerId: layer.id,
    textData: Object.freeze({ ...layer.textData }),
    textCelData: Object.freeze({ ...cel.textCelData }),
    alpha,
    compositeOperation,
  };
}

/**
 * Build the read-only artwork description for one explicitly captured frame.
 * The plan never resolves an active project, draws, performs I/O, or mutates state.
 */
export function createArtworkCompositionPlan(
  context: ArtworkCompositionContext
): ArtworkCompositionPlan {
  const steps: ArtworkCompositionStep[] = [];

  for (const layer of context.layers) {
    if (!layer.visible || layer.type === 'reference') continue;

    const cel = getCelForLayer(layer, context);
    if (!cel) continue;

    const alpha = getCombinedAlpha(layer, cel);
    const compositeOperation = getCompositeOperation(layer);
    const textStep = createTextStep(layer, cel, alpha, compositeOperation);
    if (textStep) {
      steps.push(textStep);
      continue;
    }

    // A text layer with authoritative metadata but no frame text has no
    // drawable fallback. Its optional raster is derived compatibility data.
    if (layer.type === 'text' && layer.textData) continue;

    const canvasStep = createCanvasStep(layer, cel, alpha, compositeOperation);
    if (canvasStep) steps.push(canvasStep);
  }

  return { frameId: context.frameId, steps };
}

/**
 * Draw a composition plan without changing project state. Canvas state is
 * restored to the neutral artwork state even when a draw operation fails.
 */
export function drawArtworkComposition(
  targetCtx: CanvasRenderingContext2D,
  plan: ArtworkCompositionPlan
): void {
  try {
    for (const step of plan.steps) {
      targetCtx.globalAlpha = step.alpha;
      targetCtx.globalCompositeOperation = step.compositeOperation;

      if (step.kind === 'text') {
        const font = getFont(step.textData.font) ?? getDefaultFont();
        if (step.textCelData.content) {
          renderText(
            targetCtx,
            step.textCelData.content,
            step.textCelData.x,
            step.textCelData.y,
            font,
            step.textData.color
          );
        }
      } else {
        targetCtx.drawImage(step.canvas, 0, 0);
      }
    }
  } finally {
    targetCtx.globalAlpha = 1;
    targetCtx.globalCompositeOperation = 'source-over';
  }
}

export interface ExportFrameCompositionOptions {
  frameId: string;
  width: number;
  height: number;
  scale: number;
  layers: readonly Layer[];
  cels?: ReadonlyMap<string, Cel>;
  getCelKey?: (layerId: string, frameId: string) => string;
  /** Compatibility adapter for callers that only have canvas access. */
  getCelCanvas?: (frameId: string, layerId: string) => HTMLCanvasElement | undefined;
  useBackground?: boolean;
  backgroundColor?: string;
}

function isExportableArtworkLayer(layer: Layer): boolean {
  return layer.type !== 'reference';
}

export function getExportableArtworkLayers(layers: readonly Layer[]): Layer[] {
  return layers.filter(isExportableArtworkLayer);
}

function buildExportCels(options: ExportFrameCompositionOptions): ReadonlyMap<string, Cel> {
  if (options.cels) return options.cels;

  const cels = new Map<string, Cel>();
  for (const layer of options.layers) {
    if (!layer.visible || layer.type === 'reference') continue;

    const canvas = options.getCelCanvas?.(options.frameId, layer.id);
    if (!canvas) continue;

    const key = options.getCelKey?.(layer.id, options.frameId) ?? `${layer.id}:${options.frameId}`;
    cels.set(key, {
      id: `${layer.id}:${options.frameId}`,
      layerId: layer.id,
      frameId: options.frameId,
      canvas,
      opacity: 100,
    });
  }
  return cels;
}

export function composeExportFrame({
  frameId,
  width,
  height,
  scale,
  layers,
  cels,
  getCelKey: getCelKeyOption,
  getCelCanvas,
  useBackground = false,
  backgroundColor = '#ffffff',
}: ExportFrameCompositionOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;

  ctx.imageSmoothingEnabled = false;

  if (useBackground) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.scale(scale, scale);
  const plan = createArtworkCompositionPlan({
    frameId,
    layers,
    cels: cels ?? buildExportCels({
      frameId,
      width,
      height,
      scale,
      layers,
      cels,
      getCelKey: getCelKeyOption,
      getCelCanvas,
    }),
    getCelKey: getCelKeyOption,
  });
  drawArtworkComposition(ctx, plan);

  return canvas;
}
