import type { TextLayerData } from './text';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export type LayerType = 'image' | 'group' | 'text';

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-255
  blendMode: BlendMode;
  parentId: string | null;
  // Runtime only
  canvas?: HTMLCanvasElement;
  // Text layer specific (only present when type === 'text')
  textData?: TextLayerData;
}
