import { createEffectProgram } from './shader-program';
import type { ViewEffect, ViewEffectFrame, ViewEffectParams } from './types';

export const CRT_EFFECT_ID = 'crt';

export interface CrtParams {
  scanlines: number;
  mask: number;
  curvature: number;
  bloom: number;
  vignette: number;
}

export type CrtParamKey = keyof CrtParams;
export type CrtPresetId = 'off' | 'subtle' | 'arcade' | 'home-tv';

export const CRT_PRESETS: Record<CrtPresetId, Readonly<CrtParams>> = {
  off: { scanlines: 0, mask: 0, curvature: 0, bloom: 0, vignette: 0 },
  subtle: { scanlines: 0.22, mask: 0.16, curvature: 0.08, bloom: 0.14, vignette: 0.18 },
  arcade: { scanlines: 0.56, mask: 0.48, curvature: 0.14, bloom: 0.3, vignette: 0.34 },
  'home-tv': { scanlines: 0.38, mask: 0.25, curvature: 0.38, bloom: 0.42, vignette: 0.52 },
};

export const CRT_PRESET_OPTIONS: ReadonlyArray<{
  id: CrtPresetId;
  label: string;
}> = [
  { id: 'off', label: 'Off' },
  { id: 'subtle', label: 'Subtle' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'home-tv', label: 'Home TV' },
];

export const CRT_PARAM_CONTROLS: ReadonlyArray<{
  key: CrtParamKey;
  label: string;
}> = [
  { key: 'scanlines', label: 'Scanlines' },
  { key: 'mask', label: 'Phosphor mask' },
  { key: 'curvature', label: 'Curvature' },
  { key: 'bloom', label: 'Bloom' },
  { key: 'vignette', label: 'Vignette' },
];

const CRT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform float uSpritePixelScale;
uniform float uScanlines;
uniform float uMask;
uniform float uCurvature;
uniform float uBloom;
uniform float uVignette;

in vec2 vUv;
out vec4 outColor;

vec3 toLinear(vec3 color) {
  return pow(max(color, vec3(0.0)), vec3(2.2));
}

vec3 toDisplay(vec3 color) {
  return pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
}

vec2 curvedUv(vec2 uv) {
  vec2 centered = uv * 2.0 - 1.0;
  vec2 offset = centered.yx * centered.yx * centered;
  return (centered + offset * uCurvature * 0.12) * 0.5 + 0.5;
}

vec3 brightPass(vec2 uv) {
  vec3 color = toLinear(texture(uSource, uv).rgb);
  float brightness = max(max(color.r, color.g), color.b);
  return color * smoothstep(0.45, 0.9, brightness);
}

void main() {
  vec2 uv = curvedUv(vUv);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 source = texture(uSource, uv);
  vec3 color = toLinear(source.rgb);

  float bloomRadius = mix(1.0, min(max(uSpritePixelScale, 1.0), 4.0), 0.35);
  vec2 bloomStep = vec2(bloomRadius) / uResolution;
  vec3 bloom = (
    brightPass(uv + vec2(bloomStep.x, 0.0)) +
    brightPass(uv - vec2(bloomStep.x, 0.0)) +
    brightPass(uv + vec2(0.0, bloomStep.y)) +
    brightPass(uv - vec2(0.0, bloomStep.y))
  ) * 0.25;
  color += bloom * uBloom * 0.5;

  float rowPosition = fract(gl_FragCoord.y / max(uSpritePixelScale, 1.0));
  float scanline = smoothstep(0.58, 1.0, rowPosition);
  color *= 1.0 - scanline * uScanlines * 0.5;

  float triad = mod(floor(gl_FragCoord.x), 3.0);
  vec3 mask = triad < 1.0
    ? vec3(1.08, 0.82, 0.82)
    : (triad < 2.0 ? vec3(0.82, 1.08, 0.82) : vec3(0.82, 0.82, 1.08));
  color *= mix(vec3(1.0), mask, uMask * 0.72);

  vec2 centered = uv * 2.0 - 1.0;
  float edge = dot(centered, centered);
  float vignette = smoothstep(0.25, 1.15, edge);
  color *= 1.0 - vignette * uVignette * 0.72;

  outColor = vec4(toDisplay(color), source.a);
}
`;

function clampIntensity(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function getCrtParams(params: ViewEffectParams): CrtParams {
  const fallback = CRT_PRESETS.subtle;
  return {
    scanlines: clampIntensity(params.scanlines, fallback.scanlines),
    mask: clampIntensity(params.mask, fallback.mask),
    curvature: clampIntensity(params.curvature, fallback.curvature),
    bloom: clampIntensity(params.bloom, fallback.bloom),
    vignette: clampIntensity(params.vignette, fallback.vignette),
  };
}

export function getCrtPresetId(params: CrtParams): CrtPresetId | 'custom' {
  for (const option of CRT_PRESET_OPTIONS) {
    const preset = CRT_PRESETS[option.id];
    const matches = CRT_PARAM_CONTROLS.every(
      ({ key }) => Math.abs(params[key] - preset[key]) < 0.0001
    );
    if (matches) return option.id;
  }

  return 'custom';
}

export function createCrtViewEffect(): ViewEffect {
  let program: WebGLProgram | null = null;
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const uniform = (name: string) => uniforms.get(name) ?? null;

  return {
    id: CRT_EFFECT_ID,
    name: 'CRT',

    init(gl: WebGL2RenderingContext): void {
      program = createEffectProgram(gl, CRT_FRAGMENT_SHADER);
      for (const name of [
        'uSource',
        'uResolution',
        'uSpritePixelScale',
        'uScanlines',
        'uMask',
        'uCurvature',
        'uBloom',
        'uVignette',
      ]) {
        uniforms.set(name, gl.getUniformLocation(program, name));
      }
    },

    render(
      gl: WebGL2RenderingContext,
      _sourceTexture: WebGLTexture,
      params: ViewEffectParams,
      frame: ViewEffectFrame
    ): void {
      if (!program) return;

      const crt = getCrtParams(params);
      gl.useProgram(program);
      gl.uniform1i(uniform('uSource'), 0);
      gl.uniform2f(uniform('uResolution'), frame.outputWidth, frame.outputHeight);
      gl.uniform1f(uniform('uSpritePixelScale'), frame.spritePixelScale);
      gl.uniform1f(uniform('uScanlines'), crt.scanlines);
      gl.uniform1f(uniform('uMask'), crt.mask);
      gl.uniform1f(uniform('uCurvature'), crt.curvature);
      gl.uniform1f(uniform('uBloom'), crt.bloom);
      gl.uniform1f(uniform('uVignette'), crt.vignette);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    dispose(gl: WebGL2RenderingContext): void {
      if (program) gl.deleteProgram(program);
      program = null;
      uniforms.clear();
    },
  };
}
