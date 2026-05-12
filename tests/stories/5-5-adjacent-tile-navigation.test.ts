import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tilemapStore } from '../../src/stores/tilemap';
import { tilesetStore } from '../../src/stores/tileset';
import { modeStore } from '../../src/stores/mode';
import type { Tileset } from '../../src/types/tilemap';

/**
 * Story 5-5: Adjacent Tile Navigation Tests
 *
 * Tests for navigating to adjacent tiles without exiting edit mode:
 * - AC #1: Arrow indicators pointing to adjacent tiles
 * - AC #2: Click/key navigates, saves edits, transitions smoothly
 * - AC #3: Slide transition animation
 * - AC #4: Arrows only appear where tiles exist
 * - AC #5: Escape commits ALL edited tiles
 * - AC #6: Changes auto-saved on navigation
 */

/**
 * Helper to create a mock tileset for testing
 */
async function createMockTileset(tileCount: number = 4): Promise<Tileset> {
  // Create a simple 2x2 or larger tile arrangement
  const tileWidth = 16;
  const tileHeight = 16;
  const columns = Math.ceil(Math.sqrt(tileCount));
  const rows = Math.ceil(tileCount / columns);

  // Create a canvas with colored tiles for testing
  const canvas = new OffscreenCanvas(columns * tileWidth, rows * tileHeight);
  const ctx = canvas.getContext('2d')!;

  // Fill each tile with a different color for visual distinction
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#808080'];
  for (let i = 0; i < tileCount; i++) {
    const x = (i % columns) * tileWidth;
    const y = Math.floor(i / columns) * tileHeight;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, tileWidth, tileHeight);
  }

  const imageBitmap = await createImageBitmap(canvas);

  return {
    id: 'test-tileset',
    name: 'Test Tileset',
    image: imageBitmap,
    imagePath: '',
    tileWidth,
    tileHeight,
    columns,
    rows,
    tileCount,
    spacing: 0,
    margin: 0
  };
}

describe('Story 5-5: Adjacent Tile Navigation', () => {
  let mockTileset: Tileset;

  beforeEach(async () => {
    // Reset all stores
    tilemapStore.reset();
    tilesetStore.clearAllTilesets();
    modeStore.mode.value = 'map';

    // Create and add mock tileset
    mockTileset = await createMockTileset(4);
    tilesetStore.addTileset(mockTileset);
    tilesetStore.setActiveTileset(mockTileset.id);
    tilemapStore.setActiveTileset(mockTileset.id);

    // Initialize a layer and place some tiles
    tilemapStore.initializeDefaultLayer();
  });

  afterEach(() => {
    tilemapStore.reset();
    tilesetStore.clearAllTilesets();
    modeStore.mode.value = 'art';
  });

  describe('AC #1: Arrow indicators render when adjacent tiles exist (Task 8.1.1)', () => {
    describe('Task 1.3: hasAdjacentTile method', () => {
      it('should return false when not in hero edit mode', () => {
        expect(tilemapStore.hasAdjacentTile('up')).toBe(false);
        expect(tilemapStore.hasAdjacentTile('down')).toBe(false);
        expect(tilemapStore.hasAdjacentTile('left')).toBe(false);
        expect(tilemapStore.hasAdjacentTile('right')).toBe(false);
      });

      it('should return false during hero edit transition', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        // Place a tile to edit
        tilemapStore.setTile(layerId, 1, 1, 1);
        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 1, y: 1 });

        // During transition (zooming-in), should return false
        expect(tilemapStore.heroEditTransition.value).toBe('zooming-in');
        expect(tilemapStore.hasAdjacentTile('up')).toBe(false);
      });

      it('should detect adjacent tiles after entering hero edit (idle state)', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        // Create a 3x3 grid of tiles
        // [1][2][3]
        // [4][5][6]
        // [7][8][9]
        // Place center tile (5) to edit, with surrounding tiles
        tilemapStore.setTile(layerId, 1, 0, 1); // above
        tilemapStore.setTile(layerId, 0, 1, 2); // left
        tilemapStore.setTile(layerId, 1, 1, 3); // center (tile to edit)
        tilemapStore.setTile(layerId, 2, 1, 4); // right
        tilemapStore.setTile(layerId, 1, 2, 1); // below

        // Enter hero edit for center tile
        tilemapStore.enterHeroEdit(3, mockTileset.id, { x: 1, y: 1 });

        // Finish transition to idle
        tilemapStore.finishHeroEditTransition();

        // Should detect all adjacent tiles
        expect(tilemapStore.hasAdjacentTile('up')).toBe(true);
        expect(tilemapStore.hasAdjacentTile('down')).toBe(true);
        expect(tilemapStore.hasAdjacentTile('left')).toBe(true);
        expect(tilemapStore.hasAdjacentTile('right')).toBe(true);
      });
    });
  });

  describe('AC #4: Arrow indicators hidden at map edge or no adjacent tile (Task 8.1.2)', () => {
    it('should not show arrows for directions at map edge', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Place tile at top-left corner (0,0)
      tilemapStore.setTile(layerId, 0, 0, 1);

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();

      // At top-left corner, up and left should be false
      expect(tilemapStore.hasAdjacentTile('up')).toBe(false);
      expect(tilemapStore.hasAdjacentTile('left')).toBe(false);
    });

    it('should not show arrows where adjacent cell is empty (tile = 0)', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Place only the center tile, no surrounding tiles
      tilemapStore.setTile(layerId, 5, 5, 1);

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 5, y: 5 });
      tilemapStore.finishHeroEditTransition();

      // All directions should be false (no adjacent tiles placed)
      expect(tilemapStore.hasAdjacentTile('up')).toBe(false);
      expect(tilemapStore.hasAdjacentTile('down')).toBe(false);
      expect(tilemapStore.hasAdjacentTile('left')).toBe(false);
      expect(tilemapStore.hasAdjacentTile('right')).toBe(false);
    });

    it('should correctly detect partial adjacency', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Place tile at center with only right neighbor
      tilemapStore.setTile(layerId, 5, 5, 1); // center
      tilemapStore.setTile(layerId, 6, 5, 2); // right

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 5, y: 5 });
      tilemapStore.finishHeroEditTransition();

      // Only right should be true
      expect(tilemapStore.hasAdjacentTile('up')).toBe(false);
      expect(tilemapStore.hasAdjacentTile('down')).toBe(false);
      expect(tilemapStore.hasAdjacentTile('left')).toBe(false);
      expect(tilemapStore.hasAdjacentTile('right')).toBe(true);
    });
  });

  describe('AC #2: navigateToAdjacentTile updates heroEditState (Task 8.1.3)', () => {
    it('should update heroEditState with new tileId and position on navigation', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Place two tiles horizontally
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      // Enter hero edit for first tile
      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();

      // Navigate right to second tile
      const result = tilemapStore.navigateToAdjacentTile('right');

      expect(result).toBe(true);
      expect(tilemapStore.heroEditState.value.tileId).toBe(2);
      expect(tilemapStore.heroEditState.value.currentPosition).toEqual({ x: 1, y: 0 });
    });

    it('should return false when navigation is not possible', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Place single tile at corner
      tilemapStore.setTile(layerId, 0, 0, 1);

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();

      // Try to navigate left (out of bounds)
      const result = tilemapStore.navigateToAdjacentTile('left');

      expect(result).toBe(false);
      expect(tilemapStore.heroEditState.value.tileId).toBe(1);
    });

    it('should not navigate when transition is not idle', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Place tiles
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      // Enter hero edit but don't finish transition
      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      expect(tilemapStore.heroEditTransition.value).toBe('zooming-in');

      // Navigation should fail
      const result = tilemapStore.navigateToAdjacentTile('right');
      expect(result).toBe(false);
    });

    it('should not navigate when hero edit is not active', () => {
      const result = tilemapStore.navigateToAdjacentTile('right');
      expect(result).toBe(false);
    });
  });

  describe('AC #6: navigateToAdjacentTile saves current edits before navigation (Task 8.1.4)', () => {
    it('should save edits to session before navigation', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Place two tiles
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      // Enter hero edit
      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();

      // Verify session exists
      expect(tilemapStore.heroEditState.value.session).not.toBeNull();

      // Navigate to second tile
      tilemapStore.navigateToAdjacentTile('right');

      // Check that edits are tracked
      const session = tilemapStore.heroEditState.value.session;
      expect(session).not.toBeNull();
      // Session should track the first tile's data
      expect(session!.editedTilesAfter.has(1)).toBe(true);
    });
  });

  describe('AC #5: heroEditSession tracks multiple edited tiles (Task 8.2.1)', () => {
    it('should initialize session when entering hero edit', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      tilemapStore.setTile(layerId, 0, 0, 1);

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });

      const session = tilemapStore.heroEditState.value.session;
      expect(session).not.toBeNull();
      expect(session!.startTileId).toBe(1);
      expect(session!.startPosition).toEqual({ x: 0, y: 0 });
      expect(session!.editedTilesBefore).toBeInstanceOf(Map);
      expect(session!.editedTilesAfter).toBeInstanceOf(Map);
    });

    it('should track edits from multiple tiles during navigation', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Place 3 tiles in a row
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);
      tilemapStore.setTile(layerId, 2, 0, 3);

      // Enter hero edit at first tile
      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();

      // Navigate to second tile
      tilemapStore.navigateToAdjacentTile('right');

      // Navigate to third tile
      tilemapStore.navigateToAdjacentTile('right');

      // Check session has tracked both navigations
      const session = tilemapStore.heroEditState.value.session;
      expect(session).not.toBeNull();
      // First and second tiles should be in editedTilesAfter
      expect(session!.editedTilesAfter.has(1)).toBe(true);
      expect(session!.editedTilesAfter.has(2)).toBe(true);
    });
  });

  describe('AC #5: exitHeroEdit commits all edited tiles (Task 8.2.2)', () => {
    it('should commit all tiles from session on exit', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      const committedTiles: number[] = [];

      // Place tiles
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      // Listen for commit event
      tilemapStore.addEventListener('hero-edit-tiles-committed', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        committedTiles.push(...detail.tileIds);
      });

      // Enter hero edit and navigate
      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();
      tilemapStore.navigateToAdjacentTile('right');

      // Exit hero edit
      tilemapStore.exitHeroEdit(true);

      // Both tiles should have been committed
      expect(committedTiles).toContain(1);
      expect(committedTiles).toContain(2);
    });

    it('should not commit tiles when save=false', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      let committed = false;

      tilemapStore.setTile(layerId, 0, 0, 1);

      tilemapStore.addEventListener('hero-edit-tiles-committed', () => {
        committed = true;
      });

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();
      tilemapStore.exitHeroEdit(false);

      expect(committed).toBe(false);
    });
  });

  describe('AC #3: navigation direction signal updates correctly (Task 8.2.3)', () => {
    it('should set navigation direction on navigateToAdjacentTile', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();

      expect(tilemapStore.heroEditNavigationDirection.value).toBe(null);

      tilemapStore.navigateToAdjacentTile('right');

      expect(tilemapStore.heroEditNavigationDirection.value).toBe('right');
    });

    it('should clear navigation direction on finishHeroEditNavigation', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();
      tilemapStore.navigateToAdjacentTile('right');

      expect(tilemapStore.heroEditNavigationDirection.value).toBe('right');

      tilemapStore.finishHeroEditNavigation();

      expect(tilemapStore.heroEditNavigationDirection.value).toBe(null);
    });

    it('should clear navigation direction on exitHeroEdit', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();
      tilemapStore.navigateToAdjacentTile('right');

      tilemapStore.exitHeroEdit();

      expect(tilemapStore.heroEditNavigationDirection.value).toBe(null);
    });
  });

  describe('Keyboard Navigation (Task 8.3)', () => {
    describe('Task 8.3.1: Arrow keys trigger navigation during hero edit', () => {
      it('should have correct state for keyboard navigation', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        tilemapStore.setTile(layerId, 5, 5, 1);
        tilemapStore.setTile(layerId, 6, 5, 2);

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 5, y: 5 });
        tilemapStore.finishHeroEditTransition();

        // Verify state is correct for keyboard handling
        expect(tilemapStore.heroEditActive).toBe(true);
        expect(tilemapStore.heroEditTransition.value).toBe('idle');
        expect(tilemapStore.hasAdjacentTile('right')).toBe(true);
      });
    });

    describe('Task 8.3.2: Arrow keys blocked during transition (not idle)', () => {
      it('should block navigation during transition', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        tilemapStore.setTile(layerId, 0, 0, 1);
        tilemapStore.setTile(layerId, 1, 0, 2);

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });

        // Still in zooming-in state
        expect(tilemapStore.heroEditTransition.value).toBe('zooming-in');

        // Navigation should fail
        const result = tilemapStore.navigateToAdjacentTile('right');
        expect(result).toBe(false);
      });
    });

    describe('Task 8.3.3: Navigation debounce prevents rapid navigation', () => {
      it('should support consecutive navigations (debounce is in keyboard handler)', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        // Place 4 tiles in a row
        tilemapStore.setTile(layerId, 0, 0, 1);
        tilemapStore.setTile(layerId, 1, 0, 2);
        tilemapStore.setTile(layerId, 2, 0, 3);
        tilemapStore.setTile(layerId, 3, 0, 4);

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
        tilemapStore.finishHeroEditTransition();

        // Store method allows consecutive calls (debounce is in keyboard handler)
        expect(tilemapStore.navigateToAdjacentTile('right')).toBe(true);
        expect(tilemapStore.heroEditState.value.currentPosition).toEqual({ x: 1, y: 0 });

        expect(tilemapStore.navigateToAdjacentTile('right')).toBe(true);
        expect(tilemapStore.heroEditState.value.currentPosition).toEqual({ x: 2, y: 0 });

        expect(tilemapStore.navigateToAdjacentTile('right')).toBe(true);
        expect(tilemapStore.heroEditState.value.currentPosition).toEqual({ x: 3, y: 0 });
      });
    });
  });

  describe('Edge Cases (Task 8.4)', () => {
    describe('Task 8.4.1: Navigation to empty cell prevented', () => {
      it('should not navigate to cell with tile ID 0', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        // Place only one tile, adjacent cell is empty (0)
        tilemapStore.setTile(layerId, 5, 5, 1);
        // Cell at (6, 5) is empty by default (0)

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 5, y: 5 });
        tilemapStore.finishHeroEditTransition();

        // Should not navigate to empty cell
        const result = tilemapStore.navigateToAdjacentTile('right');
        expect(result).toBe(false);
        expect(tilemapStore.heroEditState.value.currentPosition).toEqual({ x: 5, y: 5 });
      });
    });

    describe('Task 8.4.2: Navigation at map bounds prevented', () => {
      it('should not navigate past left boundary', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        tilemapStore.setTile(layerId, 0, 5, 1);

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 5 });
        tilemapStore.finishHeroEditTransition();

        expect(tilemapStore.navigateToAdjacentTile('left')).toBe(false);
      });

      it('should not navigate past top boundary', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        tilemapStore.setTile(layerId, 5, 0, 1);

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 5, y: 0 });
        tilemapStore.finishHeroEditTransition();

        expect(tilemapStore.navigateToAdjacentTile('up')).toBe(false);
      });

      it('should not navigate past right boundary', () => {
        const layerId = tilemapStore.activeLayerId.value!;
        const maxX = tilemapStore.width.value - 1;

        tilemapStore.setTile(layerId, maxX, 5, 1);

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: maxX, y: 5 });
        tilemapStore.finishHeroEditTransition();

        expect(tilemapStore.navigateToAdjacentTile('right')).toBe(false);
      });

      it('should not navigate past bottom boundary', () => {
        const layerId = tilemapStore.activeLayerId.value!;
        const maxY = tilemapStore.height.value - 1;

        tilemapStore.setTile(layerId, 5, maxY, 1);

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 5, y: maxY });
        tilemapStore.finishHeroEditTransition();

        expect(tilemapStore.navigateToAdjacentTile('down')).toBe(false);
      });
    });

    describe('Task 8.4.3: All edited tiles committed on Escape (via exitHeroEdit)', () => {
      it('should commit tiles from entire session on exit', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        // Create a 2x2 grid of tiles
        tilemapStore.setTile(layerId, 0, 0, 1);
        tilemapStore.setTile(layerId, 1, 0, 2);
        tilemapStore.setTile(layerId, 0, 1, 3);
        tilemapStore.setTile(layerId, 1, 1, 4);

        let commitEvent: CustomEvent | null = null;
        tilemapStore.addEventListener('hero-edit-tiles-committed', (e) => {
          commitEvent = e as CustomEvent;
        });

        // Navigate around and edit multiple tiles
        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
        tilemapStore.finishHeroEditTransition();

        tilemapStore.navigateToAdjacentTile('right'); // tile 2
        tilemapStore.navigateToAdjacentTile('down'); // tile 4
        tilemapStore.navigateToAdjacentTile('left'); // tile 3

        // Exit (like pressing Escape)
        tilemapStore.exitHeroEdit(true);

        // Verify all tiles committed
        expect(commitEvent).not.toBeNull();
        const tileIds = commitEvent!.detail.tileIds;
        expect(tileIds).toContain(1);
        expect(tileIds).toContain(2);
        expect(tileIds).toContain(4);
        expect(tileIds).toContain(3);
      });

      it('should clear session after exit', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        tilemapStore.setTile(layerId, 0, 0, 1);
        tilemapStore.setTile(layerId, 1, 0, 2);

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
        tilemapStore.finishHeroEditTransition();
        tilemapStore.navigateToAdjacentTile('right');
        tilemapStore.exitHeroEdit(true);

        // Session should be cleared
        expect(tilemapStore.heroEditState.value.session).toBeNull();
      });
    });

    describe('Task 7.3: Navigation to different tile ID vs same tile ID', () => {
      it('should navigate to different instances of same tile', () => {
        const layerId = tilemapStore.activeLayerId.value!;

        // Place same tile ID (1) in adjacent cells
        tilemapStore.setTile(layerId, 0, 0, 1);
        tilemapStore.setTile(layerId, 1, 0, 1); // Same tile ID, different position

        tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
        tilemapStore.finishHeroEditTransition();

        // Should still navigate (same tile ID is valid navigation target)
        const result = tilemapStore.navigateToAdjacentTile('right');
        expect(result).toBe(true);
        expect(tilemapStore.heroEditState.value.currentPosition).toEqual({ x: 1, y: 0 });
      });
    });
  });

  describe('Events', () => {
    it('should fire hero-edit-navigation-started event', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      let eventDetail: any = null;

      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      tilemapStore.addEventListener('hero-edit-navigation-started', (e: Event) => {
        eventDetail = (e as CustomEvent).detail;
      });

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();
      tilemapStore.navigateToAdjacentTile('right');

      expect(eventDetail).not.toBeNull();
      expect(eventDetail.direction).toBe('right');
      expect(eventDetail.fromPosition).toEqual({ x: 0, y: 0 });
      expect(eventDetail.toPosition).toEqual({ x: 1, y: 0 });
      expect(eventDetail.fromTileId).toBe(1);
      expect(eventDetail.toTileId).toBe(2);
    });

    it('should fire hero-edit-tile-switched event', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      let eventDetail: any = null;

      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      tilemapStore.addEventListener('hero-edit-tile-switched', (e: Event) => {
        eventDetail = (e as CustomEvent).detail;
      });

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();
      tilemapStore.navigateToAdjacentTile('right');

      expect(eventDetail).not.toBeNull();
      expect(eventDetail.tileId).toBe(2);
      expect(eventDetail.position).toEqual({ x: 1, y: 0 });
    });

    it('should fire hero-edit-navigation-ended event', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      let eventDetail: any = null;

      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      tilemapStore.addEventListener('hero-edit-navigation-ended', (e: Event) => {
        eventDetail = (e as CustomEvent).detail;
      });

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();
      tilemapStore.navigateToAdjacentTile('right');
      tilemapStore.finishHeroEditNavigation();

      expect(eventDetail).not.toBeNull();
      expect(eventDetail.tileId).toBe(2);
      expect(eventDetail.position).toEqual({ x: 1, y: 0 });
    });
  });

  describe('HeroEditState type updates', () => {
    it('should have session field in HeroEditState', () => {
      const state = tilemapStore.heroEditState.value;
      expect('session' in state).toBe(true);
    });

    it('should have currentPosition field in HeroEditState', () => {
      const state = tilemapStore.heroEditState.value;
      expect('currentPosition' in state).toBe(true);
    });
  });

  describe('Store reset', () => {
    it('should clear navigation direction on reset', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);

      tilemapStore.enterHeroEdit(1, mockTileset.id, { x: 0, y: 0 });
      tilemapStore.finishHeroEditTransition();
      tilemapStore.navigateToAdjacentTile('right');

      tilemapStore.reset();

      expect(tilemapStore.heroEditNavigationDirection.value).toBe(null);
      expect(tilemapStore.heroEditActive).toBe(false);
    });
  });
});
