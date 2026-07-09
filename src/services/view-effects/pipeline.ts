import { log } from '../../utils/log';
import { getViewEffectDefinition } from './registry';
import type { ViewEffect, ViewEffectParams } from './types';

export interface ViewEffectRenderOptions {
  width?: number;
  height?: number;
  spritePixelScale?: number;
  time?: number;
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
    const gl = this.gl;
    const sourceTexture = this.sourceTexture;
    const vertexArray = this.vertexArray;
    if (!gl || !sourceTexture || !vertexArray) return false;

    const effect = this.getEffect(effectId);
    if (!effect) return false;

    const width = Math.max(1, Math.round(options.width ?? source.width));
    const height = Math.max(1, Math.round(options.height ?? source.height));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;

    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    effect.render(gl, sourceTexture, params, {
      time: options.time ?? performance.now(),
      sourceWidth: source.width,
      sourceHeight: source.height,
      outputWidth: width,
      outputHeight: height,
      spritePixelScale: options.spritePixelScale ?? width / source.width,
    });

    gl.bindVertexArray(null);
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
