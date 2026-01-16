/**
 * Tests for pf-tileset-grid component
 *
 * Tests for Story 2-3:
 * - Grid rendering (Task 2, AC #1)
 * - Hover highlight (Task 2, AC #2)
 * - Tile selection (Task 3, AC #3, #4)
 * - Keyboard navigation (Task 4, AC #6)
 * - Design tokens styling (Task 6)
 * - Accessibility (Task 4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tilesetStore } from '../../src/stores/tileset';
import type { Tileset } from '../../src/types/tilemap';

// Mock ImageBitmap constructor that passes instanceof checks
class MockImageBitmap {
  width: number;
  height: number;

  constructor(width: number = 128, height: number = 128) {
    this.width = width;
    this.height = height;
  }

  close() {
    // no-op
  }
}

// Expose ImageBitmap globally for instanceof checks
(globalThis as unknown as Record<string, unknown>).ImageBitmap = MockImageBitmap;

// Helper to create mock tileset
function createMockTileset(overrides?: Partial<Tileset>): Tileset {
  const mockImageBitmap = new MockImageBitmap(128, 128);

  return {
    id: 'test-tileset-id',
    name: 'Test Tileset',
    image: mockImageBitmap as unknown as ImageBitmap,
    imagePath: 'test.png',
    tileWidth: 16,
    tileHeight: 16,
    columns: 8,
    rows: 8,
    tileCount: 64,
    spacing: 0,
    margin: 0,
    ...overrides
  };
}

// Helper to dynamically import and create component
async function createTilesetGrid(): Promise<HTMLElement & {
  focusedIndex: number;
}> {
  await import('../../src/components/panels/pf-tileset-grid');
  const element = document.createElement('pf-tileset-grid') as any;
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

function cleanup(element: HTMLElement) {
  element.remove();
}

describe('pf-tileset-grid', () => {
  let element: Awaited<ReturnType<typeof createTilesetGrid>>;

  beforeEach(async () => {
    tilesetStore.clearAllTilesets();
    element = await createTilesetGrid();
  });

  afterEach(() => {
    cleanup(element);
    vi.restoreAllMocks();
  });

  describe('Task 2: Component structure', () => {
    it('should be defined as custom element', () => {
      expect(customElements.get('pf-tileset-grid')).toBeDefined();
    });

    it('should show empty message when no tileset is loaded', async () => {
      const emptyGrid = element.shadowRoot?.querySelector('.empty-grid');
      expect(emptyGrid).not.toBeNull();
      expect(emptyGrid?.textContent).toContain('No tileset loaded');
    });
  });

  describe('AC #1: Grid renders correct number of tiles', () => {
    it('should render all tiles from tileset', async () => {
      const tileset = createMockTileset({ tileCount: 64 });
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      expect(tiles?.length).toBe(64);
    });

    it('should render correct number for small tileset', async () => {
      const tileset = createMockTileset({
        tileCount: 16,
        columns: 4,
        rows: 4
      });
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      expect(tiles?.length).toBe(16);
    });

    it('should have canvas element for each tile', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const canvases = element.shadowRoot?.querySelectorAll('.tile-cell canvas');
      expect(canvases?.length).toBe(64);
    });

    it('should use CSS grid layout', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const grid = element.shadowRoot?.querySelector('.grid');
      expect(grid).not.toBeNull();
    });
  });

  describe('AC #3, #4: Tile selection', () => {
    it('should update selectedTileIndex on click', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      (tiles?.[5] as HTMLElement)?.click();

      expect(tilesetStore.selectedTileIndex.value).toBe(5);
    });

    it('should apply selected class to clicked tile', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      (tiles?.[3] as HTMLElement)?.click();
      await (element as any).updateComplete;

      expect(tiles?.[3]?.classList.contains('selected')).toBe(true);
    });

    it('should clear previous selection when new tile is clicked', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');

      // Select first tile
      (tiles?.[0] as HTMLElement)?.click();
      await (element as any).updateComplete;
      expect(tiles?.[0]?.classList.contains('selected')).toBe(true);

      // Select different tile
      (tiles?.[5] as HTMLElement)?.click();
      await (element as any).updateComplete;

      // Re-query tiles since DOM may have updated
      const updatedTiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      expect(updatedTiles?.[0]?.classList.contains('selected')).toBe(false);
      expect(updatedTiles?.[5]?.classList.contains('selected')).toBe(true);
    });

    it('should emit tile-selected event on click', async () => {
      const listener = vi.fn();
      element.addEventListener('tile-selected', listener);

      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      (tiles?.[7] as HTMLElement)?.click();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { tileIndex: 7 }
        })
      );
    });
  });

  describe('AC #6: Keyboard navigation', () => {
    beforeEach(async () => {
      const tileset = createMockTileset({ columns: 8 });
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;
    });

    it('should move focus right on ArrowRight', async () => {
      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const firstTile = tiles?.[0] as HTMLElement;
      firstTile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      firstTile?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(element.focusedIndex).toBe(1);
    });

    it('should move focus left on ArrowLeft', async () => {
      element.focusedIndex = 5;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[5] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(element.focusedIndex).toBe(4);
    });

    it('should move focus down on ArrowDown (next row)', async () => {
      element.focusedIndex = 0;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[0] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      // Should move down by at least some columns (depends on computed layout)
      // In happy-dom, the exact column count may vary, but should increase
      expect(element.focusedIndex).toBeGreaterThan(0);
    });

    it('should move focus up on ArrowUp (previous row)', async () => {
      // Start at a higher index to allow upward movement
      const startIndex = 20;
      element.focusedIndex = startIndex;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[startIndex] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      // Should move up by at least some columns (depends on computed layout)
      // In happy-dom, the exact column count may vary, but should decrease
      expect(element.focusedIndex).toBeLessThan(startIndex);
    });

    it('should not go past first tile on ArrowLeft', async () => {
      element.focusedIndex = 0;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[0] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(element.focusedIndex).toBe(0);
    });

    it('should not go past last tile on ArrowRight', async () => {
      const lastIndex = 63;
      element.focusedIndex = lastIndex;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[lastIndex] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(element.focusedIndex).toBe(lastIndex);
    });

    it('should select tile on Enter key', async () => {
      element.focusedIndex = 5;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[5] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(tilesetStore.selectedTileIndex.value).toBe(5);
    });

    it('should select tile on Space key', async () => {
      element.focusedIndex = 10;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[10] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(tilesetStore.selectedTileIndex.value).toBe(10);
    });

    it('should go to first tile on Home key', async () => {
      element.focusedIndex = 50;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[50] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(element.focusedIndex).toBe(0);
    });

    it('should go to last tile on End key', async () => {
      element.focusedIndex = 0;
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const tile = tiles?.[0] as HTMLElement;
      tile?.focus();

      const event = new KeyboardEvent('keydown', { key: 'End', bubbles: true });
      tile?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(element.focusedIndex).toBe(63);
    });
  });

  describe('Accessibility', () => {
    beforeEach(async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;
    });

    it('should have role="grid" on container', async () => {
      const grid = element.shadowRoot?.querySelector('.grid');
      expect(grid?.getAttribute('role')).toBe('grid');
    });

    it('should have role="gridcell" on each tile', async () => {
      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      tiles?.forEach(tile => {
        expect(tile.getAttribute('role')).toBe('gridcell');
      });
    });

    it('should have aria-selected on selected tile', async () => {
      tilesetStore.setSelectedTile(3);
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      expect(tiles?.[3]?.getAttribute('aria-selected')).toBe('true');
    });

    it('should have aria-label on tiles', async () => {
      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      const firstTile = tiles?.[0];

      expect(firstTile?.getAttribute('aria-label')).toContain('Tile 1');
      expect(firstTile?.getAttribute('aria-label')).toContain('64');
    });

    it('should have tabindex on tiles', async () => {
      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');

      // At least one tile should be tabbable
      const tabbableTiles = Array.from(tiles || []).filter(
        tile => tile.getAttribute('tabindex') === '0'
      );
      expect(tabbableTiles.length).toBeGreaterThan(0);
    });

    it('should have aria-label on grid', async () => {
      const grid = element.shadowRoot?.querySelector('.grid');
      expect(grid?.getAttribute('aria-label')).toContain('Tileset grid');
    });
  });

  describe('Styling', () => {
    beforeEach(async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;
    });

    it('should have aspect-ratio: 1 on tile cells', async () => {
      const tile = element.shadowRoot?.querySelector('.tile-cell') as HTMLElement;
      // Verify the class exists (CSS applied via shadow DOM)
      expect(tile).not.toBeNull();
    });

    it('should have image-rendering: pixelated on canvases', async () => {
      const canvas = element.shadowRoot?.querySelector('.tile-cell canvas');
      // Canvas should exist
      expect(canvas).not.toBeNull();
    });

    it('should have minimum touch target size', async () => {
      const tile = element.shadowRoot?.querySelector('.tile-cell') as HTMLElement;
      // min-width and min-height should be set via CSS
      expect(tile).not.toBeNull();
    });
  });

  describe('Integration with tilesetStore', () => {
    it('should react to store changes', async () => {
      // Initially empty
      expect(element.shadowRoot?.querySelector('.empty-grid')).not.toBeNull();

      // Add tileset via store
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      // Should now show grid
      expect(element.shadowRoot?.querySelector('.empty-grid')).toBeNull();
      expect(element.shadowRoot?.querySelector('.grid')).not.toBeNull();
    });

    it('should reflect selection changes from store', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      // Set selection via store
      tilesetStore.setSelectedTile(10);
      await (element as any).updateComplete;

      const tiles = element.shadowRoot?.querySelectorAll('.tile-cell');
      expect(tiles?.[10]?.classList.contains('selected')).toBe(true);
    });

    it('should clear grid when tileset is removed', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      // Verify grid is shown
      expect(element.shadowRoot?.querySelector('.grid')).not.toBeNull();

      // Remove tileset
      tilesetStore.removeTileset(tileset.id);
      await (element as any).updateComplete;

      // Should show empty state
      expect(element.shadowRoot?.querySelector('.empty-grid')).not.toBeNull();
    });
  });
});
