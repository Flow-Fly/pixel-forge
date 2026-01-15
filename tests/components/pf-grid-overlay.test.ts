import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tilemapStore } from '../../src/stores/tilemap';

/**
 * Grid Overlay Component Tests
 *
 * Tests for Story 1-4:
 * - Component renders canvas element (Task 6.2)
 * - Grid visibility toggles correctly (Task 6.3)
 * - G key triggers toggle (Task 6.4)
 * - Overlay dimensions match tilemap dimensions (Task 6.5)
 */

// Helper function to create and mount the component
async function createGridOverlay(): Promise<HTMLElement> {
  // Dynamically import the component to ensure it's registered
  await import('../../src/components/canvas/pf-grid-overlay');

  const element = document.createElement('pf-grid-overlay');
  document.body.appendChild(element);

  // Wait for Lit to complete rendering
  await (element as any).updateComplete;

  return element;
}

// Helper to clean up DOM after tests
function cleanup(element: HTMLElement) {
  element.remove();
}

describe('PfGridOverlay', () => {
  let element: HTMLElement;

  beforeEach(async () => {
    // Reset store state before each test
    tilemapStore.resizeTilemap(20, 15);
    tilemapStore.setTileSize(16, 16);
    tilemapStore.setGridVisible(true);

    element = await createGridOverlay();
  });

  afterEach(() => {
    cleanup(element);
    vi.restoreAllMocks();
  });

  describe('Component Rendering (Task 6.2)', () => {
    it('should render a canvas element', () => {
      const canvas = element.shadowRoot?.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });

    it('should have pointer-events set to none for click-through', () => {
      const hostStyles = getComputedStyle(element);
      expect(hostStyles.pointerEvents).toBe('none');
    });
  });

  describe('Canvas Dimensions (Task 6.5)', () => {
    it('should set canvas dimensions to match tilemap pixel dimensions', async () => {
      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(tilemapStore.pixelWidth); // 20 * 16 = 320
      expect(canvas.height).toBe(tilemapStore.pixelHeight); // 15 * 16 = 240
    });

    it('should update canvas dimensions when tilemap dimensions change', async () => {
      tilemapStore.resizeTilemap(10, 10);
      await (element as any).updateComplete;

      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(160); // 10 * 16
      expect(canvas.height).toBe(160); // 10 * 16
    });

    it('should update canvas dimensions when tile size changes', async () => {
      tilemapStore.setTileSize(32, 32);
      await (element as any).updateComplete;

      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(640); // 20 * 32
      expect(canvas.height).toBe(480); // 15 * 32
    });
  });

  describe('Grid Visibility Toggle (Task 6.3)', () => {
    it('should respond to gridVisible signal changes', async () => {
      // Component is rendered, so grid should be visible
      expect(tilemapStore.gridVisible.value).toBe(true);

      // Toggle off
      tilemapStore.toggleGrid();
      expect(tilemapStore.gridVisible.value).toBe(false);

      // Toggle back on
      tilemapStore.toggleGrid();
      expect(tilemapStore.gridVisible.value).toBe(true);
    });
  });

  describe('Keyboard Shortcut (Task 6.4)', () => {
    it('should toggle grid when G key is pressed', async () => {
      const initialState = tilemapStore.gridVisible.value;

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', bubbles: true }));

      expect(tilemapStore.gridVisible.value).toBe(!initialState);
    });

    it('should toggle grid when lowercase g key is pressed', async () => {
      tilemapStore.setGridVisible(true);
      const initialState = tilemapStore.gridVisible.value;

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));

      expect(tilemapStore.gridVisible.value).toBe(!initialState);
    });

    it('should NOT toggle grid when G is pressed while input is focused', async () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const initialState = tilemapStore.gridVisible.value;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', bubbles: true }));

      expect(tilemapStore.gridVisible.value).toBe(initialState);

      document.body.removeChild(input);
    });

    it('should NOT toggle grid when G is pressed while textarea is focused', async () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const initialState = tilemapStore.gridVisible.value;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', bubbles: true }));

      expect(tilemapStore.gridVisible.value).toBe(initialState);

      document.body.removeChild(textarea);
    });

    it('should NOT toggle grid when G is pressed while contentEditable is focused', async () => {
      const editableDiv = document.createElement('div');
      editableDiv.contentEditable = 'true';
      document.body.appendChild(editableDiv);
      editableDiv.focus();

      const initialState = tilemapStore.gridVisible.value;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', bubbles: true }));

      expect(tilemapStore.gridVisible.value).toBe(initialState);

      document.body.removeChild(editableDiv);
    });
  });

  describe('Cleanup', () => {
    it('should remove event listener on disconnect', async () => {
      const spy = vi.spyOn(window, 'removeEventListener');
      element.remove();

      // Verify removeEventListener was called for keydown (cleanup)
      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });
  });
});
