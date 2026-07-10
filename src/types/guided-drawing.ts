export const GUIDED_DRAWING_VERSION = 1;

export type GuidedPaletteSource = 'generated' | 'restricted';
export type GuidedColorMapping = 'color' | 'luminance';

export interface GuidedDrawingSettings {
  longSide: number;
  paletteSource: GuidedPaletteSource;
  maxColors?: number;
  restrictedPalette?: string[];
  mapping: GuidedColorMapping;
  simplifyIsolatedPixels: boolean;
}

export interface GuidedDrawingSessionFile {
  version: typeof GUIDED_DRAWING_VERSION;
  width: number;
  height: number;
  target: number[];
  guideColorCount?: number;
  settings: GuidedDrawingSettings;
  sourceName?: string;
  createdAt: number;
}

export interface GuidedDrawingSession
  extends Omit<GuidedDrawingSessionFile, 'target'> {
  target: Uint8Array;
}
