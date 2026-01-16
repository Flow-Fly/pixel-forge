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
  });
});
