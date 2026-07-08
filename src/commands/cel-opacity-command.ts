import { type Command } from './index';
import { getActiveProjectContext, type ProjectContext } from '../stores/project-context';

type CelOpacityCommandContext = Pick<ProjectContext, 'animation'>;

/**
 * Command to set the opacity of one or more cels.
 * Supports undo by restoring each cel's original opacity.
 */
export class SetCelOpacityCommand implements Command {
  id = crypto.randomUUID();
  name = 'Set Cel Opacity';
  celKeys: string[];
  beforeOpacities: Map<string, number>;
  afterOpacity: number;
  private readonly context: CelOpacityCommandContext;

  constructor(
    celKeys: string[],
    beforeOpacities: Map<string, number>,
    afterOpacity: number,
    context: CelOpacityCommandContext = getActiveProjectContext()
  ) {
    this.celKeys = celKeys;
    this.beforeOpacities = beforeOpacities;
    this.afterOpacity = afterOpacity;
    this.context = context;
  }

  execute() {
    this.context.animation.setCelOpacity(this.celKeys, this.afterOpacity);
  }

  undo() {
    // Restore each cel's original opacity
    for (const [celKey, opacity] of this.beforeOpacities) {
      this.context.animation.setCelOpacity([celKey], opacity);
    }
  }
}
