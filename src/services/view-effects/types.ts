export type ViewEffectParams = Readonly<Record<string, number>>;

export interface ViewEffectFrame {
  time: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  spritePixelScale: number;
}

export interface ViewEffect {
  readonly id: string;
  readonly name: string;
  init(gl: WebGL2RenderingContext): void;
  render(
    gl: WebGL2RenderingContext,
    sourceTexture: WebGLTexture,
    params: ViewEffectParams,
    frame: ViewEffectFrame
  ): void;
  dispose(gl: WebGL2RenderingContext): void;
}

export interface ViewEffectDefinition {
  readonly id: string;
  readonly name: string;
  create(): ViewEffect;
}
