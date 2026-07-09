import { createEffectProgram } from './shader-program';
import type { ViewEffect, ViewEffectFrame, ViewEffectParams } from './types';

const PASSTHROUGH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uSource;
in vec2 vUv;
out vec4 outColor;

void main() {
  outColor = texture(uSource, vUv);
}
`;

export class PassthroughViewEffect implements ViewEffect {
  readonly id = 'passthrough';
  readonly name = 'Passthrough';

  private program: WebGLProgram | null = null;
  private sourceLocation: WebGLUniformLocation | null = null;

  init(gl: WebGL2RenderingContext): void {
    this.program = createEffectProgram(gl, PASSTHROUGH_FRAGMENT_SHADER);
    this.sourceLocation = gl.getUniformLocation(this.program, 'uSource');
  }

  render(
    gl: WebGL2RenderingContext,
    _sourceTexture: WebGLTexture,
    _params: ViewEffectParams,
    _frame: ViewEffectFrame
  ): void {
    if (!this.program) return;

    gl.useProgram(this.program);
    gl.uniform1i(this.sourceLocation, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this.program) gl.deleteProgram(this.program);
    this.program = null;
    this.sourceLocation = null;
  }
}
