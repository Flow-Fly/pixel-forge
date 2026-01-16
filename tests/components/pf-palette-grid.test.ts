import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { paletteStore } from '../../src/stores/palette';
import { colorStore } from '../../src/stores/colors';

/**
 * Palette Grid Component Tests
 *
 * Tests for pf-palette-grid component:
 * - Swatch rendering with correct colors
 * - Click to select foreground color
 * - Right-click to select background color
 * - Double-click to open editor (emits event)
 * - Delete color (X icon)
 * - FG/BG indicator display
 * - Usage dot display (current frame vs other frames)
 * - Drag to reorder
 */

// Helper function to create and mount the component
async function createPaletteGrid(): Promise<HTMLElement> {
  // Dynamically import the component to ensure it's registered
  await import('../../src/components/color/palette-panel/pf-palette-grid');

  const element = document.createElement('pf-palette-grid');
  document.body.appendChild(element);

  // Wait for Lit to complete rendering
  await (element as any).updateComplete;

  return element;
}

// Helper to clean up DOM after tests
function cleanup(element: HTMLElement) {
  element.remove();
}

// Helper to get all swatches
function getSwatches(element: HTMLElement): NodeListOf<Element> {
  return element.shadowRoot!.querySelectorAll('.swatch');
}

// Helper to get swatch at index
function getSwatchAt(element: HTMLElement, index: number): Element | null {
  const swatches = getSwatches(element);
  return swatches[index] ?? null;
}

describe('PfPaletteGrid', () => {
  let element: HTMLElement;

  beforeEach(async () => {
    // Reset store state before each test
    paletteStore.mainColors.value = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000'];
    paletteStore.usedColorsInCurrentFrame.value = new Set();
    paletteStore.usedColorsInOtherFrames.value = new Set();
    colorStore.primaryColor.value = '#ff0000';
    colorStore.secondaryColor.value = '#ffffff';

    element = await createPaletteGrid();
  });

  afterEach(() => {
    cleanup(element);
    vi.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render the palette grid container', () => {
      const grid = element.shadowRoot?.querySelector('.palette-grid');
      expect(grid).toBeTruthy();
    });

    it('should render correct number of swatches', () => {
      const swatches = getSwatches(element);
      expect(swatches.length).toBe(5);
    });

    it('should render swatches with correct background colors', () => {
      const swatches = getSwatches(element);
      // happy-dom may return hex or rgb format
      const bg0 = (swatches[0] as HTMLElement).style.backgroundColor.toLowerCase();
      const bg1 = (swatches[1] as HTMLElement).style.backgroundColor.toLowerCase();
      const bg2 = (swatches[2] as HTMLElement).style.backgroundColor.toLowerCase();
      expect(bg0 === '#ff0000' || bg0 === 'rgb(255, 0, 0)').toBe(true);
      expect(bg1 === '#00ff00' || bg1 === 'rgb(0, 255, 0)').toBe(true);
      expect(bg2 === '#0000ff' || bg2 === 'rgb(0, 0, 255)').toBe(true);
    });

    it('should update when palette colors change', async () => {
      paletteStore.mainColors.value = ['#ffff00', '#00ffff'];
      await (element as any).updateComplete;

      const swatches = getSwatches(element);
      expect(swatches.length).toBe(2);
      const bg = (swatches[0] as HTMLElement).style.backgroundColor.toLowerCase();
      expect(bg === '#ffff00' || bg === 'rgb(255, 255, 0)').toBe(true);
    });
  });

  describe('Click to Select Foreground Color', () => {
    it('should select color as foreground on click', async () => {
      const swatch = getSwatchAt(element, 1); // Green
      swatch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(colorStore.primaryColor.value).toBe('#00ff00');
    });

    it('should not change secondary color on left click', async () => {
      const originalSecondary = colorStore.secondaryColor.value;
      const swatch = getSwatchAt(element, 1);
      swatch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(colorStore.secondaryColor.value).toBe(originalSecondary);
    });
  });

  describe('Right-click to Select Background Color', () => {
    it('should select color as background on right-click', async () => {
      const swatch = getSwatchAt(element, 2); // Blue
      swatch?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      expect(colorStore.secondaryColor.value).toBe('#0000ff');
    });

    it('should not change primary color on right-click', async () => {
      const originalPrimary = colorStore.primaryColor.value;
      const swatch = getSwatchAt(element, 2);
      swatch?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      expect(colorStore.primaryColor.value).toBe(originalPrimary);
    });
  });

  describe('Double-click to Open Editor', () => {
    it('should emit swatch-edit event on double-click', async () => {
      const eventPromise = new Promise<CustomEvent>((resolve) => {
        element.addEventListener('swatch-edit', (e) => resolve(e as CustomEvent), { once: true });
      });

      const swatch = getSwatchAt(element, 1); // Green
      swatch?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      const event = await eventPromise;
      expect(event.detail.color).toBe('#00ff00');
      expect(event.detail.index).toBe(1);
    });
  });

  describe('FG/BG Indicator Display', () => {
    it('should show FG indicator on primary color swatch', async () => {
      colorStore.primaryColor.value = '#00ff00';
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 1); // Green
      const fgIndicator = swatch?.querySelector('.indicator-fg');
      expect(fgIndicator).toBeTruthy();
    });

    it('should show BG indicator on secondary color swatch', async () => {
      colorStore.secondaryColor.value = '#0000ff';
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 2); // Blue
      const bgIndicator = swatch?.querySelector('.indicator-bg');
      expect(bgIndicator).toBeTruthy();
    });

    it('should not show FG indicator on non-primary swatches', async () => {
      colorStore.primaryColor.value = '#ff0000';
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 1); // Green (not primary)
      const fgIndicator = swatch?.querySelector('.indicator-fg');
      expect(fgIndicator).toBeFalsy();
    });

    it('should update indicators when colors change', async () => {
      colorStore.primaryColor.value = '#ff0000';
      await (element as any).updateComplete;

      let fgIndicator = getSwatchAt(element, 0)?.querySelector('.indicator-fg');
      expect(fgIndicator).toBeTruthy();

      colorStore.primaryColor.value = '#00ff00';
      await (element as any).updateComplete;

      fgIndicator = getSwatchAt(element, 0)?.querySelector('.indicator-fg');
      expect(fgIndicator).toBeFalsy();

      fgIndicator = getSwatchAt(element, 1)?.querySelector('.indicator-fg');
      expect(fgIndicator).toBeTruthy();
    });
  });

  describe('Usage Dot Display', () => {
    it('should show solid dot for colors used in current frame', async () => {
      paletteStore.usedColorsInCurrentFrame.value = new Set(['#ff0000']);
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 0); // Red
      expect(swatch?.classList.contains('swatch-used-current')).toBe(true);
    });

    it('should show hollow dot for colors used only in other frames', async () => {
      paletteStore.usedColorsInOtherFrames.value = new Set(['#00ff00']);
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 1); // Green
      expect(swatch?.classList.contains('swatch-used-other')).toBe(true);
    });

    it('should prioritize current frame indicator over other frames', async () => {
      // Color used in both current and other frames
      paletteStore.usedColorsInCurrentFrame.value = new Set(['#0000ff']);
      paletteStore.usedColorsInOtherFrames.value = new Set(['#0000ff']);
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 2); // Blue
      expect(swatch?.classList.contains('swatch-used-current')).toBe(true);
      expect(swatch?.classList.contains('swatch-used-other')).toBe(false);
    });

    it('should show no usage indicator for unused colors', async () => {
      paletteStore.usedColorsInCurrentFrame.value = new Set();
      paletteStore.usedColorsInOtherFrames.value = new Set();
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 0);
      expect(swatch?.classList.contains('swatch-used-current')).toBe(false);
      expect(swatch?.classList.contains('swatch-used-other')).toBe(false);
    });

    it('should include usage info in title attribute', async () => {
      paletteStore.usedColorsInCurrentFrame.value = new Set(['#ff0000']);
      paletteStore.usedColorsInOtherFrames.value = new Set(['#00ff00']);
      await (element as any).updateComplete;

      const redSwatch = getSwatchAt(element, 0);
      const greenSwatch = getSwatchAt(element, 1);
      const blueSwatch = getSwatchAt(element, 2);

      expect(redSwatch?.getAttribute('title')).toContain('current frame');
      expect(greenSwatch?.getAttribute('title')).toContain('other frames');
      expect(blueSwatch?.getAttribute('title')).not.toContain('frame');
    });
  });

  describe('Delete Color', () => {
    it('should have delete button on each swatch container', () => {
      const deleteButtons = element.shadowRoot?.querySelectorAll('.swatch-delete');
      expect(deleteButtons?.length).toBe(5);
    });

    it('should call removeColorToEphemeral when delete clicked', async () => {
      const spy = vi.spyOn(paletteStore, 'removeColorToEphemeral');

      const deleteButton = element.shadowRoot?.querySelectorAll('.swatch-delete')[1];
      deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(spy).toHaveBeenCalledWith(1);
    });
  });

  describe('Replace Mode', () => {
    it('should add replace-mode class when replaceMode is true', async () => {
      (element as any).replaceMode = true;
      await (element as any).updateComplete;

      const grid = element.shadowRoot?.querySelector('.palette-grid');
      expect(grid?.classList.contains('replace-mode')).toBe(true);
    });

    it('should emit replace-target event on click in replace mode', async () => {
      (element as any).replaceMode = true;
      (element as any).replaceColor = '#ffff00';
      await (element as any).updateComplete;

      const eventPromise = new Promise<CustomEvent>((resolve) => {
        element.addEventListener('replace-target', (e) => resolve(e as CustomEvent), { once: true });
      });

      const swatch = getSwatchAt(element, 1);
      swatch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const event = await eventPromise;
      expect(event.detail.index).toBe(1);
    });

    it('should show replace hint in title when in replace mode', async () => {
      (element as any).replaceMode = true;
      (element as any).replaceColor = '#ffff00';
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 0);
      expect(swatch?.getAttribute('title')).toContain('Click to replace');
    });
  });

  describe('Drag and Drop', () => {
    it('should set draggable attribute on swatches', () => {
      const swatch = getSwatchAt(element, 0);
      expect(swatch?.getAttribute('draggable')).toBe('true');
    });

    it('should not be draggable in replace mode', async () => {
      (element as any).replaceMode = true;
      await (element as any).updateComplete;

      const swatch = getSwatchAt(element, 0);
      expect(swatch?.getAttribute('draggable')).toBe('false');
    });

    it('should add drag-active class when dragging', async () => {
      const swatch = getSwatchAt(element, 0) as HTMLElement;

      // Create drag event with data transfer
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      });
      swatch.dispatchEvent(dragStartEvent);

      await (element as any).updateComplete;

      const grid = element.shadowRoot?.querySelector('.palette-grid');
      expect(grid?.classList.contains('drag-active')).toBe(true);
    });

    it('should set correct data in dataTransfer on drag start', () => {
      const swatch = getSwatchAt(element, 1) as HTMLElement; // Green at index 1

      // Create a mock dataTransfer that captures setData calls
      const setDataCalls: Array<[string, string]> = [];
      const mockDataTransfer = {
        effectAllowed: '',
        setData: (type: string, data: string) => { setDataCalls.push([type, data]); },
        getData: () => '',
      };

      const dragStartEvent = new DragEvent('dragstart', { bubbles: true });
      Object.defineProperty(dragStartEvent, 'dataTransfer', { value: mockDataTransfer });
      swatch.dispatchEvent(dragStartEvent);

      expect(setDataCalls).toContainEqual(['application/x-palette-index', '1']);
      expect(setDataCalls).toContainEqual(['application/x-palette-color', '#00ff00']);
    });

    it('should track dragged index in component state', async () => {
      const swatch = getSwatchAt(element, 2) as HTMLElement;
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      });
      swatch.dispatchEvent(dragStartEvent);

      expect((element as any).draggedIndex).toBe(2);
      expect((element as any).isDragging).toBe(true);
    });

    it('should add dragging class to source swatch container', async () => {
      const swatch = getSwatchAt(element, 1) as HTMLElement;
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      });
      swatch.dispatchEvent(dragStartEvent);
      await (element as any).updateComplete;

      const containers = element.shadowRoot?.querySelectorAll('.swatch-container');
      expect(containers?.[1]?.classList.contains('dragging')).toBe(true);
    });

    it('should show drag-before indicator on dragover', async () => {
      // Start drag from index 0
      const sourceSwatch = getSwatchAt(element, 0) as HTMLElement;
      sourceSwatch.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      }));

      // Drag over index 2
      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[2] as HTMLElement;
      targetContainer.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      }));
      await (element as any).updateComplete;

      expect(targetContainer.classList.contains('drag-before')).toBe(true);
    });

    it('should clear drag-before on dragleave', async () => {
      // Start drag and hover over target
      const sourceSwatch = getSwatchAt(element, 0) as HTMLElement;
      sourceSwatch.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      }));

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[2] as HTMLElement;
      targetContainer.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      }));
      await (element as any).updateComplete;
      expect((element as any).dragOverIndex).toBe(2);

      // Leave the target
      targetContainer.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
      await (element as any).updateComplete;

      expect((element as any).dragOverIndex).toBe(null);
    });

    it('should reorder colors on drop', async () => {
      const spy = vi.spyOn(paletteStore, 'moveColor');

      // Create mock dataTransfer that returns data
      const dataStore = new Map<string, string>([
        ['application/x-palette-index', '0'],
        ['application/x-palette-color', '#ff0000'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'move',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[3] as HTMLElement;
      const dropEvent = new DragEvent('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', { value: mockDataTransfer });
      targetContainer.dispatchEvent(dropEvent);

      // Should move from 0 to adjusted index (3-1=2 since source < target)
      expect(spy).toHaveBeenCalledWith(0, 2);
    });

    it('should not move when dropping on same position', async () => {
      const spy = vi.spyOn(paletteStore, 'moveColor');

      const dataStore = new Map<string, string>([
        ['application/x-palette-index', '2'],
        ['application/x-palette-color', '#0000ff'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'move',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[2] as HTMLElement;
      const dropEvent = new DragEvent('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', { value: mockDataTransfer });
      targetContainer.dispatchEvent(dropEvent);

      expect(spy).not.toHaveBeenCalled();
    });

    it('should not move when dropping on adjacent position', async () => {
      const spy = vi.spyOn(paletteStore, 'moveColor');

      // Dropping index 2 onto index 3 (adjacent) shouldn't move
      const dataStore = new Map<string, string>([
        ['application/x-palette-index', '2'],
        ['application/x-palette-color', '#0000ff'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'move',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[3] as HTMLElement;
      const dropEvent = new DragEvent('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', { value: mockDataTransfer });
      targetContainer.dispatchEvent(dropEvent);

      // fromIndex (2) !== targetIndex - 1 (2), so this should not call moveColor
      expect(spy).not.toHaveBeenCalled();
    });

    it('should clean up state on drag end', async () => {
      const swatch = getSwatchAt(element, 0) as HTMLElement;

      // Start drag
      swatch.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      }));
      expect((element as any).isDragging).toBe(true);

      // End drag
      swatch.dispatchEvent(new DragEvent('dragend', { bubbles: true }));

      expect((element as any).isDragging).toBe(false);
      expect((element as any).draggedIndex).toBe(null);
      expect((element as any).dragOverIndex).toBe(null);
    });

    it('should remove drag-active class after drag end', async () => {
      const swatch = getSwatchAt(element, 0) as HTMLElement;

      swatch.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      }));
      await (element as any).updateComplete;

      const grid = element.shadowRoot?.querySelector('.palette-grid');
      expect(grid?.classList.contains('drag-active')).toBe(true);

      swatch.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
      await (element as any).updateComplete;

      expect(grid?.classList.contains('drag-active')).toBe(false);
    });

    it('should handle ephemeral color drop from untracked section', async () => {
      const removeFromEphemeralSpy = vi.spyOn(paletteStore, 'removeFromEphemeral');
      const insertColorAtSpy = vi.spyOn(paletteStore, 'insertColorAt');

      const dataStore = new Map<string, string>([
        ['application/x-palette-color', '#ffff00'],
        ['application/x-ephemeral-color', 'true'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'move',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[2] as HTMLElement;
      const dropEvent = new DragEvent('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', { value: mockDataTransfer });
      targetContainer.dispatchEvent(dropEvent);

      expect(removeFromEphemeralSpy).toHaveBeenCalledWith('#ffff00');
      expect(insertColorAtSpy).toHaveBeenCalledWith(3, '#ffff00'); // targetIndex + 1
    });

    it('should handle drop on grid (append ephemeral)', async () => {
      const removeFromEphemeralSpy = vi.spyOn(paletteStore, 'removeFromEphemeral');
      const addColorSpy = vi.spyOn(paletteStore, 'addColor');

      const dataStore = new Map<string, string>([
        ['application/x-palette-color', '#ff00ff'],
        ['application/x-ephemeral-color', 'true'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'move',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const grid = element.shadowRoot?.querySelector('.palette-grid') as HTMLElement;
      const dropEvent = new DragEvent('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', { value: mockDataTransfer });
      grid.dispatchEvent(dropEvent);

      expect(removeFromEphemeralSpy).toHaveBeenCalledWith('#ff00ff');
      expect(addColorSpy).toHaveBeenCalledWith('#ff00ff');
    });
  });

  describe('Drag Modifier Keys', () => {
    // Helper to create a DragEvent with proper modifier keys
    function createDragEvent(
      type: string,
      options: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; dataTransfer?: object } = {}
    ): DragEvent {
      const event = new DragEvent(type, { bubbles: true });
      if (options.shiftKey) Object.defineProperty(event, 'shiftKey', { value: true });
      if (options.ctrlKey) Object.defineProperty(event, 'ctrlKey', { value: true });
      if (options.metaKey) Object.defineProperty(event, 'metaKey', { value: true });
      if (options.dataTransfer) Object.defineProperty(event, 'dataTransfer', { value: options.dataTransfer });
      return event;
    }

    it('should swap colors when Shift is held during drop', async () => {
      const swapSpy = vi.spyOn(paletteStore, 'swapColors');

      const dataStore = new Map<string, string>([
        ['application/x-palette-index', '0'],
        ['application/x-palette-color', '#ff0000'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'move',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[3] as HTMLElement;
      const dropEvent = createDragEvent('drop', { shiftKey: true, dataTransfer: mockDataTransfer });
      targetContainer.dispatchEvent(dropEvent);

      expect(swapSpy).toHaveBeenCalledWith(0, 3);
    });

    it('should duplicate color when Ctrl is held during drop', async () => {
      const duplicateSpy = vi.spyOn(paletteStore, 'duplicateColor');

      const dataStore = new Map<string, string>([
        ['application/x-palette-index', '1'],
        ['application/x-palette-color', '#00ff00'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'copy',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[4] as HTMLElement;
      const dropEvent = createDragEvent('drop', { ctrlKey: true, dataTransfer: mockDataTransfer });
      targetContainer.dispatchEvent(dropEvent);

      expect(duplicateSpy).toHaveBeenCalledWith(1, 4);
    });

    it('should duplicate color when Meta (Cmd) is held during drop', async () => {
      const duplicateSpy = vi.spyOn(paletteStore, 'duplicateColor');

      const dataStore = new Map<string, string>([
        ['application/x-palette-index', '2'],
        ['application/x-palette-color', '#0000ff'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'copy',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[0] as HTMLElement;
      const dropEvent = createDragEvent('drop', { metaKey: true, dataTransfer: mockDataTransfer });
      targetContainer.dispatchEvent(dropEvent);

      expect(duplicateSpy).toHaveBeenCalledWith(2, 0);
    });

    it('should track modifier state during drag', async () => {
      const swatch = getSwatchAt(element, 0) as HTMLElement;

      const mockDataTransfer = {
        effectAllowed: '',
        setData: () => {},
        getData: () => '',
      };
      const dragStartEvent = createDragEvent('dragstart', { shiftKey: true, dataTransfer: mockDataTransfer });
      swatch.dispatchEvent(dragStartEvent);

      expect((element as any).dragModifier).toBe('swap');
    });

    it('should update modifier state on dragover when modifier changes', async () => {
      const swatch = getSwatchAt(element, 0) as HTMLElement;

      const mockDataTransfer = {
        effectAllowed: '',
        dropEffect: '',
        setData: () => {},
        getData: () => '',
      };

      // Start drag without modifier
      const dragStartEvent = createDragEvent('dragstart', { dataTransfer: mockDataTransfer });
      swatch.dispatchEvent(dragStartEvent);
      expect((element as any).dragModifier).toBe('move');

      // Drag over with Ctrl held
      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[2] as HTMLElement;
      const dragOverEvent = createDragEvent('dragover', { ctrlKey: true, dataTransfer: mockDataTransfer });
      targetContainer.dispatchEvent(dragOverEvent);

      expect((element as any).dragModifier).toBe('copy');
    });

    it('should add drag-copy class when Ctrl is held', async () => {
      const swatch = getSwatchAt(element, 0) as HTMLElement;

      const mockDataTransfer = {
        effectAllowed: '',
        setData: () => {},
        getData: () => '',
      };
      const dragStartEvent = createDragEvent('dragstart', { ctrlKey: true, dataTransfer: mockDataTransfer });
      swatch.dispatchEvent(dragStartEvent);
      await (element as any).updateComplete;

      const grid = element.shadowRoot?.querySelector('.palette-grid');
      expect(grid?.classList.contains('drag-copy')).toBe(true);
    });

    it('should add drag-swap class when Shift is held', async () => {
      const swatch = getSwatchAt(element, 0) as HTMLElement;

      const mockDataTransfer = {
        effectAllowed: '',
        setData: () => {},
        getData: () => '',
      };
      const dragStartEvent = createDragEvent('dragstart', { shiftKey: true, dataTransfer: mockDataTransfer });
      swatch.dispatchEvent(dragStartEvent);
      await (element as any).updateComplete;

      const grid = element.shadowRoot?.querySelector('.palette-grid');
      expect(grid?.classList.contains('drag-swap')).toBe(true);
    });

    it('should not swap when dropping on same index', async () => {
      const swapSpy = vi.spyOn(paletteStore, 'swapColors');

      const dataStore = new Map<string, string>([
        ['application/x-palette-index', '2'],
        ['application/x-palette-color', '#0000ff'],
      ]);
      const mockDataTransfer = {
        dropEffect: 'move',
        getData: (type: string) => dataStore.get(type) ?? '',
      };

      const targetContainer = element.shadowRoot?.querySelectorAll('.swatch-container')[2] as HTMLElement;
      const dropEvent = createDragEvent('drop', { shiftKey: true, dataTransfer: mockDataTransfer });
      targetContainer.dispatchEvent(dropEvent);

      expect(swapSpy).not.toHaveBeenCalled();
    });

    it('should reset modifier state after drag end', async () => {
      const swatch = getSwatchAt(element, 0) as HTMLElement;

      const mockDataTransfer = {
        effectAllowed: '',
        setData: () => {},
        getData: () => '',
      };
      const dragStartEvent = createDragEvent('dragstart', { shiftKey: true, dataTransfer: mockDataTransfer });
      swatch.dispatchEvent(dragStartEvent);
      expect((element as any).dragModifier).toBe('swap');

      // End drag
      swatch.dispatchEvent(new DragEvent('dragend', { bubbles: true }));

      expect((element as any).dragModifier).toBe('move');
    });
  });

  describe('Inline Ephemeral Colors', () => {
    beforeEach(async () => {
      // Add ephemeral colors
      paletteStore.ephemeralColors.value = ['#ffff00', '#ff00ff'];
      await (element as any).updateComplete;
    });

    it('should render ephemeral colors with dashed border', async () => {
      const swatches = getSwatches(element);
      // 5 main + 2 ephemeral = 7 swatches
      expect(swatches.length).toBe(7);

      // Last two should be ephemeral (have swatch-uncommitted class)
      expect(swatches[5]?.classList.contains('swatch-uncommitted')).toBe(true);
      expect(swatches[6]?.classList.contains('swatch-uncommitted')).toBe(true);
    });

    it('should show commit button on ephemeral swatches', async () => {
      const containers = element.shadowRoot?.querySelectorAll('.swatch-container');
      // Ephemeral containers should have commit button
      const commitButtons = containers?.[5]?.querySelectorAll('.swatch-commit');
      expect(commitButtons?.length).toBe(1);
    });

    it('should show discard button on ephemeral swatches', async () => {
      const containers = element.shadowRoot?.querySelectorAll('.swatch-container');
      // Ephemeral containers should have discard button
      const discardButtons = containers?.[5]?.querySelectorAll('.swatch-discard');
      expect(discardButtons?.length).toBe(1);
    });

    it('should call promoteEphemeralColor on commit click', async () => {
      const spy = vi.spyOn(paletteStore, 'promoteEphemeralColor');

      const commitButton = element.shadowRoot?.querySelectorAll('.swatch-commit')[0];
      commitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(spy).toHaveBeenCalledWith('#ffff00');
    });

    it('should call removeFromEphemeral on discard click', async () => {
      const spy = vi.spyOn(paletteStore, 'removeFromEphemeral');

      const discardButton = element.shadowRoot?.querySelectorAll('.swatch-discard')[0];
      discardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(spy).toHaveBeenCalledWith('#ffff00');
    });

    it('should promote ephemeral color on right-click', async () => {
      const spy = vi.spyOn(paletteStore, 'promoteEphemeralColor');

      const ephemeralSwatch = getSwatchAt(element, 5); // First ephemeral
      ephemeralSwatch?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      expect(spy).toHaveBeenCalledWith('#ffff00');
    });

    it('should show "(uncommitted)" in tooltip for ephemeral colors', async () => {
      const ephemeralSwatch = getSwatchAt(element, 5);
      const title = ephemeralSwatch?.getAttribute('title');
      expect(title).toContain('uncommitted');
    });

    it('should not show delete button on ephemeral swatches', async () => {
      const containers = element.shadowRoot?.querySelectorAll('.swatch-container');
      // Ephemeral containers should NOT have delete button (only commit/discard)
      const deleteButtons = containers?.[5]?.querySelectorAll('.swatch-delete');
      expect(deleteButtons?.length).toBe(0);
    });
  });

  describe('Keyboard Accessibility', () => {
    beforeEach(async () => {
      paletteStore.ephemeralColors.value = ['#ffff00'];
      await (element as any).updateComplete;
    });

    it('should commit color when Enter pressed on commit button', async () => {
      const spy = vi.spyOn(paletteStore, 'promoteEphemeralColor');

      const commitButton = element.shadowRoot?.querySelector('.swatch-commit') as HTMLElement;
      commitButton?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(spy).toHaveBeenCalledWith('#ffff00');
    });

    it('should commit color when Space pressed on commit button', async () => {
      const spy = vi.spyOn(paletteStore, 'promoteEphemeralColor');

      const commitButton = element.shadowRoot?.querySelector('.swatch-commit') as HTMLElement;
      commitButton?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      expect(spy).toHaveBeenCalledWith('#ffff00');
    });

    it('should discard color when Enter pressed on discard button', async () => {
      const spy = vi.spyOn(paletteStore, 'removeFromEphemeral');

      const discardButton = element.shadowRoot?.querySelector('.swatch-discard') as HTMLElement;
      discardButton?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(spy).toHaveBeenCalledWith('#ffff00');
    });

    it('should have tabindex on commit and discard buttons', async () => {
      const commitButton = element.shadowRoot?.querySelector('.swatch-commit');
      const discardButton = element.shadowRoot?.querySelector('.swatch-discard');

      expect(commitButton?.getAttribute('tabindex')).toBe('0');
      expect(discardButton?.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('Hue Group Display', () => {
    it('should show group dividers when autoSort is enabled', async () => {
      paletteStore.mainColors.value = ['#ff0000', '#00ff00', '#0000ff'];
      paletteStore.setAutoSortByHue(true);
      await (element as any).updateComplete;

      const groupStarts = element.shadowRoot?.querySelectorAll('.hue-group-start');
      expect(groupStarts?.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      paletteStore.setAutoSortByHue(false);
    });

    it('should not mark first group with hue-group-start', async () => {
      paletteStore.mainColors.value = ['#ff0000', '#00ff00', '#0000ff'];
      paletteStore.setAutoSortByHue(true);
      await (element as any).updateComplete;

      // First container should NOT have hue-group-start (it's the first group)
      const containers = element.shadowRoot?.querySelectorAll('.swatch-container');
      expect(containers?.[0]?.classList.contains('hue-group-start')).toBe(false);

      // Cleanup
      paletteStore.setAutoSortByHue(false);
    });

    it('should not show dividers when autoSort is disabled', async () => {
      paletteStore.mainColors.value = ['#ff0000', '#00ff00', '#0000ff'];
      paletteStore.setAutoSortByHue(false);
      await (element as any).updateComplete;

      const groupStarts = element.shadowRoot?.querySelectorAll('.hue-group-start');
      expect(groupStarts?.length).toBe(0);
    });

    it('should preserve ephemeral state when toggling autoSort', async () => {
      paletteStore.mainColors.value = ['#ff0000'];
      paletteStore.ephemeralColors.value = ['#00ff00'];

      paletteStore.setAutoSortByHue(true);
      await (element as any).updateComplete;

      // Find ephemeral swatch
      const uncommittedSwatches = element.shadowRoot?.querySelectorAll('.swatch-uncommitted');
      expect(uncommittedSwatches?.length).toBe(1);

      paletteStore.setAutoSortByHue(false);
      await (element as any).updateComplete;

      const uncommittedAfter = element.shadowRoot?.querySelectorAll('.swatch-uncommitted');
      expect(uncommittedAfter?.length).toBe(1);

      // Cleanup
      paletteStore.setAutoSortByHue(false);
    });
  });

  describe('Ephemeral Drag-Drop', () => {
    beforeEach(async () => {
      paletteStore.ephemeralColors.value = ['#ffff00'];
      await (element as any).updateComplete;
    });

    it('should allow dragging ephemeral colors', async () => {
      const ephemeralSwatch = getSwatchAt(element, 5) as HTMLElement; // First ephemeral

      const mockDataTransfer = {
        effectAllowed: '',
        setData: vi.fn(),
        getData: () => '',
      };
      const dragStartEvent = new DragEvent('dragstart', { bubbles: true });
      Object.defineProperty(dragStartEvent, 'dataTransfer', { value: mockDataTransfer });
      ephemeralSwatch.dispatchEvent(dragStartEvent);

      expect(mockDataTransfer.setData).toHaveBeenCalledWith('application/x-palette-color', '#ffff00');
      expect(mockDataTransfer.setData).toHaveBeenCalledWith('application/x-ephemeral-color', 'true');
    });

    it('should set isEphemeral data when dragging ephemeral color', async () => {
      const ephemeralSwatch = getSwatchAt(element, 5) as HTMLElement;

      const setDataCalls: Array<[string, string]> = [];
      const mockDataTransfer = {
        effectAllowed: '',
        setData: (type: string, data: string) => { setDataCalls.push([type, data]); },
        getData: () => '',
      };

      const dragStartEvent = new DragEvent('dragstart', { bubbles: true });
      Object.defineProperty(dragStartEvent, 'dataTransfer', { value: mockDataTransfer });
      ephemeralSwatch.dispatchEvent(dragStartEvent);

      expect(setDataCalls).toContainEqual(['application/x-ephemeral-color', 'true']);
    });
  });
});
