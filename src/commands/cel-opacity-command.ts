import { type Command } from "./index";
import { animationStore } from "../stores/animation";

/**
 * Command to set the opacity of one or more cels.
 * Supports undo by restoring each cel's original opacity.
 */
export class SetCelOpacityCommand implements Command {
  id = crypto.randomUUID();
  name = "Set Cel Opacity";
  celKeys: string[];
  beforeOpacities: Map<string, number>;
  afterOpacity: number;

  constructor(
    celKeys: string[],
    beforeOpacities: Map<string, number>,
    afterOpacity: number
  ) {
    this.celKeys = celKeys;
    this.beforeOpacities = beforeOpacities;
    this.afterOpacity = afterOpacity;
  }

  execute() {
    animationStore.setCelOpacity(this.celKeys, this.afterOpacity);
  }

  undo() {
    // Restore each cel's original opacity
    for (const [celKey, opacity] of this.beforeOpacities) {
      animationStore.setCelOpacity([celKey], opacity);
    }
  }
}
