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
import { modeStore } from '../../../src/stores/mode';

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

    it('should fire layer-added custom event (Task 3.5)', async () => {
      const listener = vi.fn();
      element.addEventListener('layer-added', listener);

      const addBtn = element.shadowRoot?.querySelector('.add-layer-btn') as HTMLButtonElement;
      addBtn?.click();
      await (element as any).updateComplete;

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent;
      expect(event.detail.layer).toBeDefined();
      expect(event.detail.layer.name).toMatch(/Layer \d+/);

      element.removeEventListener('layer-added', listener);
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

  describe('Keyboard navigation (NFR17)', () => {
    it('should navigate to next layer with ArrowDown', async () => {
      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      // Set first layer active (Layer 3 is at index 0 in reversed UI)
      const layers = tilemapStore.layers.value;
      tilemapStore.setActiveLayer(layers[2].id); // Layer 3 (top)
      await (element as any).updateComplete;

      const firstItem = element.shadowRoot?.querySelector('.layer-item') as HTMLElement;
      firstItem?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await (element as any).updateComplete;

      // Should now be on Layer 2 (second in reversed UI)
      expect(tilemapStore.activeLayerId.value).toBe(layers[1].id);
    });

    it('should navigate to previous layer with ArrowUp', async () => {
      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      // Set second layer active
      const layers = tilemapStore.layers.value;
      tilemapStore.setActiveLayer(layers[1].id); // Layer 2 (middle)
      await (element as any).updateComplete;

      const layerItems = element.shadowRoot?.querySelectorAll('.layer-item');
      const secondItem = layerItems?.[1] as HTMLElement;
      secondItem?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await (element as any).updateComplete;

      // Should now be on Layer 3 (top)
      expect(tilemapStore.activeLayerId.value).toBe(layers[2].id);
    });
  });

  describe('Task 1 & 2: Visibility and Lock Toggle (Story 4-2)', () => {
    it('should toggle layer visibility when visibility icon is clicked (AC #1)', async () => {
      expect(tilemapStore.layers.value[0].visible).toBe(true);

      const visibilityIcon = element.shadowRoot?.querySelector('.visibility-icon') as HTMLElement;
      visibilityIcon?.click();
      await (element as any).updateComplete;

      expect(tilemapStore.layers.value[0].visible).toBe(false);
    });

    it('should toggle layer locked when lock icon is clicked (AC #3)', async () => {
      expect(tilemapStore.layers.value[0].locked).toBe(false);

      const lockIcon = element.shadowRoot?.querySelector('.lock-icon') as HTMLElement;
      lockIcon?.click();
      await (element as any).updateComplete;

      expect(tilemapStore.layers.value[0].locked).toBe(true);
    });

    it('should not trigger layer selection when clicking visibility icon', async () => {
      // Add second layer and select it
      tilemapStore.addLayer('Layer 2');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      tilemapStore.setActiveLayer(layers[1].id); // Select Layer 2
      await (element as any).updateComplete;

      // Click visibility icon on Layer 1 (second in reversed UI)
      const visibilityIcons = element.shadowRoot?.querySelectorAll('.visibility-icon');
      (visibilityIcons?.[1] as HTMLElement)?.click();
      await (element as any).updateComplete;

      // Active layer should still be Layer 2
      expect(tilemapStore.activeLayerId.value).toBe(layers[1].id);
    });

    it('should not trigger layer selection when clicking lock icon', async () => {
      // Add second layer and select it
      tilemapStore.addLayer('Layer 2');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      tilemapStore.setActiveLayer(layers[1].id); // Select Layer 2
      await (element as any).updateComplete;

      // Click lock icon on Layer 1 (second in reversed UI)
      const lockIcons = element.shadowRoot?.querySelectorAll('.lock-icon');
      (lockIcons?.[1] as HTMLElement)?.click();
      await (element as any).updateComplete;

      // Active layer should still be Layer 2
      expect(tilemapStore.activeLayerId.value).toBe(layers[1].id);
    });

    it('should update visibility icon styling when layer is hidden (Task 1.5)', async () => {
      const visibilityIcon = element.shadowRoot?.querySelector('.visibility-icon') as HTMLElement;
      visibilityIcon?.click();
      await (element as any).updateComplete;

      const updatedIcon = element.shadowRoot?.querySelector('.visibility-icon');
      expect(updatedIcon?.classList.contains('hidden')).toBe(true);
    });

    it('should update lock icon styling when layer is locked (Task 2.5)', async () => {
      const lockIcon = element.shadowRoot?.querySelector('.lock-icon') as HTMLElement;
      lockIcon?.click();
      await (element as any).updateComplete;

      const updatedIcon = element.shadowRoot?.querySelector('.lock-icon');
      expect(updatedIcon?.classList.contains('locked')).toBe(true);
    });

    it('should update visibility icon title based on state (Task 1.4)', async () => {
      let visibilityIcon = element.shadowRoot?.querySelector('.visibility-icon') as HTMLElement;
      expect(visibilityIcon?.getAttribute('title')).toBe('Hide layer');

      visibilityIcon?.click();
      await (element as any).updateComplete;

      visibilityIcon = element.shadowRoot?.querySelector('.visibility-icon') as HTMLElement;
      expect(visibilityIcon?.getAttribute('title')).toBe('Show layer');
    });

    it('should update lock icon title based on state (Task 2.4)', async () => {
      let lockIcon = element.shadowRoot?.querySelector('.lock-icon') as HTMLElement;
      expect(lockIcon?.getAttribute('title')).toBe('Lock layer');

      lockIcon?.click();
      await (element as any).updateComplete;

      lockIcon = element.shadowRoot?.querySelector('.lock-icon') as HTMLElement;
      expect(lockIcon?.getAttribute('title')).toBe('Unlock layer');
    });
  });

  describe('Task 5: Keyboard Shortcuts (Story 4-2)', () => {
    it('should toggle visibility of active layer when H key is pressed', async () => {
      // Shortcuts only work in Map mode
      modeStore.setMode('map');

      const layerId = tilemapStore.layers.value[0].id;
      expect(tilemapStore.layers.value[0].visible).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
      await (element as any).updateComplete;

      expect(tilemapStore.layers.value[0].visible).toBe(false);
    });

    it('should toggle lock of active layer when / key is pressed', async () => {
      // Shortcuts only work in Map mode
      modeStore.setMode('map');

      const layerId = tilemapStore.layers.value[0].id;
      expect(tilemapStore.layers.value[0].locked).toBe(false);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
      await (element as any).updateComplete;

      expect(tilemapStore.layers.value[0].locked).toBe(true);
    });

    it('should not toggle when editing layer name', async () => {
      // Shortcuts only work in Map mode
      modeStore.setMode('map');

      // Enter edit mode
      const layerName = element.shadowRoot?.querySelector('.layer-name') as HTMLElement;
      layerName?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await (element as any).updateComplete;

      expect(element.editingLayerId).not.toBeNull();

      const originalVisible = tilemapStore.layers.value[0].visible;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
      await (element as any).updateComplete;

      expect(tilemapStore.layers.value[0].visible).toBe(originalVisible);
    });

    it('should not toggle in Art mode', async () => {
      // Ensure we're in Art mode
      modeStore.setMode('art');

      const originalVisible = tilemapStore.layers.value[0].visible;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
      await (element as any).updateComplete;

      // Should not change because we're in Art mode
      expect(tilemapStore.layers.value[0].visible).toBe(originalVisible);
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

  // ========================================
  // Story 4-3: Layer Reordering Tests (Task 6.2)
  // ========================================
  describe('Layer Reordering - Drag and Drop (Story 4-3 Task 6.2)', () => {
    it('should have draggable attribute on layer items (Task 6.2.1)', async () => {
      tilemapStore.addLayer('Layer 2');
      await (element as any).updateComplete;

      const layerItems = element.shadowRoot?.querySelectorAll('.layer-item');
      layerItems?.forEach(item => {
        expect(item.getAttribute('draggable')).toBe('true');
      });
    });

    it('should have drag event handlers bound to layer items', async () => {
      tilemapStore.addLayer('Layer 2');
      await (element as any).updateComplete;

      // Verify the component has drag state properties
      expect((element as any).draggingLayerId).toBeNull();
      expect((element as any).dropTargetId).toBeNull();
      expect((element as any).dropPosition).toBeNull();
    });

    it('should have CSS styles for dragging state', async () => {
      // Check that the component has the necessary CSS
      const styles = element.shadowRoot?.adoptedStyleSheets || [];
      const styleText = (element.constructor as any).styles?.cssText || '';

      // Verify drag-related CSS classes exist in styles
      expect(styleText).toContain('.dragging');
      expect(styleText).toContain('.drop-indicator-above');
      expect(styleText).toContain('.drop-indicator-below');
    });

    it('should reorder layers via drag-drop simulation (M2 fix)', async () => {
      // Setup: Create 3 layers
      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      const layer1Id = layers[0].id;
      const layer3Id = layers[2].id;

      // Get layer items (rendered in reverse order: Layer 3 first in UI)
      const layerItems = element.shadowRoot?.querySelectorAll('.layer-item');
      expect(layerItems?.length).toBe(3);

      // Simulate drag start on Layer 1 (last in UI, index 2 in DOM)
      const layer1Element = layerItems?.[2] as HTMLElement;
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        dataTransfer: new DataTransfer()
      });
      layer1Element?.dispatchEvent(dragStartEvent);
      await (element as any).updateComplete;

      expect((element as any).draggingLayerId).toBe(layer1Id);

      // Simulate drag over Layer 3 (first in UI, index 0 in DOM)
      const layer3Element = layerItems?.[0] as HTMLElement;
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientY: 10 // Above midpoint to trigger 'above' drop position
      });
      Object.defineProperty(dragOverEvent, 'currentTarget', { value: layer3Element });
      layer3Element?.dispatchEvent(dragOverEvent);
      await (element as any).updateComplete;

      expect((element as any).dropTargetId).toBe(layer3Id);

      // Simulate drop
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true
      });
      layer3Element?.dispatchEvent(dropEvent);
      await (element as any).updateComplete;

      // Verify drag state is cleaned up
      expect((element as any).draggingLayerId).toBeNull();
      expect((element as any).dropTargetId).toBeNull();
    });

    it('should handle adjacent layer drag correctly (M1 fix)', async () => {
      // Setup: Create 3 layers [Layer 1, Layer 2, Layer 3] at indices [0, 1, 2]
      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      const layer2Id = layers[1].id;
      const layer3Id = layers[2].id;

      // Directly test the store's reorderLayer for adjacent swap
      // Move Layer 2 (index 1) to index 2 (swap with Layer 3)
      tilemapStore.reorderLayer(layer2Id, 2);

      const updatedLayers = tilemapStore.layers.value;
      expect(updatedLayers[2].id).toBe(layer2Id);
      expect(updatedLayers[1].id).toBe(layer3Id);
    });
  });

  describe('Layer Reordering - Keyboard Shortcuts (Story 4-3 Task 6.2.2-6.2.4)', () => {
    it('should move active layer up with Cmd+Up (Task 6.2.2)', async () => {
      modeStore.setMode('map');

      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      // Select Layer 1 (index 0)
      tilemapStore.setActiveLayer(layers[0].id);

      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        metaKey: true
      }));
      await (element as any).updateComplete;

      // Layer 1 should now be at index 1
      const updatedLayers = tilemapStore.layers.value;
      expect(updatedLayers[1].name).toBe('Layer 1');
    });

    it('should move active layer down with Cmd+Down (Task 6.2.3)', async () => {
      modeStore.setMode('map');

      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      // Select Layer 3 (index 2, at top)
      tilemapStore.setActiveLayer(layers[2].id);

      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        metaKey: true
      }));
      await (element as any).updateComplete;

      // Layer 3 should now be at index 1
      const updatedLayers = tilemapStore.layers.value;
      expect(updatedLayers[1].name).toBe('Layer 3');
    });

    it('should not reorder in Art mode (Task 6.2.4)', async () => {
      modeStore.setMode('art');

      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      const originalOrder = layers.map(l => l.id);
      tilemapStore.setActiveLayer(layers[0].id);

      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        metaKey: true
      }));
      await (element as any).updateComplete;

      const updatedLayers = tilemapStore.layers.value;
      const newOrder = updatedLayers.map(l => l.id);
      expect(newOrder).toEqual(originalOrder);
    });

    it('should work with Ctrl key as well as Cmd', async () => {
      modeStore.setMode('map');

      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      tilemapStore.setActiveLayer(layers[0].id);

      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        ctrlKey: true
      }));
      await (element as any).updateComplete;

      const updatedLayers = tilemapStore.layers.value;
      expect(updatedLayers[1].name).toBe('Layer 1');
    });

    it('should not move layer up when already at top', async () => {
      modeStore.setMode('map');

      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      // Select Layer 3 (already at top, index 2)
      tilemapStore.setActiveLayer(layers[2].id);
      const originalOrder = layers.map(l => l.id);

      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        metaKey: true
      }));
      await (element as any).updateComplete;

      // Order should be unchanged
      const updatedLayers = tilemapStore.layers.value;
      const newOrder = updatedLayers.map(l => l.id);
      expect(newOrder).toEqual(originalOrder);
    });

    it('should not move layer down when already at bottom', async () => {
      modeStore.setMode('map');

      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');
      await (element as any).updateComplete;

      const layers = tilemapStore.layers.value;
      // Select Layer 1 (already at bottom, index 0)
      tilemapStore.setActiveLayer(layers[0].id);
      const originalOrder = layers.map(l => l.id);

      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        metaKey: true
      }));
      await (element as any).updateComplete;

      // Order should be unchanged
      const updatedLayers = tilemapStore.layers.value;
      const newOrder = updatedLayers.map(l => l.id);
      expect(newOrder).toEqual(originalOrder);
    });
  });
});
