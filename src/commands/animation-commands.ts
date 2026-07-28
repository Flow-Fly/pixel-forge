import { type Command } from './index';
import { getActiveProjectContext, type ProjectContext } from '../stores/project-context';
import { type Cel, type Frame } from '../types/animation';
import { productTelemetry, type TelemetryClient } from '../services/telemetry';

type AnimationCommandContext = Pick<ProjectContext, 'animation'>;

export class AddFrameCommand implements Command {
  id = crypto.randomUUID();
  name = 'Add Frame';
  private frameId: string | null = null;
  private duplicate: boolean;
  private sourceFrameId?: string;
  private readonly context: AnimationCommandContext;
  private readonly telemetry: TelemetryClient;

  constructor(
    duplicate: boolean = true,
    sourceFrameId?: string,
    context: AnimationCommandContext = getActiveProjectContext(),
    telemetry: TelemetryClient = productTelemetry,
  ) {
    this.duplicate = duplicate;
    this.sourceFrameId = sourceFrameId;
    this.context = context;
    this.telemetry = telemetry;
  }

  execute() {
    // We need to capture the ID of the created frame
    // addFrame does not return the created frame, so capture the new tail frame.

    const countBefore = this.context.animation.frames.value.length;
    this.context.animation.addFrame(this.duplicate, this.sourceFrameId);
    const frames = this.context.animation.frames.value;
    if (frames.length > countBefore) {
      this.frameId = frames[frames.length - 1].id;
      if (countBefore === 1 && frames.length === 2) {
        this.telemetry.record({ name: 'second_frame_created', dimensions: {} });
      }
    }
  }

  undo() {
    if (this.frameId) {
      this.context.animation.deleteFrame(this.frameId);
    }
  }
}

export class DeleteFrameCommand implements Command {
  id = crypto.randomUUID();
  name = 'Delete Frame';
  private frameId: string;
  private frame: Frame | null = null;
  private index: number = -1;
  // We also need to restore Cels!
  // This is complex because Cels are stored in a Map in AnimationStore
  // We need to capture all Cels associated with this frame
  private cels: Array<{ key: string; cel: Cel }> = [];
  private readonly context: AnimationCommandContext;

  constructor(frameId: string, context: AnimationCommandContext = getActiveProjectContext()) {
    this.frameId = frameId;
    this.context = context;

    const frame = this.context.animation.frames.value.find((f) => f.id === frameId);
    if (frame) {
      this.frame = { ...frame };
      this.index = this.context.animation.frames.value.findIndex((f) => f.id === frameId);

      // Capture cels
      const storeCels = this.context.animation.cels.value;
      // We can iterate or construct keys
      // Iterating is safer
      storeCels.forEach((cel, key) => {
        if (cel.frameId === frameId) {
          this.cels.push({ key, cel: { ...cel } });
        }
      });
    }
  }

  execute() {
    this.context.animation.deleteFrame(this.frameId);
  }

  undo() {
    if (!this.frame) return;

    // Restore frame
    const frames = [...this.context.animation.frames.value];
    frames.splice(this.index, 0, this.frame);
    this.context.animation.frames.value = frames;

    // Restore cels
    const storeCels = new Map(this.context.animation.cels.value);
    this.cels.forEach(({ key, cel }) => {
      storeCels.set(key, cel);
    });
    this.context.animation.cels.value = storeCels;

    this.context.animation.goToFrame(this.frameId);
  }
}

export class SetFrameDurationCommand implements Command {
  id = crypto.randomUUID();
  name = 'Set Frame Duration';
  private frameId: string;
  private newDuration: number;
  private oldDuration: number;
  private readonly context: AnimationCommandContext;

  constructor(
    frameId: string,
    newDuration: number,
    oldDuration?: number,
    context: AnimationCommandContext = getActiveProjectContext()
  ) {
    this.frameId = frameId;
    this.newDuration = newDuration;
    this.context = context;
    // Use provided oldDuration or get from current state
    if (oldDuration !== undefined) {
      this.oldDuration = oldDuration;
    } else {
      const frame = this.context.animation.frames.value.find((f) => f.id === frameId);
      this.oldDuration = frame?.duration ?? 100;
    }
  }

  execute() {
    this.context.animation.setFrameDuration(this.frameId, this.newDuration);
  }

  undo() {
    this.context.animation.setFrameDuration(this.frameId, this.oldDuration);
  }
}

export class ReorderFrameCommand implements Command {
  id = crypto.randomUUID();
  name = 'Reorder Frame';
  private fromIndex: number;
  private toIndex: number;
  private readonly context: AnimationCommandContext;

  constructor(
    fromIndex: number,
    toIndex: number,
    context: AnimationCommandContext = getActiveProjectContext()
  ) {
    this.fromIndex = fromIndex;
    this.toIndex = toIndex;
    this.context = context;
  }

  execute() {
    this.context.animation.reorderFrame(this.fromIndex, this.toIndex);
  }

  undo() {
    // Reverse the reorder
    this.context.animation.reorderFrame(this.toIndex, this.fromIndex);
  }
}

/**
 * Command to link multiple cels together (share the same canvas).
 * Undo creates independent copies for each cel.
 */
export class LinkCelsCommand implements Command {
  id = crypto.randomUUID();
  name = 'Link Cels';
  private celKeys: string[];
  private linkedCelId: string | null = null;
  private readonly context: AnimationCommandContext;

  constructor(celKeys: string[], context: AnimationCommandContext = getActiveProjectContext()) {
    this.celKeys = celKeys;
    this.context = context;
  }

  execute() {
    this.linkedCelId = this.context.animation.linkCels(this.celKeys);
  }

  undo() {
    if (this.linkedCelId) {
      // Unlink creates independent copies for each cel
      this.context.animation.unlinkCels(this.celKeys);
    }
  }
}

/**
 * Command to unlink cels (give each its own canvas copy).
 * Undo re-links them to share the first cel's canvas.
 */
export class UnlinkCelsCommand implements Command {
  id = crypto.randomUUID();
  name = 'Unlink Cels';
  private celKeys: string[];
  private previousLinkedCelId: string | null = null;
  private readonly context: AnimationCommandContext;

  constructor(celKeys: string[], context: AnimationCommandContext = getActiveProjectContext()) {
    this.celKeys = celKeys;
    this.context = context;
    // Capture the linkedCelId before unlinking (assume all share the same one)
    if (celKeys.length > 0) {
      const firstCel = this.context.animation.cels.value.get(celKeys[0]);
      this.previousLinkedCelId = firstCel?.linkedCelId ?? null;
    }
  }

  execute() {
    this.context.animation.unlinkCels(this.celKeys);
  }

  undo() {
    if (this.previousLinkedCelId && this.celKeys.length >= 2) {
      // Re-link the cels
      this.context.animation.linkCels(this.celKeys);
    }
  }
}
