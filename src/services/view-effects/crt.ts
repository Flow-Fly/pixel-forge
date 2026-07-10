import { createEffectProgram } from './shader-program';
import type { ViewEffect, ViewEffectFrame, ViewEffectParams } from './types';

export const CRT_EFFECT_ID = 'crt';

export interface CrtParams {
  scanlines: number;
  mask: number;
  curvature: number;
  bloom: number;
  vignette: number;
  beam: number;
  bleed: number;
  maskStyle: number;
}

export type CrtParamKey = Exclude<keyof CrtParams, 'maskStyle'>;
export type CrtPresetId = 'off' | 'subtle' | 'arcade' | 'home-tv';

export const CRT_PRESETS: Record<CrtPresetId, Readonly<CrtParams>> = {
  off: {
    scanlines: 0,
    mask: 0,
    curvature: 0,
    bloom: 0,
    vignette: 0,
    beam: 0,
    bleed: 0,
    maskStyle: 0,
  },
  subtle: {
    scanlines: 0.55,
    mask: 0.78,
    curvature: 0.04,
    bloom: 0.28,
    vignette: 0.18,
    beam: 0.42,
    bleed: 0.12,
    maskStyle: 0,
  },
  arcade: {
    scanlines: 0.72,
    mask: 0.68,
    curvature: 0.1,
    bloom: 0.55,
    vignette: 0.28,
    beam: 0.58,
    bleed: 0.22,
    maskStyle: 1,
  },
  'home-tv': {
    scanlines: 0.46,
    mask: 0.52,
    curvature: 0.32,
    bloom: 0.68,
    vignette: 0.48,
    beam: 0.82,
    bleed: 0.42,
    maskStyle: 2,
  },
};

export const CRT_PRESET_OPTIONS: ReadonlyArray<{
  id: CrtPresetId;
  label: string;
}> = [
  { id: 'off', label: 'Off' },
  { id: 'subtle', label: 'Aperture Grille' },
  { id: 'arcade', label: 'Arcade Monitor' },
  { id: 'home-tv', label: 'Consumer TV' },
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
  { key: 'beam', label: 'Beam spread' },
  { key: 'bleed', label: 'Color bleed' },
];

const CRT_PRESET_PARAM_KEYS: ReadonlyArray<keyof CrtParams> = [
  ...CRT_PARAM_CONTROLS.map(({ key }) => key),
  'maskStyle',
];

const LEGACY_CRT_PRESETS: ReadonlyArray<{
  id: Exclude<CrtPresetId, 'off'>;
  params: Readonly<Pick<CrtParams, 'scanlines' | 'mask' | 'curvature' | 'bloom' | 'vignette'>>;
}> = [
  {
    id: 'subtle',
    params: { scanlines: 0.22, mask: 0.16, curvature: 0.08, bloom: 0.14, vignette: 0.18 },
  },
  {
    id: 'arcade',
    params: { scanlines: 0.56, mask: 0.48, curvature: 0.14, bloom: 0.3, vignette: 0.34 },
  },
  {
    id: 'home-tv',
    params: { scanlines: 0.38, mask: 0.25, curvature: 0.38, bloom: 0.42, vignette: 0.52 },
  },
];

const CRT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uSource;
uniform vec2 uSourceSize;
uniform float uSpritePixelScale;
uniform float uScanlines;
uniform float uMask;
uniform float uCurvature;
uniform float uBloom;
uniform float uVignette;
uniform float uBeam;
uniform float uBleed;
uniform float uMaskStyle;

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

vec3 sourcePixel(vec2 pixel) {
  vec2 clampedPixel = clamp(pixel, vec2(0.0), uSourceSize - vec2(1.0));
  vec2 uv = (clampedPixel + vec2(0.5)) / uSourceSize;
  return toLinear(texture(uSource, uv).rgb);
}

float gaussian(float distance, float sigma) {
  return exp(-(distance * distance) / (2.0 * sigma * sigma));
}

vec3 horizontalBeam(vec2 sourcePosition) {
  vec2 centerPixel = vec2(
    floor(sourcePosition.x),
    floor(sourcePosition.y + 0.5)
  );
  float offset = fract(sourcePosition.x);
  float sigma = mix(0.18, 0.72, uBeam);
  float leftWeight = gaussian(offset + 1.0, sigma);
  float centerWeight = gaussian(offset, sigma);
  float rightWeight = gaussian(1.0 - offset, sigma);
  float totalWeight = leftWeight + centerWeight + rightWeight;

  vec3 left = sourcePixel(centerPixel + vec2(-1.0, 0.0));
  vec3 center = sourcePixel(centerPixel);
  vec3 right = sourcePixel(centerPixel + vec2(1.0, 0.0));
  return (left * leftWeight + center * centerWeight + right * rightWeight) / totalWeight;
}

vec3 reconstructBeam(vec2 uv) {
  vec2 sourcePosition = uv * uSourceSize - vec2(0.5);
  float channelOffset = uBleed * 0.45;
  vec3 redSample = horizontalBeam(sourcePosition + vec2(channelOffset, 0.0));
  vec3 centerSample = horizontalBeam(sourcePosition);
  vec3 blueSample = horizontalBeam(sourcePosition - vec2(channelOffset, 0.0));
  return vec3(redSample.r, centerSample.g, blueSample.b);
}

vec3 brightPass(vec2 uv) {
  vec3 color = toLinear(texture(uSource, clamp(uv, vec2(0.0), vec2(1.0))).rgb);
  float brightness = max(max(color.r, color.g), color.b);
  return color * smoothstep(0.32, 0.82, brightness);
}

vec3 phosphorColor(float phase) {
  if (phase < 1.0) return vec3(1.55, 0.24, 0.18);
  if (phase < 2.0) return vec3(0.20, 1.42, 0.26);
  return vec3(0.20, 0.28, 1.65);
}

float cellGate(float position) {
  return smoothstep(0.02, 0.22, position) *
    (1.0 - smoothstep(0.78, 0.98, position));
}

vec3 apertureGrille(float cellSize) {
  float column = floor(gl_FragCoord.x / cellSize);
  float phase = mod(column, 3.0);
  float localX = fract(gl_FragCoord.x / cellSize);
  float gate = mix(0.72, 1.0, cellGate(localX));
  return phosphorColor(phase) * gate;
}

vec3 slotMask(float cellSize) {
  float rowHeight = cellSize * 2.0;
  float row = floor(gl_FragCoord.y / rowHeight);
  float column = floor((gl_FragCoord.x + mod(row, 2.0) * cellSize) / cellSize);
  float phase = mod(column, 3.0);
  float localX = fract(gl_FragCoord.x / cellSize);
  float localY = fract(gl_FragCoord.y / rowHeight);
  float gate = cellGate(localX) * mix(0.28, 1.0, cellGate(localY));
  return phosphorColor(phase) * gate;
}

vec3 shadowMask(float cellSize) {
  float row = floor(gl_FragCoord.y / cellSize);
  float rowOffset = mod(row, 2.0);
  float column = floor(gl_FragCoord.x / cellSize) + rowOffset;
  float phase = mod(column, 3.0);
  float localX = fract(gl_FragCoord.x / cellSize);
  float localY = fract(gl_FragCoord.y / cellSize);
  float gate = mix(0.18, 1.0, cellGate(localX) * cellGate(localY));
  return phosphorColor(phase) * gate;
}

vec3 phosphorMask() {
  float cellSize = clamp(floor(max(uSpritePixelScale, 1.0) / 4.0), 1.0, 3.0);
  if (uMaskStyle < 0.5) return apertureGrille(cellSize);
  if (uMaskStyle < 1.5) return slotMask(cellSize);
  return shadowMask(cellSize);
}

void main() {
  vec2 uv = curvedUv(vUv);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 source = texture(uSource, uv);
  vec3 color = reconstructBeam(uv);

  vec2 bloomStep = vec2(mix(0.35, 0.85, uBloom)) / uSourceSize;
  vec3 bloom = (
    brightPass(uv + vec2(bloomStep.x, 0.0)) +
    brightPass(uv - vec2(bloomStep.x, 0.0)) +
    brightPass(uv + vec2(0.0, bloomStep.y)) +
    brightPass(uv - vec2(0.0, bloomStep.y)) +
    brightPass(uv + bloomStep) +
    brightPass(uv - bloomStep)
  ) / 6.0;
  color += bloom * uBloom * 0.68;

  float rowDistance = abs(fract(uv.y * uSourceSize.y) - 0.5) * 2.0;
  float beamShape = exp(-rowDistance * rowDistance * mix(3.0, 6.5, uScanlines));
  float scanline = mix(1.0, 0.20 + beamShape * 1.08, uScanlines);
  color *= scanline;

  color *= mix(vec3(1.0), phosphorMask(), uMask);
  color *= 1.0 + uMask * 0.34 + uScanlines * 0.12;

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

function clampMaskStyle(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(2, Math.max(0, Math.round(value)))
    : fallback;
}

function getLegacyPreset(params: ViewEffectParams): CrtPresetId | null {
  if ('beam' in params || 'bleed' in params || 'maskStyle' in params) return null;

  for (const legacyPreset of LEGACY_CRT_PRESETS) {
    const matches = Object.entries(legacyPreset.params).every(
      ([key, value]) => Math.abs((params[key] ?? Number.NaN) - value) < 0.0001
    );
    if (matches) return legacyPreset.id;
  }

  return null;
}

export function getCrtParams(params: ViewEffectParams): CrtParams {
  const legacyPreset = getLegacyPreset(params);
  if (legacyPreset) return { ...CRT_PRESETS[legacyPreset] };

  const fallback = CRT_PRESETS.subtle;
  return {
    scanlines: clampIntensity(params.scanlines, fallback.scanlines),
    mask: clampIntensity(params.mask, fallback.mask),
    curvature: clampIntensity(params.curvature, fallback.curvature),
    bloom: clampIntensity(params.bloom, fallback.bloom),
    vignette: clampIntensity(params.vignette, fallback.vignette),
    beam: clampIntensity(params.beam, fallback.beam),
    bleed: clampIntensity(params.bleed, fallback.bleed),
    maskStyle: clampMaskStyle(params.maskStyle, fallback.maskStyle),
  };
}

export function getCrtPresetId(params: CrtParams): CrtPresetId | 'custom' {
  for (const option of CRT_PRESET_OPTIONS) {
    const preset = CRT_PRESETS[option.id];
    const matches = CRT_PRESET_PARAM_KEYS.every(
      (key) => Math.abs(params[key] - preset[key]) < 0.0001
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
        'uSourceSize',
        'uSpritePixelScale',
        'uScanlines',
        'uMask',
        'uCurvature',
        'uBloom',
        'uVignette',
        'uBeam',
        'uBleed',
        'uMaskStyle',
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
      gl.uniform2f(uniform('uSourceSize'), frame.sourceWidth, frame.sourceHeight);
      gl.uniform1f(uniform('uSpritePixelScale'), frame.spritePixelScale);
      gl.uniform1f(uniform('uScanlines'), crt.scanlines);
      gl.uniform1f(uniform('uMask'), crt.mask);
      gl.uniform1f(uniform('uCurvature'), crt.curvature);
      gl.uniform1f(uniform('uBloom'), crt.bloom);
      gl.uniform1f(uniform('uVignette'), crt.vignette);
      gl.uniform1f(uniform('uBeam'), crt.beam);
      gl.uniform1f(uniform('uBleed'), crt.bleed);
      gl.uniform1f(uniform('uMaskStyle'), crt.maskStyle);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    dispose(gl: WebGL2RenderingContext): void {
      if (program) gl.deleteProgram(program);
      program = null;
      uniforms.clear();
    },
  };
}
