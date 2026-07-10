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

export function createPassthroughViewEffect(): ViewEffect {
  let program: WebGLProgram | null = null;
  let sourceLocation: WebGLUniformLocation | null = null;

  return {
    id: 'passthrough',
    name: 'Passthrough',

    init(gl: WebGL2RenderingContext): void {
      program = createEffectProgram(gl, PASSTHROUGH_FRAGMENT_SHADER);
      sourceLocation = gl.getUniformLocation(program, 'uSource');
    },

    render(
      gl: WebGL2RenderingContext,
      _sourceTexture: WebGLTexture,
      _params: ViewEffectParams,
      _frame: ViewEffectFrame
    ): void {
      if (!program) return;

      gl.useProgram(program);
      gl.uniform1i(sourceLocation, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    dispose(gl: WebGL2RenderingContext): void {
      if (program) gl.deleteProgram(program);
      program = null;
      sourceLocation = null;
    },
  };
}
