import { type Command } from './index';
import { animationStore } from '../stores/animation';

/**
 * Command for moving text layer position.
 * Supports undo/redo for text repositioning.
 */
export class MoveTextCommand implements Command {
  id = crypto.randomUUID();
  name = 'Move Text';

  private layerId: string;
  private frameId: string;
  private oldPosition: { x: number; y: number };
  private newPosition: { x: number; y: number };

  constructor(
    layerId: string,
    frameId: string,
    oldPosition: { x: number; y: number },
    newPosition: { x: number; y: number }
  ) {
    this.layerId = layerId;
    this.frameId = frameId;
    this.oldPosition = oldPosition;
    this.newPosition = newPosition;
  }

  execute() {
    animationStore.updateTextCelData(this.layerId, this.frameId, {
      x: this.newPosition.x,
      y: this.newPosition.y
    });
  }

  undo() {
    animationStore.updateTextCelData(this.layerId, this.frameId, {
      x: this.oldPosition.x,
      y: this.oldPosition.y
    });
  }
}
