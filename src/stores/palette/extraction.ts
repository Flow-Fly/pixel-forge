/**
 * Color extraction from drawing.
 *
 * Extracts distinct colors from canvas layers and clusters
 * similar colors together.
 */

import { hexToRgb, rgbToHsl, rgbToHex, hslDistance, type HSL } from './color-utils';
import { isReferenceLayer } from '../../utils/layer-capabilities';

/** Simple readable signal interface */
interface Readable<T> {
  value: T;
}

type DrawingLayer = { id: string; visible: boolean; type?: string };
type DrawingCel = {
  canvas: HTMLCanvasElement | null;
  layerId: string;
  frameId: string;
};

type DrawingAnimationStore = {
  currentFrameId: Readable<string>;
  cels: Readable<Map<string, DrawingCel>>;
  getCelKey: (layerId: string, frameId: string) => string;
};

type DrawingLayerStore = {
  layers: Readable<DrawingLayer[]>;
};

/**
 * Extract distinct colors from visible layers of the current frame.
 * Returns clustered representative colors sorted by pixel count.
 */
export async function extractColorsFromDrawing(
  animationStore: DrawingAnimationStore,
  layerStore: DrawingLayerStore
): Promise<string[]> {
  const colorCounts = collectVisibleLayerColors(animationStore, layerStore);

  if (colorCounts.size === 0) {
    return [];
  }

  // Cluster similar colors
  const clusters = clusterColors(colorCounts);

  // Sort by total pixel count and return all distinct colors (no limit)
  clusters.sort((a, b) => b.count - a.count);
  return clusters.map(c => c.representative);
}

function collectVisibleLayerColors(
  animationStore: DrawingAnimationStore,
  layerStore: DrawingLayerStore
): Map<string, number> {
  const currentFrameId = animationStore.currentFrameId.value;
  const layers = layerStore.layers.value;
  const cels = animationStore.cels.value;

  // Collect all pixel colors from visible layers
  const colorCounts = new Map<string, number>();

  for (const layer of layers) {
    if (!layer.visible) continue;
    if (isReferenceLayer(layer)) continue;

    const key = animationStore.getCelKey(layer.id, currentFrameId);
    const cel = cels.get(key);
    if (!cel?.canvas) continue;

    addCanvasColors(cel.canvas, colorCounts);
  }

  return colorCounts;
}

function addCanvasColors(canvas: HTMLCanvasElement, colorCounts: Map<string, number>) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue; // Skip transparent pixels

    const hex = rgbToHex(data[i], data[i + 1], data[i + 2]);
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  }
}

interface ColorCluster {
  colors: Map<string, number>;
  hsl: HSL;
}

interface ClusterResult {
  representative: string;
  count: number;
}

/**
 * Cluster similar colors together using HSL distance.
 * Returns representative color (most frequent) for each cluster.
 */
function clusterColors(
  colorCounts: Map<string, number>
): ClusterResult[] {
  const threshold = 0.15; // HSL distance threshold for clustering
  const clusters: ColorCluster[] = [];

  for (const [hex, count] of colorCounts) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    // Find existing cluster within threshold
    let foundCluster = false;
    for (const cluster of clusters) {
      const dist = hslDistance(hsl, cluster.hsl);
      if (dist < threshold) {
        cluster.colors.set(hex, count);
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      const newCluster: ColorCluster = { colors: new Map(), hsl };
      newCluster.colors.set(hex, count);
      clusters.push(newCluster);
    }
  }

  // Convert clusters to result format with representative color (most frequent in cluster)
  return clusters.map(cluster => {
    let maxCount = 0;
    let representative = '';
    let totalCount = 0;

    for (const [hex, count] of cluster.colors) {
      totalCount += count;
      if (count > maxCount) {
        maxCount = count;
        representative = hex;
      }
    }

    return { representative, count: totalCount };
  });
}
