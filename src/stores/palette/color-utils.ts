/**
 * Color conversion and comparison utilities.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export interface Lab {
  l: number; // Lightness (0-100)
  a: number; // Green-Red axis (-128 to +128)
  b: number; // Blue-Yellow axis (-128 to +128)
}

/**
 * Normalize hex color to lowercase 6-digit format.
 */
export function normalizeHex(hex: string): string {
  const clean = hex.replace('#', '').toLowerCase();
  if (clean.length === 3) {
    return '#' + clean.split('').map(c => c + c).join('');
  }
  return '#' + clean;
}

/**
 * Parse hex color to RGB components.
 */
export function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(x => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');
}

/**
 * Convert RGB to HSL.
 */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h, s, l };
}

/**
 * Convert HSL to RGB.
 */
export function hslToRgb(h: number, s: number, l: number): RGB {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return { r: r * 255, g: g * 255, b: b * 255 };
}

/**
 * Calculate distance between two HSL colors (0-1 range).
 * Hue is circular, so handles wrap-around.
 */
export function hslDistance(a: HSL, b: HSL): number {
  // Hue is circular, so we need to handle wrap-around
  let hueDiff = Math.abs(a.h - b.h);
  if (hueDiff > 0.5) hueDiff = 1 - hueDiff;

  const satDiff = Math.abs(a.s - b.s);
  const lightDiff = Math.abs(a.l - b.l);

  // Weighted distance (hue matters most for color perception)
  return Math.sqrt(
    hueDiff * hueDiff * 2 + satDiff * satDiff + lightDiff * lightDiff
  );
}

// D65 illuminant reference values
const REF_X = 95.047;
const REF_Y = 100.0;
const REF_Z = 108.883;

/**
 * Convert RGB (0-255) to XYZ color space.
 */
export function rgbToXyz(r: number, g: number, b: number): XYZ {
  // Normalize to 0-1 and apply sRGB companding
  let rLinear = r / 255;
  let gLinear = g / 255;
  let bLinear = b / 255;

  // Apply gamma correction (sRGB)
  rLinear = rLinear > 0.04045
    ? Math.pow((rLinear + 0.055) / 1.055, 2.4)
    : rLinear / 12.92;
  gLinear = gLinear > 0.04045
    ? Math.pow((gLinear + 0.055) / 1.055, 2.4)
    : gLinear / 12.92;
  bLinear = bLinear > 0.04045
    ? Math.pow((bLinear + 0.055) / 1.055, 2.4)
    : bLinear / 12.92;

  // Scale to 0-100
  rLinear *= 100;
  gLinear *= 100;
  bLinear *= 100;

  // Convert to XYZ using sRGB matrix
  const x = rLinear * 0.4124564 + gLinear * 0.3575761 + bLinear * 0.1804375;
  const y = rLinear * 0.2126729 + gLinear * 0.7151522 + bLinear * 0.0721750;
  const z = rLinear * 0.0193339 + gLinear * 0.1191920 + bLinear * 0.9503041;

  return { x, y, z };
}

/**
 * Convert XYZ to CIE Lab color space.
 */
export function xyzToLab(x: number, y: number, z: number): Lab {
  // Normalize by reference white (D65)
  let xNorm = x / REF_X;
  let yNorm = y / REF_Y;
  let zNorm = z / REF_Z;

  // Apply Lab transform function
  const epsilon = 0.008856; // (6/29)^3
  const kappa = 903.3; // (29/3)^3

  xNorm = xNorm > epsilon ? Math.cbrt(xNorm) : (kappa * xNorm + 16) / 116;
  yNorm = yNorm > epsilon ? Math.cbrt(yNorm) : (kappa * yNorm + 16) / 116;
  zNorm = zNorm > epsilon ? Math.cbrt(zNorm) : (kappa * zNorm + 16) / 116;

  const l = 116 * yNorm - 16;
  const a = 500 * (xNorm - yNorm);
  const b = 200 * (yNorm - zNorm);

  return { l, a, b };
}

/**
 * Convert RGB (0-255) directly to CIE Lab.
 */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

/**
 * Get Lab hue angle in degrees (0-360).
 * This is the angle in the a*b* plane.
 */
export function labHue(lab: Lab): number {
  const hue = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
  return hue < 0 ? hue + 360 : hue;
}

/**
 * Get Lab chroma (saturation equivalent).
 * This is the distance from the neutral axis in the a*b* plane.
 */
export function labChroma(lab: Lab): number {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b);
}
