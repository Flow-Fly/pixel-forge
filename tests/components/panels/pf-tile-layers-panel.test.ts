/**
 * Tests for pf-tile-layers-panel component
 *
 * Tests for Story 4-1:
 * - Panel structure and visibility (Task 1, AC #1)
 * - Default layer display (Task 2, AC #2)
 * - Layer selection (Task 2, AC #4)
 * - Add layer functionality (Task 3, AC #3)
 * - Inline layer renaming (Task 4, AC #5, #6)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tilemapStore } from '../../../src/stores/tilemap';

// Helper to dynamically import and create component
async function createTileLayersPanel(): Promise<HTMLElement & {
  editingLayerId: string | null;
}> {
  await import('../../../src/components/panels/pf-tile-layers-panel');
  const element = document.createElement('pf-tile-layers-panel') as any;
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

function cleanup(element: HTMLElement) {
  element.remove();
}

describe('pf-tile-layers-panel', () => {
  let element: Awaited<ReturnType<typeof createTileLayersPanel>>;

  beforeEach(async () => {
    tilemapStore.reset();
    tilemapStore.initializeDefaultLayer();
    element = await createTileLayersPanel();
  });

  afterEach(() => {
    cleanup(element);
    vi.restoreAllMocks();
  });

  describe('Task 1: Component structure (AC #1)', () => {
    it('should be defined as custom element', () => {
      expect(customElements.get('pf-tile-layers-panel')).toBeDefined();
    });

    it('should render panel header with "Tile Layers" title', async () => {
      const header = element.shadowRoot?.querySelector('.header');
      expect(header).not.toBeNull();
      expect(header?.textContent).toContain('Tile Layers');
    });

    it('should render add layer button (+)', async () => {
      const addBtn = element.shadowRoot?.querySelector('.add-layer-btn');
      expect(addBtn).not.toBeNull();
    });
  });

  describe('Task 2: Layer item rendering (AC #2, #4)', () => {
    it('should render default layer from store', async () => {
      const layerItems = element.shadowRoot?.querySelectorAll('.layer-item');
      expect(layerItems?.length).toBeGreaterThanOrEqual(1);
    });

    it('should show layer name in layer item', async () => {
      const layerName = element.shadowRoot?.querySelector('.layer-name');
      expect(layerName?.textContent).toContain('Layer 1');
    });

    it('should highlight active layer with selected class', async () => {
      const activeLayer = element.shadowRoot?.querySelector('.layer-item.selected');
      expect(activeLayer).not.toBeNull();
    });

    it('should set active layer when layer is clicked (AC #4)', async () => {
      // Add a second layer
      tilemapStore.addLayer('Layer 2');
      await (element as any).updateComplete;

      const layerItems = element.shadowRoot?.querySelectorAll('.layer-item');
      expect(layerItems?.length).toBe(2);

      // Click on the first layer (bottom layer)
      const firstLayer = layerItems?.[1] as HTMLElement; // Layers rendered top-to-bottom
      firstLayer?.click();
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      expect(tilemapStore.activeLayerId.value).toBe(layers[0].id);
    });
  });

  describe('Task 3: Add layer functionality (AC #3)', () => {
    it('should create new layer when add button is clicked', async () => {
      const initialCount = tilemapStore.layers.value.length;

      const addBtn = element.shadowRoot?.querySelector('.add-layer-btn') as HTMLButtonElement;
      addBtn?.click();
      await (element as any).updateComplete;

      expect(tilemapStore.layers.value.length).toBe(initialCount + 1);
    });

    it('should auto-name new layer as "Layer N"', async () => {
      const addBtn = element.shadowRoot?.querySelector('.add-layer-btn') as HTMLButtonElement;
      addBtn?.click();
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      const newLayer = layers[layers.length - 1];
      expect(newLayer.name).toMatch(/Layer \d+/);
    });
  });

  describe('Task 4: Inline layer renaming (AC #5, #6)', () => {
    it('should enter edit mode on double-click layer name (AC #5)', async () => {
      const layerName = element.shadowRoot?.querySelector('.layer-name') as HTMLElement;
      layerName?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await (element as any).updateComplete;

      expect(element.editingLayerId).not.toBeNull();
      const input = element.shadowRoot?.querySelector('.layer-name-input');
      expect(input).not.toBeNull();
    });

    it('should confirm rename on Enter key (AC #5)', async () => {
      const layerName = element.shadowRoot?.querySelector('.layer-name') as HTMLElement;
      layerName?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await (element as any).updateComplete;

      const input = element.shadowRoot?.querySelector('.layer-name-input') as HTMLInputElement;
      input.value = 'Ground Layer';
      // Fire input event to update component state
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      expect(layers[0].name).toBe('Ground Layer');
      expect(element.editingLayerId).toBeNull();
    });

    it('should revert to previous name on empty input (AC #6)', async () => {
      const originalName = tilemapStore.layers.value[0].name;

      const layerName = element.shadowRoot?.querySelector('.layer-name') as HTMLElement;
      layerName?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await (element as any).updateComplete;

      const input = element.shadowRoot?.querySelector('.layer-name-input') as HTMLInputElement;
      input.value = '   '; // Whitespace only
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      expect(layers[0].name).toBe(originalName);
    });

    it('should cancel rename on Escape key', async () => {
      const originalName = tilemapStore.layers.value[0].name;

      const layerName = element.shadowRoot?.querySelector('.layer-name') as HTMLElement;
      layerName?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await (element as any).updateComplete;

      const input = element.shadowRoot?.querySelector('.layer-name-input') as HTMLInputElement;
      input.value = 'New Name';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      expect(layers[0].name).toBe(originalName);
      expect(element.editingLayerId).toBeNull();
    });

    it('should confirm rename on blur', async () => {
      const layerName = element.shadowRoot?.querySelector('.layer-name') as HTMLElement;
      layerName?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await (element as any).updateComplete;

      const input = element.shadowRoot?.querySelector('.layer-name-input') as HTMLInputElement;
      input.value = 'Blur Renamed';
      // Fire input event to update component state
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      expect(layers[0].name).toBe('Blur Renamed');
    });
  });

  describe('Integration tests', () => {
    it('should update display when layers change in store', async () => {
      // Add multiple layers
      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layerItems = element.shadowRoot?.querySelectorAll('.layer-item');
      expect(layerItems?.length).toBe(3);
    });

    it('should render layers in correct visual order (top layer first)', async () => {
      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layerNames = element.shadowRoot?.querySelectorAll('.layer-name');
      const names = Array.from(layerNames || []).map(el => el.textContent?.trim());

      // Top layer (last in array) should be first in UI
      expect(names[0]).toBe('Layer 3');
      expect(names[2]).toBe('Layer 1');
    });

    it('should show visibility and lock icons', async () => {
      const layerItem = element.shadowRoot?.querySelector('.layer-item');
      const visibilityIcon = layerItem?.querySelector('.visibility-icon');
      const lockIcon = layerItem?.querySelector('.lock-icon');

      expect(visibilityIcon).not.toBeNull();
      expect(lockIcon).not.toBeNull();
    });
  });
});
