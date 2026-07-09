import { type Command } from './index';
import { getActiveProjectContext, type ProjectContext } from '../stores/project-context';

type TextCommandContext = Pick<ProjectContext, 'animation'>;

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
  private readonly context: TextCommandContext;

  constructor(
    layerId: string,
    frameId: string,
    oldPosition: { x: number; y: number },
    newPosition: { x: number; y: number },
    context: TextCommandContext = getActiveProjectContext()
  ) {
    this.layerId = layerId;
    this.frameId = frameId;
    this.oldPosition = oldPosition;
    this.newPosition = newPosition;
    this.context = context;
  }

  execute() {
    this.context.animation.updateTextCelData(this.layerId, this.frameId, {
      x: this.newPosition.x,
      y: this.newPosition.y,
    });
  }

  undo() {
    this.context.animation.updateTextCelData(this.layerId, this.frameId, {
      x: this.oldPosition.x,
      y: this.oldPosition.y,
    });
  }
}
