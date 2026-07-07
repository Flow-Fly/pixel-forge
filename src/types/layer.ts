import type { TextLayerData } from './text';
import type { ReferenceLayerData } from './reference';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export type LayerType = 'image' | 'group' | 'text' | 'reference';

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-255
  blendMode: BlendMode;
  parentId: string | null;
  /**
   * If true, new cels for this layer will be linked to the previous frame's cel.
   * Useful for background layers that don't change between frames.
   * Default: false (new cels are independent/empty)
   */
  continuous?: boolean;
  // Runtime only
  canvas?: HTMLCanvasElement;
  // Text layer specific (only present when type === 'text')
  textData?: TextLayerData;
  // Reference layer specific (only present when type === 'reference')
  referenceData?: ReferenceLayerData;
}
