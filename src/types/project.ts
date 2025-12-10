import type { FrameTag } from './animation';
import type { LayerType, BlendMode } from './layer';
import type { TextLayerData, TextCelData } from './text';

/** Current project file format version */
export const PROJECT_VERSION = '2.1.0';

export interface ProjectFile {
  version: string;
  name?: string; // Optional for backwards compatibility
  width: number;
  height: number;
  layers: {
    id: string;
    name: string;
    type?: LayerType;          // v2.1+: 'image' | 'text' (default: 'image' for backwards compat)
    visible: boolean;
    opacity: number;
    blendMode?: BlendMode;     // v2.1+: blend mode (default: 'normal')
    data: string | Uint8Array; // Base64 (v1.x) or binary PNG (v2.0+)
    textData?: TextLayerData;  // v2.1+: text layer metadata (font, color)
  }[];
  frames: {
    id: string;
    duration: number;
    cels: {
      layerId: string;
      data: string | Uint8Array;   // Base64 (v1.x) or binary PNG (v2.0+)
      textCelData?: TextCelData;   // v2.1+: text content and position
    }[];
  }[];
  animation: {
    fps: number;
    currentFrameIndex: number;
  };
  tags?: FrameTag[]; // Frame tags (v2.0+, optional for backward compat)
}
