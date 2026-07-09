import { log } from '../../utils/log';
import { getViewEffectDefinition } from './registry';
import type { ViewEffect, ViewEffectFrame, ViewEffectParams } from './types';

export interface ViewEffectRenderOptions {
  width?: number;
  height?: number;
  spritePixelScale?: number;
  time?: number;
}

interface PipelineResources {
  gl: WebGL2RenderingContext;
  sourceTexture: WebGLTexture;
  vertexArray: WebGLVertexArrayObject;
}

export class ViewEffectPipeline {
  readonly canvas: HTMLCanvasElement;

  private gl: WebGL2RenderingContext | null = null;
  private sourceTexture: WebGLTexture | null = null;
  private vertexArray: WebGLVertexArrayObject | null = null;
  private effects = new Map<string, ViewEffect>();

  constructor(canvas: HTMLCanvasElement = document.createElement('canvas')) {
    this.canvas = canvas;
    this.initialize();
  }

  get isSupported(): boolean {
    return this.gl !== null;
  }

  render(
    effectId: string,
    source: HTMLCanvasElement,
    params: ViewEffectParams = {},
    options: ViewEffectRenderOptions = {}
  ): boolean {
    const resources = this.getResources();
    if (!resources) return false;

    const effect = this.getEffect(effectId);
    if (!effect) return false;

    const frame = this.createFrame(source, options);
    this.prepareRender(resources, source, frame);
    effect.render(resources.gl, resources.sourceTexture, params, frame);
    resources.gl.bindVertexArray(null);
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    for (const effect of this.effects.values()) effect.dispose(gl);
    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
    if (this.vertexArray) gl.deleteVertexArray(this.vertexArray);

    this.effects.clear();
    this.sourceTexture = null;
    this.vertexArray = null;
    this.gl = null;
  }

  private initialize(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });

    if (!gl || typeof gl.createTexture !== 'function') return;

    const sourceTexture = gl.createTexture();
    const vertexArray = gl.createVertexArray();
    if (!sourceTexture || !vertexArray) return;

    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.gl = gl;
    this.sourceTexture = sourceTexture;
    this.vertexArray = vertexArray;
  }

  private getResources(): PipelineResources | null {
    if (!this.gl || !this.sourceTexture || !this.vertexArray) return null;
    return {
      gl: this.gl,
      sourceTexture: this.sourceTexture,
      vertexArray: this.vertexArray,
    };
  }

  private createFrame(
    source: HTMLCanvasElement,
    options: ViewEffectRenderOptions
  ): ViewEffectFrame {
    const outputWidth = this.getOutputSize(options.width, source.width);
    const outputHeight = this.getOutputSize(options.height, source.height);
    const sourceWidth = Math.max(1, source.width);

    return {
      time: options.time ?? performance.now(),
      sourceWidth: source.width,
      sourceHeight: source.height,
      outputWidth,
      outputHeight,
      spritePixelScale: options.spritePixelScale ?? outputWidth / sourceWidth,
    };
  }

  private getOutputSize(requested: number | undefined, fallback: number): number {
    return Math.max(1, Math.round(requested ?? fallback));
  }

  private prepareRender(
    resources: PipelineResources,
    source: HTMLCanvasElement,
    frame: ViewEffectFrame
  ): void {
    if (this.canvas.width !== frame.outputWidth) this.canvas.width = frame.outputWidth;
    if (this.canvas.height !== frame.outputHeight) this.canvas.height = frame.outputHeight;

    const { gl, sourceTexture, vertexArray } = resources;
    gl.viewport(0, 0, frame.outputWidth, frame.outputHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  private getEffect(effectId: string): ViewEffect | null {
    const existing = this.effects.get(effectId);
    if (existing) return existing;

    const definition = getViewEffectDefinition(effectId);
    if (!definition || !this.gl) return null;

    try {
      const effect = definition.create();
      effect.init(this.gl);
      this.effects.set(effectId, effect);
      return effect;
    } catch (error) {
      log.warn(`Failed to initialize view effect "${effectId}":`, error);
      return null;
    }
  }
}
