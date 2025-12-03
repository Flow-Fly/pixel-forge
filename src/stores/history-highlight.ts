import { signal } from '../core/signal';
import type { Command } from './history';
import type { Rect } from '../types/geometry';
import { isDrawableCommand } from '../commands/index';

/**
 * Store for managing history item highlight state.
 * Decouples the history panel from the canvas overlay.
 */
class HistoryHighlightStore {
  /** Currently hovered command ID */
  highlightedCommandId = signal<string | null>(null);

  /** Currently expanded (clicked) command ID */
  expandedCommandId = signal<string | null>(null);

  /** Bounds to highlight with marching ants (canvas coordinates) */
  highlightBounds = signal<Rect | null>(null);

  /** Layer ID affected by the highlighted command */
  highlightLayerId = signal<string | null>(null);

  /** The actual highlighted command (for tooltip rendering) */
  highlightedCommand = signal<Command | null>(null);

  /** The actual expanded command (for expanded view rendering) */
  expandedCommand = signal<Command | null>(null);

  /**
   * Set the highlighted (hovered) command.
   * Extracts bounds if the command is drawable.
   */
  setHighlight(cmd: Command | null): void {
    if (cmd === null) {
      this.highlightedCommandId.value = null;
      this.highlightedCommand.value = null;
      // Only clear bounds if not expanded (expanded takes precedence)
      if (this.expandedCommandId.value === null) {
        this.highlightBounds.value = null;
        this.highlightLayerId.value = null;
      }
      return;
    }

    this.highlightedCommandId.value = cmd.id;
    this.highlightedCommand.value = cmd;

    // Only update bounds if not currently expanded
    if (this.expandedCommandId.value === null) {
      if (isDrawableCommand(cmd)) {
        this.highlightBounds.value = cmd.drawBounds;
        this.highlightLayerId.value = cmd.drawLayerId;
      } else {
        this.highlightBounds.value = null;
        this.highlightLayerId.value = null;
      }
    }
  }

  /**
   * Set the expanded (clicked) command.
   * Expanded state takes precedence over hover for bounds display.
   */
  setExpanded(cmd: Command | null): void {
    if (cmd === null) {
      this.expandedCommandId.value = null;
      this.expandedCommand.value = null;
      // Restore bounds from highlighted command if any
      const highlighted = this.highlightedCommand.value;
      if (highlighted && isDrawableCommand(highlighted)) {
        this.highlightBounds.value = highlighted.drawBounds;
        this.highlightLayerId.value = highlighted.drawLayerId;
      } else {
        this.highlightBounds.value = null;
        this.highlightLayerId.value = null;
      }
      return;
    }

    this.expandedCommandId.value = cmd.id;
    this.expandedCommand.value = cmd;

    if (isDrawableCommand(cmd)) {
      this.highlightBounds.value = cmd.drawBounds;
      this.highlightLayerId.value = cmd.drawLayerId;
    } else {
      this.highlightBounds.value = null;
      this.highlightLayerId.value = null;
    }
  }

  /**
   * Toggle expanded state for a command.
   * If already expanded, collapses. Otherwise expands.
   */
  toggleExpanded(cmd: Command): void {
    if (this.expandedCommandId.value === cmd.id) {
      this.setExpanded(null);
    } else {
      this.setExpanded(cmd);
    }
  }

  /**
   * Clear all highlight state.
   */
  clear(): void {
    this.highlightedCommandId.value = null;
    this.highlightedCommand.value = null;
    this.expandedCommandId.value = null;
    this.expandedCommand.value = null;
    this.highlightBounds.value = null;
    this.highlightLayerId.value = null;
  }
}

export const historyHighlightStore = new HistoryHighlightStore();
