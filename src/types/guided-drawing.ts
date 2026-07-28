import type { GuidedDrawingSessionFile } from '@pixel-forge/shared';

export {
  GUIDED_DRAWING_VERSION,
  type GuidedColorMapping,
  type GuidedDrawingSessionFile,
  type GuidedDrawingSettings,
  type GuidedPaletteSource,
} from '@pixel-forge/shared';

export interface GuidedDrawingSession extends Omit<GuidedDrawingSessionFile, 'target'> {
  target: Uint8Array;
}
