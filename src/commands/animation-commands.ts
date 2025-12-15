import { type Command } from "./index";
import { animationStore } from "../stores/animation";
import { type Frame } from "../types/animation";

export class AddFrameCommand implements Command {
  id = crypto.randomUUID();
  name = "Add Frame";
  private frameId: string | null = null;
  private duplicate: boolean;
  private sourceFrameId?: string;

  constructor(duplicate: boolean = true, sourceFrameId?: string) {
    this.duplicate = duplicate;
    this.sourceFrameId = sourceFrameId;
  }

  execute() {
    // We need to capture the ID of the created frame
    // animationStore.addFrame doesn't return it currently
    // We should modify animationStore or just check the last frame

    const countBefore = animationStore.frames.value.length;
    animationStore.addFrame(this.duplicate, this.sourceFrameId);
    const frames = animationStore.frames.value;
    if (frames.length > countBefore) {
      this.frameId = frames[frames.length - 1].id;
    }
  }

  undo() {
    if (this.frameId) {
      animationStore.deleteFrame(this.frameId);
    }
  }
}

export class DeleteFrameCommand implements Command {
  id = crypto.randomUUID();
  name = "Delete Frame";
  private frameId: string;
  private frame: Frame | null = null;
  private index: number = -1;
  // We also need to restore Cels!
  // This is complex because Cels are stored in a Map in AnimationStore
  // We need to capture all Cels associated with this frame
  private cels: any[] = [];

  constructor(frameId: string) {
    this.frameId = frameId;
    const frame = animationStore.frames.value.find((f) => f.id === frameId);
    if (frame) {
      this.frame = { ...frame };
      this.index = animationStore.frames.value.findIndex(
        (f) => f.id === frameId
      );

      // Capture cels
      const storeCels = animationStore.cels.value;
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
    animationStore.deleteFrame(this.frameId);
  }

  undo() {
    if (!this.frame) return;

    // Restore frame
    const frames = [...animationStore.frames.value];
    frames.splice(this.index, 0, this.frame);
    animationStore.frames.value = frames;

    // Restore cels
    const storeCels = new Map(animationStore.cels.value);
    this.cels.forEach(({ key, cel }) => {
      storeCels.set(key, cel);
    });
    animationStore.cels.value = storeCels;

    animationStore.goToFrame(this.frameId);
  }
}

export class SetFrameDurationCommand implements Command {
  id = crypto.randomUUID();
  name = "Set Frame Duration";
  private frameId: string;
  private newDuration: number;
  private oldDuration: number;

  constructor(frameId: string, newDuration: number, oldDuration?: number) {
    this.frameId = frameId;
    this.newDuration = newDuration;
    // Use provided oldDuration or get from current state
    if (oldDuration !== undefined) {
      this.oldDuration = oldDuration;
    } else {
      const frame = animationStore.frames.value.find((f) => f.id === frameId);
      this.oldDuration = frame?.duration ?? 100;
    }
  }

  execute() {
    animationStore.setFrameDuration(this.frameId, this.newDuration);
  }

  undo() {
    animationStore.setFrameDuration(this.frameId, this.oldDuration);
  }
}

export class ReorderFrameCommand implements Command {
  id = crypto.randomUUID();
  name = "Reorder Frame";
  private fromIndex: number;
  private toIndex: number;

  constructor(fromIndex: number, toIndex: number) {
    this.fromIndex = fromIndex;
    this.toIndex = toIndex;
  }

  execute() {
    animationStore.reorderFrame(this.fromIndex, this.toIndex);
  }

  undo() {
    // Reverse the reorder
    animationStore.reorderFrame(this.toIndex, this.fromIndex);
  }
}

/**
 * Command to link multiple cels together (share the same canvas).
 * Undo creates independent copies for each cel.
 */
export class LinkCelsCommand implements Command {
  id = crypto.randomUUID();
  name = "Link Cels";
  private celKeys: string[];
  private linkedCelId: string | null = null;

  constructor(celKeys: string[]) {
    this.celKeys = celKeys;
  }

  execute() {
    this.linkedCelId = animationStore.linkCels(this.celKeys);
  }

  undo() {
    if (this.linkedCelId) {
      // Unlink creates independent copies for each cel
      animationStore.unlinkCels(this.celKeys);
    }
  }
}

/**
 * Command to unlink cels (give each its own canvas copy).
 * Undo re-links them to share the first cel's canvas.
 */
export class UnlinkCelsCommand implements Command {
  id = crypto.randomUUID();
  name = "Unlink Cels";
  private celKeys: string[];
  private previousLinkedCelId: string | null = null;

  constructor(celKeys: string[]) {
    this.celKeys = celKeys;
    // Capture the linkedCelId before unlinking (assume all share the same one)
    if (celKeys.length > 0) {
      const firstCel = animationStore.cels.value.get(celKeys[0]);
      this.previousLinkedCelId = firstCel?.linkedCelId ?? null;
    }
  }

  execute() {
    animationStore.unlinkCels(this.celKeys);
  }

  undo() {
    if (this.previousLinkedCelId && this.celKeys.length >= 2) {
      // Re-link the cels
      animationStore.linkCels(this.celKeys);
    }
  }
}
