import type { FrameTag } from './animation';

/** Current project file format version */
export const PROJECT_VERSION = '2.0.0';

export interface ProjectFile {
  version: string;
  name?: string; // Optional for backwards compatibility
  width: number;
  height: number;
  layers: {
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    data: string | Uint8Array; // Base64 (v1.x) or binary PNG (v2.0+)
  }[];
  frames: {
    id: string;
    duration: number;
    cels: {
      layerId: string;
      data: string | Uint8Array; // Base64 (v1.x) or binary PNG (v2.0+)
    }[];
  }[];
  animation: {
    fps: number;
    currentFrameIndex: number;
  };
  tags?: FrameTag[]; // Frame tags (v2.0+, optional for backward compat)
}
