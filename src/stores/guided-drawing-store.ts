import { signal } from '../core/signal';
import {
  GUIDED_DRAWING_VERSION,
  type GuidedDrawingSession,
  type GuidedDrawingSessionFile,
} from '../types/guided-drawing';

class GuidedDrawingStore {
  readonly session = signal<GuidedDrawingSession | null>(null);
  readonly numbersVisible = signal(true);
  readonly targetPreviewVisible = signal(false);

  get active(): boolean {
    return this.session.value !== null;
  }

  start(session: GuidedDrawingSession): void {
    validateSession(session);
    this.resetViewOptions();
    this.session.value = cloneSession(session);
  }

  toggleNumbers(): void {
    this.numbersVisible.value = !this.numbersVisible.value;
  }

  toggleTargetPreview(): void {
    this.targetPreviewVisible.value = !this.targetPreviewVisible.value;
  }

  load(file: GuidedDrawingSessionFile | undefined): void {
    if (!file) {
      this.clear();
      return;
    }

    this.start({
      ...file,
      target: Uint8Array.from(file.target),
    });
  }

  toFile(): GuidedDrawingSessionFile | undefined {
    const session = this.session.value;
    if (!session) return undefined;

    return {
      ...session,
      target: Array.from(session.target),
      settings: cloneSettings(session.settings),
    };
  }

  clear(): void {
    this.session.value = null;
    this.resetViewOptions();
  }

  private resetViewOptions(): void {
    this.numbersVisible.value = true;
    this.targetPreviewVisible.value = false;
  }
}

export function createGuidedDrawingStore(): GuidedDrawingStore {
  return new GuidedDrawingStore();
}

function validateSession(session: GuidedDrawingSession): void {
  if (session.version !== GUIDED_DRAWING_VERSION) {
    throw new RangeError(`Unsupported guided drawing version: ${session.version}`);
  }
  if (!Number.isInteger(session.width) || session.width < 1) {
    throw new RangeError('Guided drawing width must be at least 1');
  }
  if (!Number.isInteger(session.height) || session.height < 1) {
    throw new RangeError('Guided drawing height must be at least 1');
  }
  if (session.target.length !== session.width * session.height) {
    throw new RangeError('Guided drawing target does not match its dimensions');
  }
  validateGuideColorCount(session.guideColorCount);
}

function validateGuideColorCount(guideColorCount: number | undefined): void {
  if (guideColorCount === undefined) return;
  if (Number.isInteger(guideColorCount) && guideColorCount > 0) return;

  throw new RangeError('Guided drawing color count must be a positive integer');
}

function cloneSession(session: GuidedDrawingSession): GuidedDrawingSession {
  return {
    ...session,
    target: new Uint8Array(session.target),
    settings: cloneSettings(session.settings),
  };
}

function cloneSettings(
  settings: GuidedDrawingSession['settings'],
): GuidedDrawingSession['settings'] {
  return {
    ...settings,
    restrictedPalette: settings.restrictedPalette
      ? [...settings.restrictedPalette]
      : undefined,
  };
}
