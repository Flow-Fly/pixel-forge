import { keyboardService } from './shortcuts';
import { toolStore, type ToolType } from '../../stores/tools';
import { historyStore } from '../../stores/history';
import { brushStore } from '../../stores/brush';

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
}
