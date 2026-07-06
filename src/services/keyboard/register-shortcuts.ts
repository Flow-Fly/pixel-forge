import { keyboardService } from './shortcuts';
import { toolStore, type ToolType } from '../../stores/tools';
import { historyStore } from '../../stores/history';
import { brushStore } from '../../stores/brush';
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';
import { projectStore } from '../../stores/project';
import {
  DeleteSelectionCommand,
  CommitFloatCommand,
  CutToFloatCommand,
  FillSelectionCommand,
} from '../../commands/selection-commands';
import { colorStore } from '../../stores/colors';
import { animationStore } from '../../stores/animation';
import { viewportStore } from '../../stores/viewport';
import { panelStore } from '../../stores/panels';
import { shapeSettings } from '../../stores/tool-settings';
import { guidesStore } from '../../stores/guides';
import { AddFrameCommand } from '../../commands/animation-commands';
import { GroupLayersCommand, UngroupLayersCommand } from '../../commands/layer-commands';
import { toolRegistry } from '../../tools/tool-registry';
import { canCaptureBrush, captureBrushAndAdd } from '../brush-capture';
import { MOD_PRIMARY } from '../../utils/platform';
import { getToolSize, setToolSize } from '../../stores/tool-settings';
import { clipboardStore } from '../../stores/clipboard';
import { log } from '../../utils/log';
import type { Layer } from '../../types/layer';
import type { SelectionState } from '../../types/selection';

type ShortcutAction = () => void;

interface ShortcutRegistration {
  key: string;
  modifiers: string[];
  action: ShortcutAction;
  description: string;
  options?: {
    quick?: boolean;
    releaseAction?: ShortcutAction;
  };
}

type ShortcutGroup = ShortcutRegistration[];

const SELECTION_TOOLS: ToolType[] = ['marquee-rect', 'lasso', 'polygonal-lasso', 'magic-wand'];

const SHAPE_TOOLS: ToolType[] = ['rectangle', 'ellipse', 'line'];

function registerShortcut(shortcut: ShortcutRegistration) {
  keyboardService.register(
    shortcut.key,
    shortcut.modifiers,
    shortcut.action,
    shortcut.description,
    shortcut.options
  );
}

function registerShortcutGroup(group: ShortcutGroup) {
  for (const shortcut of group) {
    registerShortcut(shortcut);
  }
}

function parseShortcutKey(shortcutKey: string): Pick<ShortcutRegistration, 'key' | 'modifiers'> {
  const parts = shortcutKey.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  return { key, modifiers: parts };
}

function dispatchAppEvent(name: string) {
  window.dispatchEvent(new CustomEvent(name));
}

function activeLayer(): Layer | undefined {
  const activeLayerId = layerStore.activeLayerId.value;
  return layerStore.layers.value.find((layer) => layer.id === activeLayerId);
}

function activeLayerWithCanvas(): Layer | undefined {
  const layer = activeLayer();
  return layer?.canvas ? layer : undefined;
}

function freeformMask(state: SelectionState): Uint8Array | undefined {
  return state.type === 'selected' && state.shape === 'freeform' ? state.mask : undefined;
}

function isSelectionTool(tool: ToolType): boolean {
  return SELECTION_TOOLS.includes(tool);
}

function isShapeTool(tool: ToolType): boolean {
  return SHAPE_TOOLS.includes(tool);
}

function setToolSizeBy(delta: number) {
  const tool = toolStore.activeTool.value;
  const currentSize = getToolSize(tool);
  setToolSize(tool, Math.max(1, currentSize + delta));
}

function commitFloatingSelection(state: Extract<SelectionState, { type: 'floating' }>) {
  const layer = activeLayerWithCanvas();
  if (!layer?.canvas) return;

  historyStore.execute(
    new CommitFloatCommand(
      layer.canvas,
      layer.id,
      state.imageData,
      state.originalBounds,
      state.currentOffset,
      state.shape,
      state.mask
    )
  );
}

function moveSelectionByArrow(dx: number, dy: number) {
  const state = selectionStore.state.value;

  if (state.type === 'selected') {
    const layer = activeLayerWithCanvas();
    if (!layer?.canvas) return;

    historyStore.execute(
      new CutToFloatCommand(layer.canvas, layer.id, state.bounds, state.shape, freeformMask(state))
    );

    selectionStore.moveFloat(dx, dy);
    return;
  }

  if (state.type === 'floating') {
    selectionStore.moveFloat(dx, dy);
    return;
  }

  if (state.type === 'transforming') {
    selectionStore.moveTransform(dx, dy);
  }
}

function moveSelectionOrFrame(dx: number, dy: number, frameAction?: ShortcutAction) {
  if (selectionStore.isActive) {
    moveSelectionByArrow(dx, dy);
    return;
  }

  frameAction?.();
}

function toggleFillOrFillSelection() {
  if (isShapeTool(toolStore.activeTool.value)) {
    shapeSettings.fill.value = !shapeSettings.fill.value;
    return;
  }

  const state = selectionStore.state.value;
  if (state.type !== 'selected') return;

  const layer = activeLayerWithCanvas();
  if (!layer?.canvas) return;

  historyStore.execute(
    new FillSelectionCommand(
      layer.canvas,
      state.bounds,
      state.shape,
      colorStore.primaryColor.value,
      freeformMask(state)
    )
  );
}

function commitSelectionShortcut() {
  const state = selectionStore.state.value;
  if (state.type === 'floating') {
    commitFloatingSelection(state);
  }
}

function cancelSelection() {
  const state = selectionStore.state.value;
  if (state.type === 'floating') {
    historyStore.undo();
    return;
  }

  if (state.type === 'selected' || state.type === 'selecting') {
    selectionStore.clear();
  }
}

function deleteSelection() {
  const state = selectionStore.state.value;

  if (state.type === 'selected') {
    const layer = activeLayerWithCanvas();
    if (!layer?.canvas) return;

    historyStore.execute(
      new DeleteSelectionCommand(layer.canvas, state.bounds, state.shape, freeformMask(state))
    );
    return;
  }

  if (state.type === 'floating' || state.type === 'transforming') {
    selectionStore.clear();
  }
}

function deselect() {
  const state = selectionStore.state.value;
  if (state.type === 'floating') {
    commitFloatingSelection(state);
    return;
  }

  selectionStore.clear();
}

function selectAll() {
  selectionStore.state.value = {
    type: 'selected',
    shape: 'rectangle',
    bounds: {
      x: 0,
      y: 0,
      width: projectStore.width.value,
      height: projectStore.height.value,
    },
  };
}

function selectCelBounds() {
  const activeLayerId = layerStore.activeLayerId.value;
  if (!activeLayerId) return;

  const canvas = animationStore.getCelCanvas(animationStore.currentFrameId.value, activeLayerId);
  if (!canvas) return;

  if (!selectionStore.selectLayerContent(canvas)) {
    selectionStore.clear();
  }
}

function copySelection() {
  const state = selectionStore.state.value;
  if (state.type !== 'selected') return;

  const layer = activeLayerWithCanvas();
  if (!layer?.canvas) return;

  const ctx = layer.canvas.getContext('2d');
  if (!ctx) return;

  const { bounds, shape } = state;
  const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);

  if (shape === 'freeform') {
    const data = imageData.data;
    for (let i = 0; i < state.mask.length; i++) {
      if (state.mask[i] === 0) {
        data[i * 4 + 3] = 0;
      }
    }
  }

  clipboardStore.setData({
    imageData,
    shape,
    mask: shape === 'freeform' ? state.mask : undefined,
    width: bounds.width,
    height: bounds.height,
  });
}

function cutSelection() {
  const state = selectionStore.state.value;
  if (state.type !== 'selected') return;

  copySelection();

  const layer = activeLayerWithCanvas();
  if (!layer?.canvas) return;

  historyStore.execute(
    new DeleteSelectionCommand(layer.canvas, state.bounds, state.shape, freeformMask(state))
  );
}

function pasteSelection() {
  const data = clipboardStore.getData();
  if (!data) return;

  const layer = activeLayerWithCanvas();
  if (!layer?.canvas) return;

  const currentState = selectionStore.state.value;
  if (currentState.type === 'floating') {
    commitFloatingSelection(currentState);
  }

  const pasteX = Math.floor((projectStore.width.value - data.width) / 2);
  const pasteY = Math.floor((projectStore.height.value - data.height) / 2);

  selectionStore.state.value = {
    type: 'floating',
    shape: data.shape,
    imageData: data.imageData,
    originalBounds: { x: pasteX, y: pasteY, width: data.width, height: data.height },
    currentOffset: { x: 0, y: 0 },
    mask: data.mask,
  };
}

function invertSelection() {
  if (selectionStore.state.value.type !== 'selected') return;

  selectionStore.invertSelection(projectStore.width.value, projectStore.height.value);
}

async function captureBrush() {
  if (!canCaptureBrush()) {
    log.debug('No selection to capture as brush');
    return;
  }

  await captureBrushAndAdd();
}

function groupLayers() {
  const activeLayerId = layerStore.activeLayerId.value;
  const layer = activeLayer();
  if (!activeLayerId || !layer) return;

  if (layer.type === 'group') return;

  historyStore.execute(new GroupLayersCommand([activeLayerId]));
}

function ungroupLayers() {
  const activeLayerId = layerStore.activeLayerId.value;
  const layer = activeLayer();
  if (!activeLayerId || !layer) return;

  if (layer.type === 'group') {
    historyStore.execute(new UngroupLayersCommand(activeLayerId));
    return;
  }

  if (!layer.parentId) return;

  const parentGroup = layerStore.layers.value.find((candidate) => candidate.id === layer.parentId);
  if (parentGroup?.type === 'group') {
    historyStore.execute(new UngroupLayersCommand(parentGroup.id));
  }
}

function toolShortcuts(): ShortcutGroup {
  return Object.entries(toolRegistry)
    .filter(([, meta]) => Boolean(meta.shortcutKey))
    .map(([toolName, meta]) => ({
      ...parseShortcutKey(meta.shortcutKey),
      action: () => toolStore.setActiveTool(toolName as ToolType),
      description: `${meta.name} tool`,
    }));
}

const quickToolShortcuts: ShortcutGroup = [
  {
    key: 'Alt',
    modifiers: [],
    action: () => {
      if (!isSelectionTool(toolStore.activeTool.value)) {
        toolStore.setQuickTool('eyedropper');
      }
    },
    description: 'Quick eyedropper',
    options: {
      quick: true,
      releaseAction: () => {
        if (toolStore.activeTool.value === 'eyedropper') {
          toolStore.restorePreviousTool();
        }
      },
    },
  },
  {
    key: ' ',
    modifiers: [],
    action: () => toolStore.setQuickTool('hand'),
    description: 'Quick pan',
    options: {
      quick: true,
      releaseAction: () => toolStore.restorePreviousTool(),
    },
  },
];

const colorShortcuts: ShortcutGroup = [
  {
    key: 'x',
    modifiers: [],
    action: () => colorStore.swapColors(),
    description: 'Swap colors',
  },
];

const viewShortcuts: ShortcutGroup = [
  {
    key: '0',
    modifiers: [],
    action: () => viewportStore.resetView(),
    description: 'Fit to window',
  },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    key: String(level),
    modifiers: [],
    action: () => viewportStore.zoomToLevel(level),
    description: `Zoom ${[100, 200, 400, 800, 1600, 3200][level - 1]}%`,
  })),
];

const opacityShortcuts: ShortcutGroup = [
  ...Array.from({ length: 9 }, (_, index) => {
    const opacity = (index + 1) * 10;
    return {
      key: String(index + 1),
      modifiers: [MOD_PRIMARY],
      action: () => brushStore.setOpacity(opacity),
      description: `Opacity ${opacity}%`,
    };
  }),
  {
    key: '0',
    modifiers: [MOD_PRIMARY],
    action: () => brushStore.setOpacity(100),
    description: 'Opacity 100%',
  },
];

const brushSizeAndPanelShortcuts: ShortcutGroup = [
  {
    key: '[',
    modifiers: [],
    action: () => setToolSizeBy(-1),
    description: 'Decrease brush size',
  },
  {
    key: ']',
    modifiers: [],
    action: () => setToolSizeBy(1),
    description: 'Increase brush size',
  },
  {
    key: 'Tab',
    modifiers: [],
    action: () => panelStore.togglePanel('timeline'),
    description: 'Toggle timeline',
  },
  {
    key: 'g',
    modifiers: ['shift'],
    action: () => guidesStore.toggleVisibility(),
    description: 'Toggle guides',
  },
];

const animationShortcuts: ShortcutGroup = [
  {
    key: 'ArrowLeft',
    modifiers: [],
    action: () => moveSelectionOrFrame(-1, 0, () => animationStore.prevFrame()),
    description: 'Move selection left / Previous frame',
  },
  {
    key: 'ArrowRight',
    modifiers: [],
    action: () => moveSelectionOrFrame(1, 0, () => animationStore.nextFrame()),
    description: 'Move selection right / Next frame',
  },
  {
    key: 'ArrowUp',
    modifiers: [],
    action: () => moveSelectionOrFrame(0, -1),
    description: 'Move selection up',
  },
  {
    key: 'ArrowDown',
    modifiers: [],
    action: () => moveSelectionOrFrame(0, 1),
    description: 'Move selection down',
  },
  {
    key: 'ArrowLeft',
    modifiers: ['shift'],
    action: () => moveSelectionByArrow(-10, 0),
    description: 'Move selection left 10px',
  },
  {
    key: 'ArrowRight',
    modifiers: ['shift'],
    action: () => moveSelectionByArrow(10, 0),
    description: 'Move selection right 10px',
  },
  {
    key: 'ArrowUp',
    modifiers: ['shift'],
    action: () => moveSelectionByArrow(0, -10),
    description: 'Move selection up 10px',
  },
  {
    key: 'ArrowDown',
    modifiers: ['shift'],
    action: () => moveSelectionByArrow(0, 10),
    description: 'Move selection down 10px',
  },
  {
    key: 'Home',
    modifiers: [],
    action: () => animationStore.goToFirstFrame(),
    description: 'First frame',
  },
  {
    key: 'End',
    modifiers: [],
    action: () => animationStore.goToLastFrame(),
    description: 'Last frame',
  },
  {
    key: 'Enter',
    modifiers: [],
    action: () => animationStore.togglePlayback(),
    description: 'Play/Stop',
  },
  {
    key: 'n',
    modifiers: ['alt'],
    action: () => historyStore.execute(new AddFrameCommand(true)),
    description: 'New frame',
  },
];

const fillAndEditShortcuts: ShortcutGroup = [
  {
    key: 'f',
    modifiers: [],
    action: toggleFillOrFillSelection,
    description: 'Toggle fill / Fill selection',
  },
  {
    key: 'z',
    modifiers: [MOD_PRIMARY],
    action: () => historyStore.undo(),
    description: 'Undo',
  },
  {
    key: 'z',
    modifiers: [MOD_PRIMARY, 'shift'],
    action: () => historyStore.redo(),
    description: 'Redo',
  },
  {
    key: 'y',
    modifiers: ['ctrl'],
    action: () => historyStore.redo(),
    description: 'Redo',
  },
];

const selectionShortcuts: ShortcutGroup = [
  {
    key: 'Enter',
    modifiers: [],
    action: commitSelectionShortcut,
    description: 'Commit selection',
  },
  {
    key: 'Escape',
    modifiers: [],
    action: cancelSelection,
    description: 'Cancel selection',
  },
  {
    key: 'Delete',
    modifiers: [],
    action: deleteSelection,
    description: 'Delete selection',
  },
  {
    key: 'Backspace',
    modifiers: [],
    action: deleteSelection,
    description: 'Delete selection',
  },
  {
    key: 'd',
    modifiers: [MOD_PRIMARY],
    action: deselect,
    description: 'Deselect',
  },
  {
    key: 'a',
    modifiers: [MOD_PRIMARY],
    action: selectAll,
    description: 'Select all',
  },
  {
    key: 'd',
    modifiers: [MOD_PRIMARY, 'shift'],
    action: () => selectionStore.reselect(),
    description: 'Reselect',
  },
  {
    key: 't',
    modifiers: ['ctrl', 'shift'],
    action: selectCelBounds,
    description: 'Select cel bounds',
  },
];

const clipboardShortcuts: ShortcutGroup = [
  {
    key: 'c',
    modifiers: [MOD_PRIMARY],
    action: copySelection,
    description: 'Copy',
  },
  {
    key: 'x',
    modifiers: [MOD_PRIMARY],
    action: cutSelection,
    description: 'Cut',
  },
  {
    key: 'v',
    modifiers: [MOD_PRIMARY],
    action: pasteSelection,
    description: 'Paste',
  },
  {
    key: 'i',
    modifiers: ['ctrl', 'shift'],
    action: invertSelection,
    description: 'Invert selection',
  },
  {
    key: 'b',
    modifiers: [MOD_PRIMARY, 'shift'],
    action: () => {
      const currentBrush = brushStore.activeBrush.value;
      brushStore.updateActiveBrushSettings({
        pixelPerfect: !currentBrush.pixelPerfect,
      });
    },
    description: 'Toggle Pixel Perfect Mode',
  },
];

const fileShortcuts: ShortcutGroup = [
  {
    key: 'n',
    modifiers: ['ctrl'],
    action: () => dispatchAppEvent('show-new-project-dialog'),
    description: 'New project',
  },
  {
    key: 'o',
    modifiers: [MOD_PRIMARY],
    action: () => dispatchAppEvent('show-open-file-dialog'),
    description: 'Open project',
  },
  {
    key: 'e',
    modifiers: [MOD_PRIMARY],
    action: () => dispatchAppEvent('show-export-dialog'),
    description: 'Export',
  },
  {
    key: 'c',
    modifiers: [],
    action: () => dispatchAppEvent('show-resize-dialog'),
    description: 'Canvas resize',
  },
];

const brushShortcuts: ShortcutGroup = [
  {
    key: 'b',
    modifiers: [MOD_PRIMARY],
    action: captureBrush,
    description: 'Capture brush from selection',
  },
];

const layerShortcuts: ShortcutGroup = [
  {
    key: 'g',
    modifiers: [MOD_PRIMARY],
    action: groupLayers,
    description: 'Group layers',
  },
  {
    key: 'g',
    modifiers: [MOD_PRIMARY, 'shift'],
    action: ungroupLayers,
    description: 'Ungroup layers',
  },
];

const helpShortcuts: ShortcutGroup = [
  {
    key: '?',
    modifiers: [],
    action: () => dispatchAppEvent('show-keyboard-shortcuts-dialog'),
    description: 'Keyboard shortcuts',
  },
];

export function registerShortcuts() {
  const shortcutGroups: ShortcutGroup[] = [
    toolShortcuts(),
    quickToolShortcuts,
    colorShortcuts,
    viewShortcuts,
    opacityShortcuts,
    brushSizeAndPanelShortcuts,
    animationShortcuts,
    fillAndEditShortcuts,
    selectionShortcuts,
    clipboardShortcuts,
    fileShortcuts,
    brushShortcuts,
    layerShortcuts,
    helpShortcuts,
  ];

  for (const group of shortcutGroups) {
    registerShortcutGroup(group);
  }
}
