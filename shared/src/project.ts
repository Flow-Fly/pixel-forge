/**
 * Current project file format version.
 *
 * Any serialized schema change must bump this value in the same pull request.
 * Extraction alone is not a format change.
 *
 * History: 3.1.0 added `ephemeralPalette`, 3.2.0 added
 * `layers[].continuous`, 4.0.0 removed `ephemeralPalette` and added reference
 * layer data, and 4.1.0 added optional guided drawing sessions.
 */
export const PROJECT_VERSION = '4.1.0';
export const GUIDED_DRAWING_VERSION = 1;

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export type LayerType = 'image' | 'group' | 'text' | 'reference';
export type ReferenceLayerPosition = 'above' | 'below';
export type CelLinkType = 'soft' | 'hard';
export type ProjectImageData = Uint8Array;
export type LegacyProjectImageData = ProjectImageData | string | Record<string, number>;

export interface FrameTag {
  id: string;
  name: string;
  color: string;
  startFrameIndex: number;
  endFrameIndex: number;
  collapsed: boolean;
}

export interface TextLayerData {
  font: string;
  color: string;
}

export interface TextCelData {
  content: string;
  x: number;
  y: number;
}

export interface ReferenceLayerData {
  bytes: Uint8Array;
  mimeType: string;
  x: number;
  y: number;
  scale: number;
  desaturate?: boolean;
  position?: ReferenceLayerPosition;
}

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

export interface ProjectLayerFile {
  id: string;
  name: string;
  type?: LayerType;
  visible: boolean;
  opacity: number;
  blendMode?: BlendMode;
  continuous?: boolean;
  data: ProjectImageData;
  textData?: TextLayerData;
  referenceData?: ReferenceLayerData;
}

export interface ProjectCelFile {
  layerId: string;
  data: ProjectImageData;
  indexData?: number[];
  linkedCelId?: string;
  linkType?: CelLinkType;
  textCelData?: TextCelData;
}

export interface ProjectFrameFile {
  id: string;
  duration: number;
  cels: ProjectCelFile[];
}

export interface ProjectFile {
  version: string;
  name?: string;
  width: number;
  height: number;
  palette?: string[];
  layers: ProjectLayerFile[];
  frames: ProjectFrameFile[];
  animation: {
    fps: number;
    currentFrameIndex: number;
  };
  tags?: FrameTag[];
  guidedDrawing?: GuidedDrawingSessionFile;
}

export type ProjectLayerFileInput = Omit<ProjectLayerFile, 'data'> & {
  data: LegacyProjectImageData;
  referenceData?: Omit<ReferenceLayerData, 'bytes'> & {
    bytes: LegacyProjectImageData;
  };
};

export type ProjectCelFileInput = Omit<ProjectCelFile, 'data'> & {
  data: LegacyProjectImageData;
};

export type ProjectFrameFileInput = Omit<ProjectFrameFile, 'cels'> & {
  cels: ProjectCelFileInput[];
};

export type ProjectFileInput = Omit<ProjectFile, 'layers' | 'frames'> & {
  ephemeralPalette?: string[];
  layers: ProjectLayerFileInput[];
  frames: ProjectFrameFileInput[];
};

export type LegacyProjectFile = ProjectFile & {
  ephemeralPalette?: string[];
};
