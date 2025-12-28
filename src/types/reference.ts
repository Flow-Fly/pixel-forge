export interface ReferenceImage {
  id: string;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  aboveLayers: boolean;
}

export interface SerializedReferenceImage {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  aboveLayers: boolean;
}
