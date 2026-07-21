import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { MOD_PRIMARY } from '../../../src/utils/platform';
import { toolRegistry } from '../../../src/tools/tool-registry';
import { globalShortcutCategories } from '../../../src/services/keyboard/shortcut-definitions';
import { clipboardStore } from '../../../src/stores/clipboard';
import { toolStore } from '../../../src/stores/tools';
import {
  createProjectContext,
  defaultProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
} from '../../../src/stores/project-context';
import { selectionStore } from '../../../src/stores/selection';
import { GUIDED_DRAWING_VERSION } from '../../../src/types/guided-drawing';

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
  options?: { quick?: boolean; releaseAction?: () => void; physicalCode?: string },
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

interface EditableCanvas {
  canvas: HTMLCanvasElement;
  getPixel(x: number, y: number): number[];
  setPixel(x: number, y: number, color: number[]): void;
}

function rgbaOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function makeEditableCanvas(width: number, height: number): EditableCanvas {
  const buffer = new Uint8ClampedArray(width * height * 4);

  const createImageData = (regionWidth: number, regionHeight: number) => ({
    width: regionWidth,
    height: regionHeight,
    data: new Uint8ClampedArray(regionWidth * regionHeight * 4),
  }) as ImageData;

  const getImageData = (
    x: number,
    y: number,
    regionWidth: number,
    regionHeight: number
  ) => {
    const imageData = createImageData(regionWidth, regionHeight);

    for (let py = 0; py < regionHeight; py++) {
      for (let px = 0; px < regionWidth; px++) {
        const sourceOffset = rgbaOffset(width, x + px, y + py);
        const targetOffset = rgbaOffset(regionWidth, px, py);
        imageData.data[targetOffset] = buffer[sourceOffset];
        imageData.data[targetOffset + 1] = buffer[sourceOffset + 1];
        imageData.data[targetOffset + 2] = buffer[sourceOffset + 2];
        imageData.data[targetOffset + 3] = buffer[sourceOffset + 3];
      }
    }

    return imageData;
  };

  const putImageData = (imageData: ImageData, x: number, y: number) => {
    for (let py = 0; py < imageData.height; py++) {
      for (let px = 0; px < imageData.width; px++) {
        const sourceOffset = rgbaOffset(imageData.width, px, py);
        const targetOffset = rgbaOffset(width, x + px, y + py);
        buffer[targetOffset] = imageData.data[sourceOffset];
        buffer[targetOffset + 1] = imageData.data[sourceOffset + 1];
        buffer[targetOffset + 2] = imageData.data[sourceOffset + 2];
        buffer[targetOffset + 3] = imageData.data[sourceOffset + 3];
      }
    }
  };

  const canvas = {
    width,
    height,
    getContext: () => ({ createImageData, getImageData, putImageData }),
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    getPixel(x: number, y: number) {
      const offset = rgbaOffset(width, x, y);
      return Array.from(buffer.slice(offset, offset + 4));
    },
    setPixel(x: number, y: number, color: number[]) {
      const offset = rgbaOffset(width, x, y);
      buffer[offset] = color[0];
      buffer[offset + 1] = color[1];
      buffer[offset + 2] = color[2];
      buffer[offset + 3] = color[3];
    },
  };
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

function installActiveIndexedCanvasLayer(
  context: ReturnType<typeof createProjectContext>,
  width: number,
  height: number,
  indexBuffer: Uint8Array,
  canvas: HTMLCanvasElement = makeEditableCanvas(width, height).canvas
) {
  const layerId = 'paste-layer';
  const frameId = 'paste-frame';

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
  context.animation.currentFrameId.value = frameId;
  context.animation.cels.value = new Map([
    [
      context.animation.getCelKey(layerId, frameId),
      {
        id: 'paste-cel',
        layerId,
        frameId,
        canvas,
        indexBuffer,
      },
    ],
  ]);

  return { layerId, frameId };
}

function fillCanvas(canvas: EditableCanvas, color: number[]) {
  for (let y = 0; y < canvas.canvas.height; y++) {
    for (let x = 0; x < canvas.canvas.width; x++) {
      canvas.setPixel(x, y, color);
    }
  }
}

function indexRegionValues(
  indexBuffer: Uint8Array,
  canvasWidth: number,
  bounds: { x: number; y: number; width: number; height: number }
): number[] {
  const values: number[] = [];

  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      values.push(indexBuffer[y * canvasWidth + x]);
    }
  }

  return values;
}

function shortcutAction(combo: string): (() => void) | undefined {
  const calls = keyboardServiceMock.register.mock.calls as RegisterCall[];
  return calls.find((call) => comboFromCall(call) === combo)?.[2];
}

function shortcutActionByDescription(
  combo: string,
  description: string
): (() => void) | undefined {
  const calls = keyboardServiceMock.register.mock.calls as RegisterCall[];
  return calls.find((call) => comboFromCall(call) === combo && call[3] === description)?.[2];
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

    expect(keyboardServiceMock.register).toHaveBeenCalledTimes(82);
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

  it('leaves unmodified Tab available for native focus navigation', () => {
    registerShortcuts();

    const registeredCombos = (keyboardServiceMock.register.mock.calls as RegisterCall[]).map(
      comboFromCall
    );
    const displayedShortcuts = globalShortcutCategories.flatMap((category) => category.shortcuts);

    expect(registeredCombos).not.toContain('Tab');
    expect(displayedShortcuts).not.toContainEqual({ key: 'tab', action: 'Toggle timeline' });
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

  it('routes project-scoped view, color, guide, history, and selection shortcuts to the active context', async () => {
    const context = createProjectContext();
    setActiveProjectContext(context);
    context.project.width.value = 17;
    context.project.height.value = 9;

    const activeReset = vi.spyOn(context.viewport, 'resetView');
    const defaultReset = vi.spyOn(defaultProjectContext.viewport, 'resetView');
    const activeSwap = vi.spyOn(context.colors, 'swapColors');
    const defaultSwap = vi.spyOn(defaultProjectContext.colors, 'swapColors');
    const activeGuides = vi.spyOn(context.guides, 'toggleVisibility');
    const defaultGuides = vi.spyOn(defaultProjectContext.guides, 'toggleVisibility');
    const activeUndo = vi.spyOn(context.history, 'undo');
    const defaultUndo = vi.spyOn(defaultProjectContext.history, 'undo');

    try {
      registerShortcuts();

      shortcutAction('0')?.();
      shortcutAction('x')?.();
      shortcutActionByDescription('shift+g', 'Toggle guides')?.();
      shortcutAction(`${MOD_PRIMARY}+z`)?.();
      shortcutAction(`${MOD_PRIMARY}+a`)?.();
      await Promise.resolve();

      expect(activeReset).toHaveBeenCalledOnce();
      expect(activeSwap).toHaveBeenCalledOnce();
      expect(activeGuides).toHaveBeenCalledOnce();
      expect(activeUndo).toHaveBeenCalledOnce();
      expect(context.selection.state.value).toMatchObject({
        type: 'selected',
        bounds: { x: 0, y: 0, width: 17, height: 9 },
      });

      expect(defaultReset).not.toHaveBeenCalled();
      expect(defaultSwap).not.toHaveBeenCalled();
      expect(defaultGuides).not.toHaveBeenCalled();
      expect(defaultUndo).not.toHaveBeenCalled();
      expect(defaultProjectContext.selection.state.value.type).toBe('none');
    } finally {
      restoreDefaultProjectContext();
      context.dispose();
    }
  });

  it('routes physical digit shortcuts through the current guided project', () => {
    const guidedContext = createProjectContext();
    const normalContext = createProjectContext();
    const guideColors = Array.from({ length: 9 }, (_, index) => `#${String(index + 1).repeat(6)}`);
    guidedContext.palette.mainColors.value = guideColors;
    guidedContext.palette.rebuildColorMap();
    guidedContext.guidedDrawing.start({
      version: GUIDED_DRAWING_VERSION,
      width: 9,
      height: 1,
      target: Uint8Array.from({ length: 9 }, (_, index) => index + 1),
      guideColorCount: 9,
      settings: {
        longSide: 9,
        paletteSource: 'generated',
        maxColors: 9,
        mapping: 'color',
        simplifyIsolatedPixels: false,
      },
      createdAt: 1,
    });
    const normalZoom = vi.spyOn(normalContext.viewport, 'zoomToLevel');

    try {
      registerShortcuts();

      setActiveProjectContext(guidedContext);
      for (let guideNumber = 1; guideNumber <= 9; guideNumber++) {
        const call = (keyboardServiceMock.register.mock.calls as RegisterCall[]).find(
          ([key, modifiers]) => key === String(guideNumber) && modifiers.length === 0
        );
        expect(call?.[4]?.physicalCode).toBe(`Digit${guideNumber}`);
        call?.[2]();
        expect(guidedContext.colors.primaryColor.value).toBe(guideColors[guideNumber - 1]);
      }

      setActiveProjectContext(normalContext);
      shortcutAction('1')?.();
      expect(normalZoom).toHaveBeenCalledWith(1);
    } finally {
      restoreDefaultProjectContext();
      guidedContext.dispose();
      normalContext.dispose();
    }
  });

  it('leaves a missing guided color unchanged', () => {
    const context = createProjectContext();
    context.palette.mainColors.value = ['#111111'];
    context.palette.rebuildColorMap();
    context.colors.setPrimaryColor('#abcdef');
    context.guidedDrawing.start({
      version: GUIDED_DRAWING_VERSION,
      width: 1,
      height: 1,
      target: Uint8Array.from([1]),
      guideColorCount: 1,
      settings: {
        longSide: 1,
        paletteSource: 'generated',
        maxColors: 1,
        mapping: 'color',
        simplifyIsolatedPixels: false,
      },
      createdAt: 1,
    });
    setActiveProjectContext(context);

    try {
      registerShortcuts();
      shortcutAction('9')?.();

      expect(context.colors.primaryColor.value).toBe('#abcdef');
    } finally {
      restoreDefaultProjectContext();
      context.dispose();
    }
  });

  it('records selection edits in the active context history', () => {
    const context = createProjectContext();
    const canvas = makeEditableCanvas(4, 4);
    installActiveIndexedCanvasLayer(context, 4, 4, new Uint8Array(16), canvas.canvas);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    setActiveProjectContext(context);
    toolStore.setActiveTool('pencil');

    const activeExecute = vi.spyOn(context.history, 'execute').mockResolvedValue();
    const defaultExecute = vi.spyOn(defaultProjectContext.history, 'execute').mockResolvedValue();

    try {
      registerShortcuts();
      shortcutAction('f')?.();

      expect(activeExecute).toHaveBeenCalledOnce();
      expect(defaultExecute).not.toHaveBeenCalled();
    } finally {
      restoreDefaultProjectContext();
      context.dispose();
    }
  });

  it('keeps selection, frame, and layer shortcut actions inside the active context', () => {
    const context = createProjectContext();
    const canvas = makeEditableCanvas(4, 4);
    installActiveIndexedCanvasLayer(context, 4, 4, new Uint8Array(16), canvas.canvas);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    setActiveProjectContext(context);
    toolStore.setActiveTool('pencil');

    const activeExecute = vi.spyOn(context.history, 'execute').mockResolvedValue();
    const defaultExecute = vi.spyOn(defaultProjectContext.history, 'execute').mockResolvedValue();

    try {
      registerShortcuts();

      shortcutAction('f')?.();
      shortcutAction('Delete')?.();
      shortcutAction('alt+n')?.();
      shortcutAction(`${MOD_PRIMARY}+g`)?.();

      expect(activeExecute.mock.calls.map(([command]) => command.name)).toEqual([
        'Fill Selection',
        'Delete Selection',
        'Add Frame',
        'Group Layers',
      ]);
      expect(defaultExecute).not.toHaveBeenCalled();

      context.selection.clear();
      const activeNextFrame = vi.spyOn(context.animation, 'nextFrame');
      const defaultNextFrame = vi.spyOn(defaultProjectContext.animation, 'nextFrame');
      shortcutAction('ArrowRight')?.();

      expect(activeNextFrame).toHaveBeenCalledOnce();
      expect(defaultNextFrame).not.toHaveBeenCalled();
    } finally {
      restoreDefaultProjectContext();
      context.dispose();
    }
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

  it('does not copy pixels from an active reference layer', () => {
    const context = createProjectContext();
    setActiveProjectContext(context);

    try {
      const layerId = 'reference-layer';
      const frameId = 'copy-frame';
      const canvas = makeReadableCanvas(2, 2);

      context.layers.layers.value = [{
        id: layerId,
        name: 'Reference Layer',
        type: 'reference',
        visible: true,
        locked: false,
        opacity: 128,
        blendMode: 'normal',
        parentId: null,
        canvas,
        referenceData: {
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: 'image/png',
          x: 0,
          y: 0,
          scale: 1,
        },
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
            indexBuffer: Uint8Array.from([1, 1, 1, 1]),
          },
        ],
      ]);
      context.selection.state.value = {
        type: 'selected',
        shape: 'rectangle',
        bounds: { x: 0, y: 0, width: 2, height: 2 },
      };

      registerShortcuts();
      shortcutAction(`${MOD_PRIMARY}+c`)?.();

      expect(clipboardStore.getData()).toBeNull();
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
      expect(state.indexedPaste).toBeDefined();
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

  it('commits remapped paste palette and index changes as one target undo step', async () => {
    const sourceContext = createProjectContext();
    const targetContext = createProjectContext();
    const sourceCanvas = makeEditableCanvas(2, 2);
    const targetCanvas = makeEditableCanvas(4, 4);
    const targetIndexBuffer = new Uint8Array(16).fill(1);
    const pasteBounds = { x: 1, y: 1, width: 2, height: 2 };

    try {
      sourceContext.project.setSize(2, 2);
      sourceContext.palette.setPalette(['#ff0000', '#00ff00']);
      sourceContext.palette.clearAllNewFlags();
      sourceCanvas.setPixel(0, 0, [255, 0, 0, 255]);
      sourceCanvas.setPixel(1, 0, [0, 255, 0, 255]);
      sourceCanvas.setPixel(0, 1, [0, 0, 0, 0]);
      sourceCanvas.setPixel(1, 1, [255, 0, 0, 255]);
      installActiveIndexedCanvasLayer(
        sourceContext,
        2,
        2,
        Uint8Array.from([1, 2, 0, 1]),
        sourceCanvas.canvas
      );
      sourceContext.selection.state.value = {
        type: 'selected',
        shape: 'rectangle',
        bounds: { x: 0, y: 0, width: 2, height: 2 },
      };

      targetContext.project.setSize(4, 4);
      targetContext.palette.setPalette(['#00ff00']);
      targetContext.palette.clearAllNewFlags();
      fillCanvas(targetCanvas, [0, 255, 0, 255]);
      installActiveIndexedCanvasLayer(targetContext, 4, 4, targetIndexBuffer, targetCanvas.canvas);

      registerShortcuts();
      setActiveProjectContext(sourceContext);
      shortcutAction(`${MOD_PRIMARY}+c`)?.();
      sourceContext.dispose();

      setActiveProjectContext(targetContext);
      shortcutAction(`${MOD_PRIMARY}+v`)?.();

      const floatingState = targetContext.selection.state.value;
      expect(floatingState.type).toBe('floating');
      if (floatingState.type !== 'floating') return;
      expect(floatingState.indexedPaste).toBeDefined();
      expect(targetContext.palette.mainColors.value).toEqual(['#00ff00', '#ff0000']);
      expect(targetContext.palette.isNewColor('#ff0000')).toBe(true);

      shortcutActionByDescription('Enter', 'Commit selection')?.();
      await Promise.resolve();

      expect(targetContext.selection.state.value.type).toBe('none');
      expect(targetContext.palette.mainColors.value).toEqual(['#00ff00', '#ff0000']);
      expect(targetContext.palette.isNewColor('#ff0000')).toBe(true);
      expect(indexRegionValues(targetIndexBuffer, 4, pasteBounds)).toEqual([2, 1, 1, 2]);
      expect(targetCanvas.getPixel(1, 1)).toEqual([255, 0, 0, 255]);
      expect(targetCanvas.getPixel(2, 1)).toEqual([0, 255, 0, 255]);
      expect(targetCanvas.getPixel(1, 2)).toEqual([0, 255, 0, 255]);
      expect(targetCanvas.getPixel(2, 2)).toEqual([255, 0, 0, 255]);

      await targetContext.history.undo();

      const undoState = targetContext.selection.state.value;
      expect(undoState.type).toBe('floating');
      if (undoState.type !== 'floating') return;
      expect(undoState.indexedPaste).toBeDefined();
      expect(targetContext.palette.mainColors.value).toEqual(['#00ff00']);
      expect(targetContext.palette.newColorFlags.value.size).toBe(0);
      expect(indexRegionValues(targetIndexBuffer, 4, pasteBounds)).toEqual([1, 1, 1, 1]);
      expect(targetCanvas.getPixel(1, 1)).toEqual([0, 255, 0, 255]);
      expect(targetCanvas.getPixel(2, 2)).toEqual([0, 255, 0, 255]);

      await targetContext.history.redo();

      expect(targetContext.selection.state.value.type).toBe('none');
      expect(targetContext.palette.mainColors.value).toEqual(['#00ff00', '#ff0000']);
      expect(targetContext.palette.isNewColor('#ff0000')).toBe(true);
      expect(indexRegionValues(targetIndexBuffer, 4, pasteBounds)).toEqual([2, 1, 1, 2]);
      expect(targetCanvas.getPixel(1, 1)).toEqual([255, 0, 0, 255]);
      expect(targetCanvas.getPixel(2, 2)).toEqual([255, 0, 0, 255]);
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
      expect(state.indexedPaste).toBeUndefined();
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
      expect(state.indexedPaste).toBeUndefined();
    } finally {
      restoreDefaultProjectContext();
      context.dispose();
      clipboardStore.clear();
    }
  });
});
