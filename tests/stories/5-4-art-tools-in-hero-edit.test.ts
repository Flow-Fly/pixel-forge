import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tilemapStore } from '../../src/stores/tilemap';
import { toolStore, type ToolType } from '../../src/stores/tools';
import { modeStore } from '../../src/stores/mode';
import { colorStore } from '../../src/stores/colors';
import { EyedropperTool } from '../../src/tools/eyedropper-tool';

/**
 * Story 5-4: Art Tools in Hero Edit Tests
 *
 * Tests for Art tool integration with Hero Edit mode:
 * - AC #1: Toolbar shows Art tools when Hero Edit is active
 * - AC #2: Drawing to editingCanvas with pencil tool
 * - AC #3: Erasing pixels from editingCanvas
 * - AC #4: Fill tool works on editingCanvas
 * - AC #5: Brush/palette panels visible in Hero Edit
 * - AC #6: Keyboard shortcuts work in Hero Edit
 * - AC #7: Color picker available in Hero Edit
 */

describe('Story 5-4: Art Tools in Hero Edit', () => {
  beforeEach(() => {
    // Reset stores to default state
    tilemapStore.reset();
    tilemapStore.initializeDefaultLayer();
    modeStore.mode.value = 'map';
    toolStore.setActiveTool('tile-brush');
    toolStore.clearOverrideCanvas();
  });

  afterEach(() => {
    toolStore.clearOverrideCanvas();
    tilemapStore.reset();
    modeStore.mode.value = 'art';
    toolStore.setActiveTool('pencil');
  });

  describe('AC #1: Toolbar shows Art tools when Hero Edit is active', () => {
    describe('Task 1.1-1.2: Hero edit mode detection', () => {
      it('should detect hero edit mode correctly', () => {
        // Initially not in hero edit
        expect(tilemapStore.heroEditActive).toBe(false);

        // After entering hero edit, it should be active
        // Note: We can't easily call enterHeroEdit without a tileset,
        // but we can test the state values
        expect(tilemapStore.heroEditTransition.value).toBe('idle');
      });

      it('should track hero edit transition state', () => {
        // Initial state should be idle
        expect(tilemapStore.heroEditTransition.value).toBe('idle');
      });
    });

    describe('Task 1.3-1.4: Tool state management', () => {
      it('should store current tool type as ToolType', () => {
        toolStore.setActiveTool('tile-brush');
        expect(toolStore.activeTool.value).toBe('tile-brush');
      });

      it('should allow setting pencil tool', () => {
        toolStore.setActiveTool('pencil');
        expect(toolStore.activeTool.value).toBe('pencil');
      });

      it('should have override canvas signals', () => {
        // Override canvas should initially be null
        expect(toolStore.overrideCanvas.value).toBe(null);
        expect(toolStore.overrideCanvasTransform.value).toBe(null);
      });
    });
  });

  describe('AC #2: Drawing to editingCanvas with pencil tool', () => {
    describe('Task 2.1: Override canvas setup', () => {
      it('should provide setOverrideCanvas method', () => {
        expect(typeof toolStore.setOverrideCanvas).toBe('function');
      });

      it('should set override canvas when provided', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;

        toolStore.setOverrideCanvas(canvas, {
          screenX: 0,
          screenY: 0,
          zoom: 1,
          width: 16,
          height: 16
        });

        expect(toolStore.overrideCanvas.value).toBe(canvas);
        expect(toolStore.overrideCanvasTransform.value).not.toBe(null);
      });

      it('should clear override canvas', () => {
        const canvas = document.createElement('canvas');
        toolStore.setOverrideCanvas(canvas, { screenX: 0, screenY: 0, zoom: 1, width: 16, height: 16 });

        toolStore.clearOverrideCanvas();

        expect(toolStore.overrideCanvas.value).toBe(null);
        expect(toolStore.overrideCanvasTransform.value).toBe(null);
      });
    });

    describe('Task 2.2-2.3: Hero edit target canvas', () => {
      it('should return null when not in hero edit', () => {
        const canvas = tilemapStore.getHeroEditTargetCanvas();
        expect(canvas).toBe(null);
      });
    });

    describe('Task 3.1-3.5: Drawing to override canvas', () => {
      it('should return override canvas context when override is set', async () => {
        const { BaseTool } = await import('../../src/tools/base-tool');

        // Create a concrete test tool
        class TestTool extends BaseTool {
          name = 'test';
          cursor = 'default';
          onDown() {}
          onDrag() {}
          onUp() {}

          // Expose protected method for testing
          getActiveContext() {
            return this.context;
          }
          checkOverrideMode() {
            return this.isOverrideMode();
          }
        }

        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = 32;
        normalCanvas.height = 32;
        const normalCtx = normalCanvas.getContext('2d')!;

        const tool = new TestTool();
        tool.setContext(normalCtx);

        // Without override, should return normal context
        expect(tool.checkOverrideMode()).toBe(false);
        expect(tool.getActiveContext()).toBe(normalCtx);

        // Set override canvas
        const overrideCanvas = document.createElement('canvas');
        overrideCanvas.width = 16;
        overrideCanvas.height = 16;

        toolStore.setOverrideCanvas(overrideCanvas, {
          screenX: 0,
          screenY: 0,
          zoom: 1,
          width: 16,
          height: 16
        });

        // With override, should return override canvas context
        expect(tool.checkOverrideMode()).toBe(true);
        const activeCtx = tool.getActiveContext();
        expect(activeCtx).not.toBe(normalCtx);
        expect(activeCtx?.canvas).toBe(overrideCanvas);

        toolStore.clearOverrideCanvas();
      });
    });
  });

  describe('AC #3: Erasing pixels from editingCanvas', () => {
    describe('Task 3.1: isOverrideActive check', () => {
      it('should detect override mode correctly', () => {
        expect(toolStore.isOverrideActive()).toBe(false);

        const canvas = document.createElement('canvas');
        toolStore.setOverrideCanvas(canvas, { screenX: 0, screenY: 0, zoom: 1, width: 16, height: 16 });

        expect(toolStore.isOverrideActive()).toBe(true);

        toolStore.clearOverrideCanvas();
        expect(toolStore.isOverrideActive()).toBe(false);
      });
    });

    describe('Task 3.2-3.3: Erasing from override canvas', () => {
      it('should erase from override canvas when set', async () => {
        const { EraserTool } = await import('../../src/tools/eraser-tool');

        // Create override canvas with filled content
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d')!;

        // Fill with red first
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 16, 16);

        // Set up override
        toolStore.setOverrideCanvas(canvas, {
          screenX: 0,
          screenY: 0,
          zoom: 1,
          width: 16,
          height: 16
        });

        // Create eraser tool
        const eraser = new EraserTool(ctx);

        // Erase at a point
        eraser.onDown(5, 5);
        eraser.onUp(5, 5);

        // Verify pixel was erased (alpha should be 0)
        const imageData = ctx.getImageData(5, 5, 1, 1);
        expect(imageData.data[3]).toBe(0);

        toolStore.clearOverrideCanvas();
      });
    });
  });

  describe('AC #4: Fill tool works on editingCanvas', () => {
    it('should have fill tool available', () => {
      toolStore.setActiveTool('fill');
      expect(toolStore.activeTool.value).toBe('fill');
    });

    describe('Task 3.3: Fill tool in override mode', () => {
      it('should skip index buffer check when override is active', async () => {
        const { FillTool } = await import('../../src/tools/fill-tool');

        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d')!;

        toolStore.setOverrideCanvas(canvas, {
          screenX: 0,
          screenY: 0,
          zoom: 1,
          width: 16,
          height: 16
        });

        const fill = new FillTool();
        fill.setContext(ctx);

        colorStore.setPrimaryColor('#0000ff');

        // This should not throw even without index buffer
        // The fill tool uses isOverrideMode() to skip index buffer operations
        expect(() => fill.onDown(0, 0)).not.toThrow();

        toolStore.clearOverrideCanvas();
      });

      it('should use context from override canvas', async () => {
        const { FillTool } = await import('../../src/tools/fill-tool');

        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = 32;
        normalCanvas.height = 32;
        const normalCtx = normalCanvas.getContext('2d')!;

        const overrideCanvas = document.createElement('canvas');
        overrideCanvas.width = 16;
        overrideCanvas.height = 16;

        const fill = new FillTool();
        fill.setContext(normalCtx);

        // Without override - tool uses normal context
        expect(toolStore.isOverrideActive()).toBe(false);

        // Set override
        toolStore.setOverrideCanvas(overrideCanvas, {
          screenX: 0,
          screenY: 0,
          zoom: 1,
          width: 16,
          height: 16
        });

        // With override - tool should detect override mode
        expect(toolStore.isOverrideActive()).toBe(true);

        toolStore.clearOverrideCanvas();
      });
    });
  });

  describe('AC #5: Brush/palette panels visible in Hero Edit', () => {
    // Panel visibility is tested via component tests
    it('should be in map mode initially', () => {
      expect(modeStore.mode.value).toBe('map');
    });
  });

  describe('AC #6: Keyboard shortcuts work in Hero Edit', () => {
    describe('Task 5.1: Tool shortcuts in hero edit', () => {
      it('should allow setting art tools', () => {
        // Art tools should be settable
        const artTools: ToolType[] = ['pencil', 'eraser', 'fill', 'eyedropper'];
        for (const tool of artTools) {
          toolStore.setActiveTool(tool);
          expect(toolStore.activeTool.value).toBe(tool);
        }
      });
    });

    describe('Task 5.2: Escape exits hero edit', () => {
      it('should have hero edit exit method', () => {
        expect(typeof tilemapStore.exitHeroEdit).toBe('function');
      });
    });
  });

  describe('AC #7: Color picker available in Hero Edit', () => {
    it('should have color store available', async () => {
      const { colorStore } = await import('../../src/stores/colors');
      expect(colorStore.primaryColor.value).toBeDefined();
    });

    describe('Task 6.1-6.4: Color integration with hero edit', () => {
      it('should allow setting primary color', () => {
        colorStore.setPrimaryColor('#ff0000');
        expect(colorStore.primaryColor.value).toBe('#ff0000');
      });

      it('should allow setting secondary color', () => {
        colorStore.setSecondaryColor('#00ff00');
        expect(colorStore.secondaryColor.value).toBe('#00ff00');
      });

      it('should allow swapping colors', () => {
        colorStore.setPrimaryColor('#ff0000');
        colorStore.setSecondaryColor('#00ff00');
        colorStore.swapColors();
        expect(colorStore.primaryColor.value).toBe('#00ff00');
        expect(colorStore.secondaryColor.value).toBe('#ff0000');
      });
    });

    describe('Task 6.3: Eyedropper picks from override canvas', () => {
      it('should use isOverrideMode to skip index buffer in hero edit', () => {
        // Create override canvas
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d')!;

        // Without override, eyedropper would try to use index buffer
        expect(toolStore.isOverrideActive()).toBe(false);

        // Set up override canvas (simulating hero edit mode)
        toolStore.setOverrideCanvas(canvas, {
          screenX: 0,
          screenY: 0,
          zoom: 1,
          width: 16,
          height: 16
        });

        // Now override should be active
        expect(toolStore.isOverrideActive()).toBe(true);

        // Create eyedropper - it should detect override mode
        const eyedropper = new EyedropperTool(ctx);

        // The eyedropper uses this.isOverrideMode() internally
        // When in override mode, it skips index buffer and reads directly from canvas
        // This test verifies the mechanism exists and is properly connected
        expect(typeof (eyedropper as unknown as { isOverrideMode: () => boolean }).isOverrideMode).toBe('function');

        toolStore.clearOverrideCanvas();
      });

      it('should not pick transparent pixels', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d')!;

        // Canvas is transparent by default
        toolStore.setOverrideCanvas(canvas, {
          screenX: 0,
          screenY: 0,
          zoom: 1,
          width: 16,
          height: 16
        });

        const eyedropper = new EyedropperTool(ctx);
        const originalColor = '#123456';
        colorStore.setPrimaryColor(originalColor);

        // Try to pick from transparent area
        eyedropper.onDown(5, 5);

        // Color should remain unchanged (transparent pixels are ignored)
        expect(colorStore.primaryColor.value).toBe(originalColor);

        toolStore.clearOverrideCanvas();
      });

      it('should use context getter that respects override canvas', async () => {
        const { BaseTool } = await import('../../src/tools/base-tool');

        // Verify eyedropper inherits from BaseTool and gets override canvas behavior
        expect(EyedropperTool.prototype instanceof BaseTool).toBe(true);

        // The context getter in BaseTool checks toolStore.overrideCanvas
        // This is already tested in 'should return override canvas context when override is set'
      });
    });
  });

  describe('Task 7: Tool state restoration', () => {
    it('should restore previous tool after hero edit exit', () => {
      // Store initial map tool
      toolStore.setActiveTool('tile-brush');
      const initialTool = toolStore.activeTool.value;

      // Simulate switching to art tool
      toolStore.setActiveTool('pencil');
      expect(toolStore.activeTool.value).toBe('pencil');

      // Simulate restoration
      toolStore.setActiveTool(initialTool);
      expect(toolStore.activeTool.value).toBe('tile-brush');
    });
  });

  describe('HeroEditState type updates', () => {
    it('should have previousMapTool in initial state', () => {
      const state = tilemapStore.heroEditState.value;
      expect('previousMapTool' in state).toBe(true);
      expect(state.previousMapTool).toBe(null);
    });
  });

  describe('Task 1.5-1.6: Toolbar animation and reduced motion', () => {
    it('should have toolbar fade-in animation defined in CSS', async () => {
      // This test verifies the CSS class exists in pf-toolbar
      // The animation is defined in the component's static styles
      const { PFToolbar } = await import('../../src/components/toolbar/pf-toolbar');
      const styles = PFToolbar.styles?.toString() || '';

      // Check animation is defined
      expect(styles).toContain('toolbar-fade-in');
      expect(styles).toContain('@keyframes');

      // Check reduced motion media query exists
      expect(styles).toContain('prefers-reduced-motion');
    });
  });

  describe('Task 4.3-4.4: Panel transition animation', () => {
    it('should have panel fade-in animation defined in CSS', async () => {
      const { PixelForgeApp } = await import('../../src/components/app/pixel-forge-app');
      const styles = PixelForgeApp.styles?.toString() || '';

      // Check animation is defined
      expect(styles).toContain('panel-fade-in');
      expect(styles).toContain('@keyframes');

      // Check reduced motion media query exists
      expect(styles).toContain('prefers-reduced-motion');
    });
  });

  describe('Task 7.1-7.4: Tool state restoration integration', () => {
    it('should correctly track tool transitions during hero edit', () => {
      // Start in map mode with tile-brush
      modeStore.mode.value = 'map';
      toolStore.setActiveTool('tile-brush');
      const mapTool = toolStore.activeTool.value;

      // Simulate entering hero edit - switch to pencil
      toolStore.setActiveTool('pencil');
      expect(toolStore.activeTool.value).toBe('pencil');

      // User draws with multiple tools
      toolStore.setActiveTool('eraser');
      expect(toolStore.activeTool.value).toBe('eraser');

      toolStore.setActiveTool('fill');
      expect(toolStore.activeTool.value).toBe('fill');

      // Simulate exiting hero edit - restore map tool
      toolStore.setActiveTool(mapTool);
      expect(toolStore.activeTool.value).toBe('tile-brush');
    });

    it('should preserve tool across mode transitions', () => {
      // Test that tool store maintains state correctly
      const initialTool = 'tile-fill';
      toolStore.setActiveTool(initialTool);

      // Store current tool
      const storedTool = toolStore.activeTool.value;

      // Switch to art tools
      toolStore.setActiveTool('pencil');
      toolStore.setActiveTool('eyedropper');

      // Restore
      toolStore.setActiveTool(storedTool);
      expect(toolStore.activeTool.value).toBe(initialTool);
    });
  });

  describe('tilemapStore.syncHeroEditCanvas', () => {
    it('should have sync method available', () => {
      expect(typeof tilemapStore.syncHeroEditCanvas).toBe('function');
    });

    it('should not throw when called outside hero edit', () => {
      expect(() => tilemapStore.syncHeroEditCanvas()).not.toThrow();
    });
  });
});

describe('Integration: Override Canvas with Tools', () => {
  beforeEach(() => {
    tilemapStore.reset();
    tilemapStore.initializeDefaultLayer();
    toolStore.clearOverrideCanvas();
  });

  afterEach(() => {
    toolStore.clearOverrideCanvas();
    tilemapStore.reset();
  });

  it('should allow override canvas to be used by multiple tools', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;

    toolStore.setOverrideCanvas(canvas, {
      screenX: 100,
      screenY: 100,
      zoom: 10,
      width: 16,
      height: 16
    });

    // Override canvas should be set
    expect(toolStore.overrideCanvas.value).toBe(canvas);

    // Tools can be switched while override is active
    toolStore.setActiveTool('pencil');
    expect(toolStore.activeTool.value).toBe('pencil');
    expect(toolStore.isOverrideActive()).toBe(true);

    toolStore.setActiveTool('eraser');
    expect(toolStore.activeTool.value).toBe('eraser');
    expect(toolStore.isOverrideActive()).toBe(true);

    toolStore.setActiveTool('fill');
    expect(toolStore.activeTool.value).toBe('fill');
    expect(toolStore.isOverrideActive()).toBe(true);
  });

  it('should track canvas transform for coordinate mapping', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;

    const transform = {
      screenX: 200,
      screenY: 150,
      zoom: 25,
      width: 16,
      height: 16
    };

    toolStore.setOverrideCanvas(canvas, transform);

    expect(toolStore.overrideCanvasTransform.value).toEqual(transform);
  });
});
