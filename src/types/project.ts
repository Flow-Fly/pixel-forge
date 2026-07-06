import type { FrameTag } from './animation';
import type { LayerType, BlendMode } from './layer';
import type { TextLayerData, TextCelData } from './text';

/**
 * Current project file format version.
 *
 * RULE: any change to the ProjectFile schema below must bump this constant
 * in the same PR, and the field must be annotated with the version that
 * introduced it (see existing `v2.1+` / `v3.0+` annotations).
 *
 * History: 3.1.0 added `ephemeralPalette`, 3.2.0 added `layers[].continuous`.
 */
export const PROJECT_VERSION = '3.2.0';

export type ProjectImageData = Uint8Array;
export type LegacyProjectImageData =
  | ProjectImageData
  | string
  | Record<string, number>;

export interface ProjectLayerFile {
  id: string;
  name: string;
  type?: LayerType;          // v2.1+: 'image' | 'text' (default: 'image' for backwards compat)
  visible: boolean;
  opacity: number;
  blendMode?: BlendMode;     // v2.1+: blend mode (default: 'normal')
  continuous?: boolean;      // v3.2+: continuous layer (new cels linked to previous frame)
  data: ProjectImageData;    // v2.0+: binary PNG bytes
  textData?: TextLayerData;  // v2.1+: text layer metadata (font, color)
}

export interface ProjectCelFile {
  layerId: string;
  data: ProjectImageData;        // v2.0+: binary PNG bytes
  indexData?: number[];          // v3.0+: palette indices for indexed color mode
  linkedCelId?: string;          // v2.2+: linked cel group ID (cels with same ID share canvas)
  linkType?: 'soft' | 'hard';    // v2.2+: 'soft' = auto-break on edit, 'hard' = user explicit
  textCelData?: TextCelData;     // v2.1+: text content and position
}

export interface ProjectFrameFile {
  id: string;
  duration: number;
  cels: ProjectCelFile[];
}

export interface ProjectFile {
  version: string;
  name?: string; // Optional for backwards compatibility
  width: number;
  height: number;
  palette?: string[]; // v3.0+: indexed color palette (hex strings)
  ephemeralPalette?: string[]; // v3.1+: ephemeral/untracked colors (generated shades)
  layers: ProjectLayerFile[];
  frames: ProjectFrameFile[];
  animation: {
    fps: number;
    currentFrameIndex: number;
  };
  tags?: FrameTag[]; // Frame tags (v2.0+, optional for backward compat)
}

export type ProjectLayerFileInput = Omit<ProjectLayerFile, 'data'> & {
  data: LegacyProjectImageData;
};

export type ProjectCelFileInput = Omit<ProjectCelFile, 'data'> & {
  data: LegacyProjectImageData;
};

export type ProjectFrameFileInput = Omit<ProjectFrameFile, 'cels'> & {
  cels: ProjectCelFileInput[];
};

export type ProjectFileInput = Omit<ProjectFile, 'layers' | 'frames'> & {
  layers: ProjectLayerFileInput[];
  frames: ProjectFrameFileInput[];
};
