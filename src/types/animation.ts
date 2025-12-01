export interface Frame {
  id: string;
  order: number;
  duration: number; // milliseconds
  tags?: AnimationTag[];
}

export interface AnimationTag {
  id: string;
  name: string;
  color: string;
}

export interface OnionSkinSettings {
  enabled: boolean;
  prevFrames: number;
  nextFrames: number;
  opacityStep: number;
  tint: boolean;
}

export interface Cel {
  id: string;
  layerId: string;
  frameId: string;
  canvas: HTMLCanvasElement;
}

export interface AnimationState {
  frames: Frame[];
  cels: Map<string, Cel>; // Key: `${layerId}:${frameId}`
  currentFrameId: string;
  isPlaying: boolean;
  fps: number;
  onionSkin: OnionSkinSettings;
}
