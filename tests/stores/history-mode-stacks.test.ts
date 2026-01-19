/**
 * Tests for Mode-Specific History Stacks
 *
 * Story 3-6: Tilemap Undo/Redo Integration
 * Task 3: Refactor historyStore for mode-specific stacks
 *
 * Tests AC #4 - Map mode operations go to Map-specific history stack
 * Tests AC #5 - Mode switch isolates undo operations to current mode
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { historyStore, type Command } from '../../src/stores/history';
import { modeStore } from '../../src/stores/mode';
import { tilemapStore } from '../../src/stores/tilemap';

// Mock paletteStore to avoid circular dependency issues in tests
vi.mock('../../src/stores/palette', () => ({
  paletteStore: {
    refreshUsedColors: vi.fn(),
  },
}));

// Simple test command for testing
class TestCommand implements Command {
  id: string;
  name: string;
  executed = false;
  undone = false;

  constructor(name: string) {
    this.id = crypto.randomUUID();
    this.name = name;
  }

  execute(): void {
    this.executed = true;
    this.undone = false;
  }

  undo(): void {
    this.undone = true;
    this.executed = false;
  }
}

describe('History Mode-Specific Stacks', () => {
  beforeEach(() => {
    // Reset all stores
    historyStore.clear();
    tilemapStore.reset();
    modeStore.setMode('art');
  });

  describe('artUndoStack and artRedoStack (Task 3.1)', () => {
    it('should have separate art undo stack', () => {
      expect(historyStore.artUndoStack).toBeDefined();
      expect(historyStore.artUndoStack.value).toEqual([]);
    });

    it('should have separate art redo stack', () => {
      expect(historyStore.artRedoStack).toBeDefined();
      expect(historyStore.artRedoStack.value).toEqual([]);
    });
  });

  describe('mapUndoStack and mapRedoStack (Task 3.2)', () => {
    it('should have separate map undo stack', () => {
      expect(historyStore.mapUndoStack).toBeDefined();
      expect(historyStore.mapUndoStack.value).toEqual([]);
    });

    it('should have separate map redo stack', () => {
      expect(historyStore.mapRedoStack).toBeDefined();
      expect(historyStore.mapRedoStack.value).toEqual([]);
    });
  });

  describe('execute() mode routing (Task 3.4)', () => {
    it('should push command to art stack when in art mode', async () => {
      modeStore.setMode('art');
      const cmd = new TestCommand('Art Command');

      await historyStore.execute(cmd);

      expect(historyStore.artUndoStack.value).toContain(cmd);
      expect(historyStore.mapUndoStack.value).not.toContain(cmd);
    });

    it('should push command to map stack when in map mode (AC: #4)', async () => {
      modeStore.setMode('map');
      const cmd = new TestCommand('Map Command');

      await historyStore.execute(cmd);

      expect(historyStore.mapUndoStack.value).toContain(cmd);
      expect(historyStore.artUndoStack.value).not.toContain(cmd);
    });
  });

  describe('undo() mode isolation (Task 3.5)', () => {
    it('should only undo from current mode stack', async () => {
      // Add command in art mode
      modeStore.setMode('art');
      const artCmd = new TestCommand('Art Command');
      await historyStore.execute(artCmd);

      // Switch to map mode
      modeStore.setMode('map');
      const mapCmd = new TestCommand('Map Command');
      await historyStore.execute(mapCmd);

      // Undo in map mode should only undo map command
      await historyStore.undo();

      expect(mapCmd.undone).toBe(true);
      expect(artCmd.undone).toBe(false);
      expect(historyStore.mapUndoStack.value).not.toContain(mapCmd);
      expect(historyStore.artUndoStack.value).toContain(artCmd);
    });

    it('should not undo art operations when in map mode (AC: #5)', async () => {
      // Add command in art mode
      modeStore.setMode('art');
      const artCmd = new TestCommand('Art Command');
      await historyStore.execute(artCmd);

      // Switch to map mode and try to undo
      modeStore.setMode('map');
      await historyStore.undo();

      // Art command should still be executed (not undone)
      expect(artCmd.undone).toBe(false);
      expect(historyStore.artUndoStack.value).toContain(artCmd);
    });
  });

  describe('redo() mode isolation (Task 3.6)', () => {
    it('should only redo from current mode stack', async () => {
      // Add and undo in art mode
      modeStore.setMode('art');
      const artCmd = new TestCommand('Art Command');
      await historyStore.execute(artCmd);
      await historyStore.undo();

      // Add and undo in map mode
      modeStore.setMode('map');
      const mapCmd = new TestCommand('Map Command');
      await historyStore.execute(mapCmd);
      await historyStore.undo();

      // Redo in map mode should only redo map command
      await historyStore.redo();

      expect(mapCmd.executed).toBe(true);
      expect(artCmd.executed).toBe(false);
    });
  });

  describe('canUndo/canRedo mode-awareness (Task 3.7)', () => {
    it('should reflect current mode stack for canUndo', async () => {
      // Add command in art mode
      modeStore.setMode('art');
      const artCmd = new TestCommand('Art Command');
      await historyStore.execute(artCmd);

      expect(historyStore.canUndo.get()).toBe(true);

      // Switch to map mode - should have nothing to undo
      modeStore.setMode('map');
      expect(historyStore.canUndo.get()).toBe(false);

      // Add map command
      const mapCmd = new TestCommand('Map Command');
      await historyStore.execute(mapCmd);
      expect(historyStore.canUndo.get()).toBe(true);
    });

    it('should reflect current mode stack for canRedo', async () => {
      // Add and undo in art mode
      modeStore.setMode('art');
      const artCmd = new TestCommand('Art Command');
      await historyStore.execute(artCmd);
      await historyStore.undo();

      expect(historyStore.canRedo.get()).toBe(true);

      // Switch to map mode - should have nothing to redo
      modeStore.setMode('map');
      expect(historyStore.canRedo.get()).toBe(false);

      // Add and undo map command
      const mapCmd = new TestCommand('Map Command');
      await historyStore.execute(mapCmd);
      await historyStore.undo();
      expect(historyStore.canRedo.get()).toBe(true);
    });
  });

  describe('backward compatibility (Task 3.8)', () => {
    it('should maintain undoStack as alias for artUndoStack', async () => {
      modeStore.setMode('art');
      const cmd = new TestCommand('Test');
      await historyStore.execute(cmd);

      // Both should reference same data
      expect(historyStore.undoStack.value).toEqual(historyStore.artUndoStack.value);
    });

    it('should maintain redoStack as alias for artRedoStack', async () => {
      modeStore.setMode('art');
      const cmd = new TestCommand('Test');
      await historyStore.execute(cmd);
      await historyStore.undo();

      // Both should reference same data
      expect(historyStore.redoStack.value).toEqual(historyStore.artRedoStack.value);
    });
  });

  describe('memory tracking across modes (Task 3.9)', () => {
    it('should track memory from both mode stacks', async () => {
      const initialMemory = historyStore.getMemoryUsage();

      // Add art mode command
      modeStore.setMode('art');
      const artCmd = new TestCommand('Art');
      artCmd.memorySize = 1000;
      await historyStore.execute(artCmd);

      // Add map mode command
      modeStore.setMode('map');
      const mapCmd = new TestCommand('Map');
      mapCmd.memorySize = 2000;
      await historyStore.execute(mapCmd);

      // Memory should include both
      expect(historyStore.getMemoryUsage()).toBeGreaterThanOrEqual(initialMemory + 3000);
    });
  });

  describe('multiple undo operations (AC: #3)', () => {
    it('should undo operations in reverse order within mode', async () => {
      modeStore.setMode('map');

      const cmd1 = new TestCommand('First');
      const cmd2 = new TestCommand('Second');
      const cmd3 = new TestCommand('Third');

      await historyStore.execute(cmd1);
      await historyStore.execute(cmd2);
      await historyStore.execute(cmd3);

      // Undo should go in reverse order
      await historyStore.undo();
      expect(cmd3.undone).toBe(true);
      expect(cmd2.undone).toBe(false);

      await historyStore.undo();
      expect(cmd2.undone).toBe(true);
      expect(cmd1.undone).toBe(false);

      await historyStore.undo();
      expect(cmd1.undone).toBe(true);
    });
  });

  describe('addWithoutExecuting (Story 3-6 fix)', () => {
    it('should add command to current mode stack without executing', () => {
      modeStore.setMode('map');
      historyStore.clear();

      const cmd = new TestCommand('Test');
      historyStore.addWithoutExecuting(cmd);

      // Should be in map stack
      expect(historyStore.mapUndoStack.value).toContain(cmd);
      // Should NOT have been executed (addWithoutExecuting doesn't call execute)
      expect(cmd.executed).toBe(false);
    });

    it('should route to art stack when in art mode', () => {
      modeStore.setMode('art');
      historyStore.clear();

      const cmd = new TestCommand('Test');
      historyStore.addWithoutExecuting(cmd);

      // Should be in art stack
      expect(historyStore.artUndoStack.value).toContain(cmd);
      expect(historyStore.mapUndoStack.value).not.toContain(cmd);
    });

    it('should clear redo stack when adding command', async () => {
      modeStore.setMode('map');
      historyStore.clear();

      // Add and undo a command to populate redo stack
      const cmd1 = new TestCommand('First');
      historyStore.addWithoutExecuting(cmd1);
      await historyStore.undo();
      expect(historyStore.mapRedoStack.value.length).toBe(1);

      // Add new command should clear redo stack
      const cmd2 = new TestCommand('Second');
      historyStore.addWithoutExecuting(cmd2);
      expect(historyStore.mapRedoStack.value.length).toBe(0);
    });
  });

  describe('integration: brush stroke → undo → canvas state restored (Task 6.10)', () => {
    it('should restore tilemap state after undoing TileBatchCommand', async () => {
      const { TileBatchCommand } = await import('../../src/commands/tile-batch-command');

      modeStore.setMode('map');
      tilemapStore.reset();
      const layer = tilemapStore.addLayer('Test Layer');
      const layerId = layer.id;
      historyStore.clear();

      // Set initial state - some tiles placed
      tilemapStore.setTile(layerId, 0, 0, 5);
      tilemapStore.setTile(layerId, 1, 0, 5);
      tilemapStore.setTile(layerId, 2, 0, 5);

      // Verify initial state
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(5);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(5);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(5);

      // Simulate brush stroke command that overwrites tiles
      const changes = [
        { x: 0, y: 0, previousTileId: 5, newTileId: 10 },
        { x: 1, y: 0, previousTileId: 5, newTileId: 10 },
        { x: 2, y: 0, previousTileId: 5, newTileId: 10 },
      ];
      const command = new TileBatchCommand(layerId, changes, 'Brush Stroke');

      // Execute command
      await historyStore.execute(command);

      // Verify tiles changed
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(10);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(10);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(10);

      // Undo
      await historyStore.undo();

      // Verify tiles restored to original state
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(5);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(5);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(5);
    });

    it('should restore tilemap state after undoing TilePlaceCommand', async () => {
      const { TilePlaceCommand } = await import('../../src/commands/tile-place-command');

      modeStore.setMode('map');
      tilemapStore.reset();
      const layer = tilemapStore.addLayer('Test Layer');
      const layerId = layer.id;
      historyStore.clear();

      // Verify tile is empty initially
      expect(tilemapStore.getTile(layerId, 5, 5)).toBe(0);

      // Create and execute single tile placement
      const command = new TilePlaceCommand(layerId, 5, 5, 0, 7);
      await historyStore.execute(command);

      // Verify tile placed
      expect(tilemapStore.getTile(layerId, 5, 5)).toBe(7);

      // Undo
      await historyStore.undo();

      // Verify tile restored to empty
      expect(tilemapStore.getTile(layerId, 5, 5)).toBe(0);
    });
  });
});
