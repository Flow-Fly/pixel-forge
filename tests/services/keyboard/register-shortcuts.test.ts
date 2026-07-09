import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { MOD_PRIMARY } from '../../../src/utils/platform';
import { toolRegistry } from '../../../src/tools/tool-registry';
import { animationStore } from '../../../src/stores/animation';
import { clipboardStore } from '../../../src/stores/clipboard';
import { layerStore } from '../../../src/stores/layers';
import { paletteStore } from '../../../src/stores/palette';
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

  it('copies indexed selection metadata with the existing image data payload', () => {
    const previousLayers = layerStore.layers.value;
    const previousActiveLayerId = layerStore.activeLayerId.value;
    const previousCels = animationStore.cels.value;
    const previousFrameId = animationStore.currentFrameId.value;
    const previousPalette = [...paletteStore.mainColors.value];

    try {
      const layerId = 'copy-layer';
      const frameId = 'copy-frame';
      const canvas = makeReadableCanvas(2, 2);

      layerStore.layers.value = [{
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
      layerStore.activeLayerId.value = layerId;
      animationStore.currentFrameId.value = frameId;
      animationStore.cels.value = new Map([
        [
          animationStore.getCelKey(layerId, frameId),
          {
            id: 'copy-cel',
            layerId,
            frameId,
            canvas,
            indexBuffer: Uint8Array.from([2, 3, 0, 2]),
          },
        ],
      ]);
      paletteStore.mainColors.value = ['#111111', '#222222', '#333333'];
      selectionStore.state.value = {
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
      layerStore.layers.value = previousLayers;
      layerStore.activeLayerId.value = previousActiveLayerId;
      animationStore.cels.value = previousCels;
      animationStore.currentFrameId.value = previousFrameId;
      paletteStore.mainColors.value = previousPalette;
      clipboardStore.clear();
      selectionStore.clear();
    }
  });
});
