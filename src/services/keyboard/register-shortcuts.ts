import { keyboardService } from './shortcuts';
import { toolStore, type ToolType } from '../../stores/tools';
import { historyStore } from '../../stores/history';
import { brushStore } from '../../stores/brush';
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';
import { projectStore } from '../../stores/project';
import { DeleteSelectionCommand, CommitFloatCommand } from '../../commands/selection-commands';

export function registerShortcuts() {
  // Tool shortcuts
  const tools: Array<{ key: string; tool: ToolType }> = [
    { key: 'b', tool: 'pencil' },
    { key: 'e', tool: 'eraser' },
    { key: 'i', tool: 'eyedropper' },
    { key: 'm', tool: 'marquee-rect' },
    { key: 'l', tool: 'lasso' },
    { key: 'w', tool: 'magic-wand' },
    { key: 'u', tool: 'line' },
    { key: 'r', tool: 'rectangle' },
    { key: 'o', tool: 'ellipse' },
    { key: 'g', tool: 'fill' },
    { key: 'h', tool: 'gradient' },
    { key: 't', tool: 'transform' },
  ];

  for (const { key, tool } of tools) {
    keyboardService.register(key, [], () => toolStore.setActiveTool(tool), `${tool} tool`);
  }

  // Undo: Ctrl+Z / Cmd+Z
  keyboardService.register('z', ['ctrl'], () => historyStore.undo(), 'Undo');
  keyboardService.register('z', ['meta'], () => historyStore.undo(), 'Undo');

  // Redo: Ctrl+Y, Ctrl+Shift+Z, Cmd+Shift+Z
  keyboardService.register('y', ['ctrl'], () => historyStore.redo(), 'Redo');
  keyboardService.register('z', ['ctrl', 'shift'], () => historyStore.redo(), 'Redo');
  keyboardService.register('z', ['meta', 'shift'], () => historyStore.redo(), 'Redo');

  // Big Pixel Mode: Ctrl+Shift+B / Cmd+Shift+B
  keyboardService.register('b', ['ctrl', 'shift'], () => brushStore.toggleBigPixelMode(), 'Toggle Big Pixel Mode');
  keyboardService.register('b', ['meta', 'shift'], () => brushStore.toggleBigPixelMode(), 'Toggle Big Pixel Mode');

  // ============================================
  // SELECTION SHORTCUTS
  // ============================================

  // Enter = Commit floating selection
  keyboardService.register('Enter', [], () => {
    const state = selectionStore.state.value;
    if (state.type === 'floating') {
      const activeLayerId = layerStore.activeLayerId.value;
      const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
      if (!layer?.canvas) return;

      const command = new CommitFloatCommand(
        layer.canvas,
        layer.id,
        state.imageData,
        state.originalBounds,
        state.currentOffset,
        state.shape,
        state.mask
      );
      historyStore.execute(command);
    }
  }, 'Commit selection');

  // Escape = Cancel floating selection (undo cut) or clear selection
  keyboardService.register('Escape', [], () => {
    const state = selectionStore.state.value;
    if (state.type === 'floating') {
      historyStore.undo();
    } else if (state.type === 'selected' || state.type === 'selecting') {
      selectionStore.clear();
    }
  }, 'Cancel selection');

  // Delete = Delete selected pixels
  keyboardService.register('Delete', [], () => {
    const state = selectionStore.state.value;
    if (state.type === 'selected') {
      const activeLayerId = layerStore.activeLayerId.value;
      const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
      if (!layer?.canvas) return;

      const command = new DeleteSelectionCommand(
        layer.canvas,
        state.bounds,
        state.shape,
        state.shape === 'freeform' ? (state as { mask: Uint8Array }).mask : undefined
      );
      historyStore.execute(command);
    }
  }, 'Delete selection');

  // Backspace = Delete selected pixels (alternative)
  keyboardService.register('Backspace', [], () => {
    const state = selectionStore.state.value;
    if (state.type === 'selected') {
      const activeLayerId = layerStore.activeLayerId.value;
      const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
      if (!layer?.canvas) return;

      const command = new DeleteSelectionCommand(
        layer.canvas,
        state.bounds,
        state.shape,
        state.shape === 'freeform' ? (state as { mask: Uint8Array }).mask : undefined
      );
      historyStore.execute(command);
    }
  }, 'Delete selection');

  // Ctrl+D / Cmd+D = Deselect
  const deselect = () => {
    const state = selectionStore.state.value;
    if (state.type === 'floating') {
      // Commit first, then clear
      const activeLayerId = layerStore.activeLayerId.value;
      const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
      if (layer?.canvas) {
        const command = new CommitFloatCommand(
          layer.canvas,
          layer.id,
          state.imageData,
          state.originalBounds,
          state.currentOffset,
          state.shape,
          state.mask
        );
        historyStore.execute(command);
      }
    } else {
      selectionStore.clear();
    }
  };
  keyboardService.register('d', ['ctrl'], deselect, 'Deselect');
  keyboardService.register('d', ['meta'], deselect, 'Deselect');

  // Ctrl+A / Cmd+A = Select all
  const selectAll = () => {
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    selectionStore.state.value = {
      type: 'selected',
      shape: 'rectangle',
      bounds: { x: 0, y: 0, width, height },
    };
  };
  keyboardService.register('a', ['ctrl'], selectAll, 'Select all');
  keyboardService.register('a', ['meta'], selectAll, 'Select all');
}
