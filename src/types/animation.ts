import type { TextCelData } from './text';

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

/**
 * Frame tag that spans a range of frames.
 * Used for grouping frames and looping within sections.
 */
export interface FrameTag {
  id: string;
  name: string;
  color: string;
  startFrameIndex: number;
  endFrameIndex: number;
  collapsed: boolean;
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
  linkedCelId?: string;  // Group identifier for linked cels (share same canvas)
  opacity?: number;      // Cel-level opacity (0-100, default 100)
  // Text cel specific (only present for text layers)
  textCelData?: TextCelData;
}

export interface AnimationState {
  frames: Frame[];
  cels: Map<string, Cel>; // Key: `${layerId}:${frameId}`
  currentFrameId: string;
  isPlaying: boolean;
  fps: number;
  onionSkin: OnionSkinSettings;
}
