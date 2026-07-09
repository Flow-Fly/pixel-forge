import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { MOD_PRIMARY } from '../../../src/utils/platform';
import { toolRegistry } from '../../../src/tools/tool-registry';
import { clipboardStore } from '../../../src/stores/clipboard';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
} from '../../../src/stores/project-context';
import { selectionStore } from '../../../src/stores/selection';

const keyboardServiceMock = vi.hoisted(() => ({
  register: vi.fn(),
}));

const workspaceStoreMock = vi.hoisted(() => ({
  activateNext: vi.fn(),
  activatePrevious: vi.fn(),
}));

vi.mock('../../../src/services/keyboard/shortcuts', () => ({
  keyboardService: keyboardServiceMock,
}));

vi.mock('../../../src/stores/workspace', () => ({
  workspaceStore: workspaceStoreMock,
}));

import { registerShortcuts } from '../../../src/services/keyboard/register-shortcuts';

type RegisterCall = [
  key: string,
  modifiers: string[],
  action: () => void,
  description: string,
  options?: { quick?: boolean; releaseAction?: () => void },
];

function comboFromCall([key, modifiers]: RegisterCall): string {
  return [...modifiers, key].join('+');
}

function makeReadableCanvas(width: number, height: number): HTMLCanvasElement {
  const imageData = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255),
  } as ImageData;

  return {
    width,
    height,
    getContext: () => ({
      getImageData: vi.fn(() => ({
        width,
        height,
        data: new Uint8ClampedArray(imageData.data),
      })),
    }),
  } as unknown as HTMLCanvasElement;
}

function makeImageData(width: number, height: number, pixels: number[][]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);

  pixels.forEach((pixel, index) => {
    const offset = index * 4;
    data[offset] = pixel[0];
    data[offset + 1] = pixel[1];
    data[offset + 2] = pixel[2];
    data[offset + 3] = pixel[3];
  });

  return { width, height, data } as ImageData;
}

function pixelAt(imageData: ImageData, x: number, y: number): number[] {
  const offset = (y * imageData.width + x) * 4;
  return Array.from(imageData.data.slice(offset, offset + 4));
}

function installActiveCanvasLayer(
  context: ReturnType<typeof createProjectContext>,
  width = 4,
  height = 4
) {
  const layerId = 'paste-layer';
  const canvas = makeReadableCanvas(width, height);

  context.layers.layers.value = [
    {
      id: layerId,
      name: 'Paste Layer',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      parentId: null,
      canvas,
    },
  ];
  context.layers.activeLayerId.value = layerId;
}

function shortcutAction(combo: string): (() => void) | undefined {
  const calls = keyboardServiceMock.register.mock.calls as RegisterCall[];
  return calls.find((call) => comboFromCall(call) === combo)?.[2];
}

describe('registerShortcuts', () => {
  beforeEach(() => {
    keyboardServiceMock.register.mockClear();
    workspaceStoreMock.activateNext.mockClear();
    workspaceStoreMock.activatePrevious.mockClear();
    clipboardStore.clear();
    selectionStore.clear();
  });

  it('registers tool shortcuts from the registry first', () => {
    registerShortcuts();

    const toolShortcutCount = Object.values(toolRegistry).filter((meta) => meta.shortcutKey).length;
    const toolCalls = keyboardServiceMock.register.mock.calls.slice(
      0,
      toolShortcutCount
    ) as RegisterCall[];

    expect(toolCalls.map(comboFromCall)).toEqual(
      Object.values(toolRegistry).map((meta) => meta.shortcutKey.toLowerCase())
    );
  });

  it('keeps the behavior-sensitive registration order stable', () => {
    registerShortcuts();

    const calls = keyboardServiceMock.register.mock.calls as RegisterCall[];
    const descriptionsByCombo = new Map(calls.map((call) => [comboFromCall(call), call[3]]));

    expect(keyboardServiceMock.register).toHaveBeenCalledTimes(80);
    expect(descriptionsByCombo.get('Alt')).toBe('Quick eyedropper');
    expect(descriptionsByCombo.get('0')).toBe('Fit to window');
    expect(descriptionsByCombo.get(`${MOD_PRIMARY}+0`)).toBe('Opacity 100%');
    expect(descriptionsByCombo.get('shift+g')).toBe('Toggle guides');
    expect(descriptionsByCombo.get(`${MOD_PRIMARY}+z`)).toBe('Undo');
    expect(descriptionsByCombo.get('ctrl+y')).toBe('Redo');
    expect(descriptionsByCombo.get('ctrl+n')).toBe('New project');
    expect(descriptionsByCombo.get(`${MOD_PRIMARY}+o`)).toBe('Open project');
    expect(descriptionsByCombo.get(`${MOD_PRIMARY}+Tab`)).toBe('Next project tab');
    expect(descriptionsByCombo.get('ctrl+PageDown')).toBe('Next project tab');
    expect(descriptionsByCombo.get('ctrl+PageUp')).toBe('Previous project tab');
    expect(descriptionsByCombo.get(`${MOD_PRIMARY}+g`)).toBe('Group layers');
    expect(descriptionsByCombo.get('?')).toBe('Keyboard shortcuts');

    const enterDescriptions = calls
      .filter((call) => comboFromCall(call) === 'Enter')
      .map((call) => call[3]);
    expect(enterDescriptions).toEqual(['Play/Stop', 'Commit selection']);
  });

  it('dispatches the project browser event for the open project shortcut', () => {
    registerShortcuts();

    const calls = keyboardServiceMock.register.mock.calls as RegisterCall[];
    const openProjectCall = calls.find((call) => comboFromCall(call) === `${MOD_PRIMARY}+o`);
    let browserRequested = false;

    window.addEventListener('show-project-browser', () => {
      browserRequested = true;
    }, { once: true });

    openProjectCall?.[2]();

    expect(browserRequested).toBe(true);
  });

  it('routes project tab shortcuts through the workspace store', () => {
    registerShortcuts();

    const calls = keyboardServiceMock.register.mock.calls as RegisterCall[];
    const nextByTab = calls.find((call) => comboFromCall(call) === `${MOD_PRIMARY}+Tab`);
    const nextByPageDown = calls.find((call) => comboFromCall(call) === 'ctrl+PageDown');
    const previousByPageUp = calls.find((call) => comboFromCall(call) === 'ctrl+PageUp');

    nextByTab?.[2]();
    nextByPageDown?.[2]();
    previousByPageUp?.[2]();

    expect(workspaceStoreMock.activateNext).toHaveBeenCalledTimes(2);
    expect(workspaceStoreMock.activatePrevious).toHaveBeenCalledTimes(1);
  });

  it('copies indexed selection metadata from the active project context', () => {
    const context = createProjectContext();
    setActiveProjectContext(context);

    try {
      const layerId = 'copy-layer';
      const frameId = 'copy-frame';
      const canvas = makeReadableCanvas(2, 2);

      context.layers.layers.value = [{
        id: layerId,
        name: 'Copy Layer',
        type: 'image',
        visible: true,
        locked: false,
        opacity: 255,
        blendMode: 'normal',
        parentId: null,
        canvas,
      }];
      context.layers.activeLayerId.value = layerId;
      context.animation.currentFrameId.value = frameId;
      context.animation.cels.value = new Map([
        [
          context.animation.getCelKey(layerId, frameId),
          {
            id: 'copy-cel',
            layerId,
            frameId,
            canvas,
            indexBuffer: Uint8Array.from([2, 3, 0, 2]),
          },
        ],
      ]);
      context.palette.mainColors.value = ['#111111', '#222222', '#333333'];
      context.selection.state.value = {
        type: 'selected',
        shape: 'freeform',
        bounds: { x: 0, y: 0, width: 2, height: 2 },
        mask: Uint8Array.from([255, 0, 255, 255]),
      };

      registerShortcuts();
      const calls = keyboardServiceMock.register.mock.calls as RegisterCall[];
      const copyCall = calls.find((call) => comboFromCall(call) === `${MOD_PRIMARY}+c`);

      copyCall?.[2]();

      const clipboardData = clipboardStore.getData();
      expect(clipboardData?.imageData.width).toBe(2);
      expect(clipboardData?.imageData.height).toBe(2);
      expect(clipboardData?.imageData.data[7]).toBe(0);
      expect(Array.from(clipboardData!.indexedSelection!.indexData)).toEqual([2, 0, 0, 2]);
      expect(clipboardData!.indexedSelection!.sourceColors).toEqual([
        '#111111',
        '#222222',
        '#333333',
      ]);
      expect(clipboardData!.indexedSelection!.usedIndices).toEqual([2]);
    } finally {
      restoreDefaultProjectContext();
      context.dispose();
      clipboardStore.clear();
      selectionStore.clear();
    }
  });

  it('pastes remapped indexed clipboard data into the active project context', () => {
    const sourceContext = createProjectContext();
    const targetContext = createProjectContext();

    try {
      sourceContext.palette.setPalette(['#ff0000', '#00ff00']);
      clipboardStore.setData({
        imageData: makeImageData(2, 2, [
          [9, 9, 9, 255],
          [9, 9, 9, 255],
          [9, 9, 9, 255],
          [9, 9, 9, 255],
        ]),
        shape: 'rectangle',
        width: 2,
        height: 2,
        indexedSelection: {
          indexData: Uint8Array.from([1, 2, 0, 1]),
          sourceColors: ['#ff0000', '#00ff00'],
          usedIndices: [1, 2],
          shape: 'rectangle',
          width: 2,
          height: 2,
        },
      });
      sourceContext.dispose();

      targetContext.project.setSize(4, 4);
      targetContext.palette.setPalette(['#00ff00']);
      targetContext.palette.clearAllNewFlags();
      installActiveCanvasLayer(targetContext);
      setActiveProjectContext(targetContext);

      registerShortcuts();
      shortcutAction(`${MOD_PRIMARY}+v`)?.();

      const state = targetContext.selection.state.value;
      expect(state.type).toBe('floating');
      if (state.type !== 'floating') return;

      expect(state.originalBounds).toEqual({ x: 1, y: 1, width: 2, height: 2 });
      expect(pixelAt(state.imageData, 0, 0)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(state.imageData, 1, 0)).toEqual([0, 255, 0, 255]);
      expect(pixelAt(state.imageData, 0, 1)).toEqual([0, 0, 0, 0]);
      expect(pixelAt(state.imageData, 1, 1)).toEqual([255, 0, 0, 255]);
      expect(targetContext.palette.mainColors.value).toEqual(['#00ff00', '#ff0000']);
      expect(targetContext.palette.isNewColor('#ff0000')).toBe(true);
    } finally {
      restoreDefaultProjectContext();
      sourceContext.dispose();
      targetContext.dispose();
      clipboardStore.clear();
    }
  });

  it('keeps same-index palette paste on the original image data fast path', () => {
    const context = createProjectContext();
    const imageData = makeImageData(1, 1, [[10, 20, 30, 123]]);

    try {
      context.project.setSize(3, 3);
      context.palette.setPalette(['#ff0000']);
      context.palette.clearAllNewFlags();
      installActiveCanvasLayer(context);
      setActiveProjectContext(context);
      clipboardStore.setData({
        imageData,
        shape: 'rectangle',
        width: 1,
        height: 1,
        indexedSelection: {
          indexData: Uint8Array.from([1]),
          sourceColors: ['#ff0000'],
          usedIndices: [1],
          shape: 'rectangle',
          width: 1,
          height: 1,
        },
      });

      registerShortcuts();
      shortcutAction(`${MOD_PRIMARY}+v`)?.();

      const state = context.selection.state.value;
      expect(state.type).toBe('floating');
      if (state.type !== 'floating') return;

      expect(state.imageData).toBe(imageData);
      expect(context.palette.mainColors.value).toEqual(['#ff0000']);
      expect(context.palette.newColorFlags.value.size).toBe(0);
    } finally {
      restoreDefaultProjectContext();
      context.dispose();
      clipboardStore.clear();
    }
  });

  it('keeps imageData-only clipboard paste behavior unchanged', () => {
    const context = createProjectContext();
    const imageData = makeImageData(1, 1, [[1, 2, 3, 4]]);

    try {
      context.project.setSize(3, 3);
      installActiveCanvasLayer(context);
      setActiveProjectContext(context);
      clipboardStore.setData({
        imageData,
        shape: 'rectangle',
        width: 1,
        height: 1,
      });

      registerShortcuts();
      shortcutAction(`${MOD_PRIMARY}+v`)?.();

      const state = context.selection.state.value;
      expect(state.type).toBe('floating');
      if (state.type !== 'floating') return;

      expect(state.imageData).toBe(imageData);
    } finally {
      restoreDefaultProjectContext();
      context.dispose();
      clipboardStore.clear();
    }
  });
});
