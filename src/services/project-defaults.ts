export const DEFAULT_PROJECT_NAME = 'Untitled';
export const DEFAULT_PROJECT_WIDTH = 64;
export const DEFAULT_PROJECT_HEIGHT = 64;
export const MIN_PROJECT_DIMENSION = 1;
export const MAX_PROJECT_DIMENSION = 2048;
export const DEFAULT_PROJECT_PALETTE_ID = 'db32';

export const NEW_PROJECT_PRESETS = [
  { label: '16x16', width: 16, height: 16 },
  { label: '32x32', width: 32, height: 32 },
  { label: '64x64', width: 64, height: 64 },
  { label: '128x128', width: 128, height: 128 },
  { label: '256x256', width: 256, height: 256 },
] as const;

export function normalizeProjectName(name: string | undefined): string {
  const trimmed = name?.trim();
  return trimmed || DEFAULT_PROJECT_NAME;
}

export function clampProjectDimension(
  value: number,
  fallback = DEFAULT_PROJECT_WIDTH
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(
    MIN_PROJECT_DIMENSION,
    Math.min(MAX_PROJECT_DIMENSION, Math.trunc(value))
  );
}
