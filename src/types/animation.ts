import type { TextCelData } from './text';
import type { CelLinkType } from '@pixel-forge/shared';

export { type CelLinkType, type FrameTag } from '@pixel-forge/shared';

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
  indexBuffer?: Uint8Array; // v3.0+: palette indices (1 byte per pixel, index 0 = transparent)
  linkedCelId?: string; // Group identifier for linked cels (share same canvas)
  linkType?: CelLinkType; // Type of link: 'soft' (auto-break) or 'hard' (user explicit)
  opacity?: number; // Cel-level opacity (0-100, default 100)
  // Text cel specific (only present for text layers)
  textCelData?: TextCelData;
}
