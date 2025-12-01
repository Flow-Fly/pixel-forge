export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export interface Layer {
  id: string;
  name: string;
  type: 'image' | 'group';
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-255
  blendMode: BlendMode;
  parentId: string | null;
  // Runtime only
  canvas?: HTMLCanvasElement;
}
