export interface ProjectFile {
  version: string;
  width: number;
  height: number;
  layers: {
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    data: string; // Base64 encoded PNG data
  }[];
  frames: {
    id: string;
    duration: number;
    cels: {
      layerId: string;
      data: string; // Base64 encoded PNG data
    }[];
  }[];
  animation: {
    fps: number;
    currentFrameIndex: number;
  };
}
