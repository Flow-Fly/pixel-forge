/** Base properties shared between runtime and serialized reference images */
interface ReferenceImageBase {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  aboveLayers: boolean;
}

/** Runtime reference image with canvas element */
export interface ReferenceImage extends ReferenceImageBase {
  canvas: HTMLCanvasElement;
}

/** Serialized reference image with data URL for persistence */
export interface SerializedReferenceImage extends ReferenceImageBase {
  dataUrl: string;
}
