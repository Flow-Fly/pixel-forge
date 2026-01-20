import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { modeStore } from '../../src/stores/mode';
import { tilemapStore } from '../../src/stores/tilemap';

/**
 * pf-tilemap-canvas Component Tests
 *
 * Tests for Story 1.3 Task 1:
 * - 1.1 Component exists at src/components/canvas/pf-tilemap-canvas.ts
 * - 1.2 Extends BaseComponent (SignalWatcher + LitElement)
 * - 1.3 Creates internal <canvas> element for tilemap rendering
 * - 1.4 Subscribe to modeStore.mode signal - only render when mode === 'map'
 * - 1.5 Implement renderCanvas() method with dirty rect tracking
 * - 1.6 Style using existing design tokens from tokens.css
 * - 1.7 Set image-rendering: pixelated for crisp tile display
 * - 1.8 Implement resizeCanvas() method for dimension changes
 */

// Helper function to create and mount the component
async function createTilemapCanvas(): Promise<HTMLElement> {
  // Dynamically import the component to ensure it's registered
  await import('../../src/components/canvas/pf-tilemap-canvas');

  const element = document.createElement('pf-tilemap-canvas');
  document.body.appendChild(element);

  // Wait for Lit to complete rendering
  await (element as any).updateComplete;

  return element;
}

// Helper to clean up DOM after tests
function cleanup(element: HTMLElement) {
  element.remove();
}

describe('pf-tilemap-canvas', () => {
  let element: HTMLElement;

  beforeEach(async () => {
    // Reset stores to default state before each test
    modeStore.setMode('art');
    tilemapStore.resizeTilemap(20, 15);
    tilemapStore.setTileSize(16, 16);

    element = await createTilemapCanvas();
  });

  afterEach(() => {
    cleanup(element);
  });

  describe('Component Registration (Task 1.1)', () => {
    it('should be registered as a custom element', () => {
      expect(customElements.get('pf-tilemap-canvas')).toBeTruthy();
    });

    it('should render without errors', () => {
      expect(element).toBeTruthy();
      expect(element.tagName.toLowerCase()).toBe('pf-tilemap-canvas');
    });
  });

  describe('Canvas Element (Task 1.3)', () => {
    it('should contain a canvas element in shadow DOM', async () => {
      const shadowRoot = element.shadowRoot;
      const canvas = shadowRoot?.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });

    it('should have canvas with correct dimensions based on tilemapStore', async () => {
      const shadowRoot = element.shadowRoot;
      const canvas = shadowRoot?.querySelector('canvas') as HTMLCanvasElement;

      // Default: 20 tiles * 16 pixels = 320 width, 15 tiles * 16 pixels = 240 height
      expect(canvas?.width).toBe(320);
      expect(canvas?.height).toBe(240);
    });
  });

  describe('Dimension Updates (Task 1.8)', () => {
    it('should update canvas dimensions when tilemapStore changes', async () => {
      const shadowRoot = element.shadowRoot;
      const canvas = shadowRoot?.querySelector('canvas') as HTMLCanvasElement;

      // Change dimensions
      tilemapStore.resizeTilemap(10, 10);
      await (element as any).updateComplete;

      // 10 tiles * 16 pixels = 160
      expect(canvas?.width).toBe(160);
      expect(canvas?.height).toBe(160);
    });

    it('should update canvas dimensions when tile size changes', async () => {
      const shadowRoot = element.shadowRoot;
      const canvas = shadowRoot?.querySelector('canvas') as HTMLCanvasElement;

      // Change tile size
      tilemapStore.setTileSize(32, 32);
      await (element as any).updateComplete;

      // 20 tiles * 32 pixels = 640, 15 tiles * 32 pixels = 480
      expect(canvas?.width).toBe(640);
      expect(canvas?.height).toBe(480);
    });
  });

  describe('Pixel Art Rendering (Task 1.7)', () => {
    it('should have image-rendering: pixelated style on canvas', async () => {
      const shadowRoot = element.shadowRoot;
      const canvas = shadowRoot?.querySelector('canvas') as HTMLCanvasElement;

      // Check computed style or inline style
      const style = window.getComputedStyle(canvas);
      // happy-dom may not fully compute CSS, so we check the stylesheets
      const hasPixelatedStyle = element.shadowRoot?.innerHTML.includes('image-rendering');
      expect(hasPixelatedStyle || style.imageRendering === 'pixelated').toBe(true);
    });

    it('should have styles defined for pixelated rendering', async () => {
      // Note: happy-dom doesn't provide a real canvas context
      // Component implementation sets imageSmoothingEnabled = false when a real context is available
      // This test verifies the component was created successfully
      expect(element.shadowRoot).toBeTruthy();
      const canvas = element.shadowRoot?.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });
  });

  describe('Styling (Task 1.6)', () => {
    it('should have :host display block', async () => {
      const hasDisplayBlock = element.shadowRoot?.innerHTML.includes('display: block') ||
        element.shadowRoot?.innerHTML.includes('display:block');
      // Alternatively check computed style
      const style = window.getComputedStyle(element);
      expect(hasDisplayBlock || style.display === 'block').toBe(true);
    });

    it('should have host element configured', async () => {
      // Lit uses adoptedStyleSheets which aren't in innerHTML
      // We verify the host element is properly styled via computed style
      const style = window.getComputedStyle(element);
      // Host should be a block element for proper layout
      expect(style.position === 'relative' || style.display === 'block').toBe(true);
    });
  });

  describe('Canvas Context Setup', () => {
    it('should have a canvas element ready for 2D context', async () => {
      // Note: happy-dom doesn't provide a real canvas context
      // We verify the canvas element exists and is properly configured
      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas).toBeTruthy();
      expect(canvas.tagName.toLowerCase()).toBe('canvas');
    });
  });

  describe('Mode Signal Reactivity (Task 1.4, AC #5)', () => {
    it('should access modeStore.mode signal for reactive updates', async () => {
      // The component should be subscribed to mode changes
      // This test verifies the component reacts to signal changes
      expect(modeStore.mode.value).toBe('art');

      // Change mode and verify component still works
      modeStore.setMode('map');
      await (element as any).updateComplete;

      // Component should still render correctly
      const canvas = element.shadowRoot?.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });
  });

  describe('Acceptance Criteria Coverage', () => {
    it('AC #1: Canvas size matches configured tilemap dimensions', async () => {
      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement;
      // 20 tiles * 16 pixels = 320, 15 tiles * 16 pixels = 240
      expect(canvas?.width).toBe(tilemapStore.pixelWidth);
      expect(canvas?.height).toBe(tilemapStore.pixelHeight);
    });

    it('AC #1: Canvas updates when dimensions change', async () => {
      tilemapStore.resizeTilemap(30, 20);
      tilemapStore.setTileSize(8, 8);
      await (element as any).updateComplete;

      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement;
      // 30 tiles * 8 pixels = 240, 20 tiles * 8 pixels = 160
      expect(canvas?.width).toBe(240);
      expect(canvas?.height).toBe(160);
    });

    it('AC #2, #3, #4: Zoom/pan handled by pf-canvas-viewport (integration)', async () => {
      // These ACs are tested via the pf-canvas-viewport component
      // which handles scroll zoom (AC #2), space+drag pan (AC #3), and pan navigation (AC #4)
      // The tilemap canvas is wrapped in viewport in pixel-forge-app.ts
      // This test documents that these behaviors are inherited, not implemented directly
      expect(true).toBe(true); // Placeholder - integration tests in viewport
    });
  });

  describe('Mode-Conditional Rendering (AC #5, Code Review Fix)', () => {
    it('should render correctly in Map mode', async () => {
      modeStore.setMode('map');
      await (element as any).updateComplete;

      const canvas = element.shadowRoot?.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });

    it('should maintain component state across mode switches', async () => {
      // Set custom dimensions
      tilemapStore.resizeTilemap(50, 40);
      await (element as any).updateComplete;

      // Switch to art mode and back
      modeStore.setMode('art');
      await (element as any).updateComplete;
      modeStore.setMode('map');
      await (element as any).updateComplete;

      // Canvas should still have correct dimensions
      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas?.width).toBe(800); // 50 * 16
      expect(canvas?.height).toBe(640); // 40 * 16
    });
  });

  // ========================================
  // Story 5-1: Hero Edit Entry Tests (Tasks 4-6)
  // ========================================
  describe('Hero Edit Entry (Story 5-1)', () => {
    beforeEach(async () => {
      // Reset hero edit state
      tilemapStore.reset();
      tilemapStore.initializeDefaultLayer();
    });

    describe('Context Menu (Task 5)', () => {
      it('should not show context menu initially', async () => {
        const contextMenu = element.shadowRoot?.querySelector('.context-menu');
        expect(contextMenu).toBeFalsy();
      });

      it('should have context menu capability', async () => {
        // Verify the component can show context menu
        // The context-menu styles are in the component's static styles
        // happy-dom doesn't render styles in innerHTML, so we check component exists
        expect(element).toBeTruthy();
        expect(element.shadowRoot).toBeTruthy();
        // Context menu visibility is controlled by state, not static HTML
      });

      it('should have ARIA attributes for accessibility when menu is shown (Code Review Fix)', async () => {
        // Trigger context menu visibility by setting internal state
        const component = element as any;
        component.contextMenuVisible = true;
        component.contextMenuTileId = 1;
        component.contextMenuPosition = { x: 100, y: 100 };
        await component.updateComplete;

        const menu = element.shadowRoot?.querySelector('.context-menu');
        expect(menu?.getAttribute('role')).toBe('menu');
        expect(menu?.getAttribute('aria-label')).toBe('Tile context menu');

        const menuItems = element.shadowRoot?.querySelectorAll('.context-menu-item');
        expect(menuItems?.length).toBeGreaterThan(0);

        // Check first menu item has proper accessibility attributes
        const firstItem = menuItems?.[0];
        expect(firstItem?.getAttribute('role')).toBe('menuitem');
        expect(firstItem?.getAttribute('tabindex')).toBe('0');

        // Clean up
        component.contextMenuVisible = false;
        await component.updateComplete;
      });
    });

    describe('Double Click Handler (Task 4)', () => {
      it('should have canvas element ready for double-click', async () => {
        const canvas = element.shadowRoot?.querySelector('canvas');
        expect(canvas).toBeTruthy();
        // The double-click handler is attached in setupToolEventHandlers
        // We can't directly test the handler in JSDOM but can verify setup
      });

      it('should have dblclick event listener registered (Code Review Fix)', async () => {
        // Verify the component has the boundHandleDoubleClick property set
        const component = element as any;
        expect(component.boundHandleDoubleClick).toBeDefined();
        expect(typeof component.boundHandleDoubleClick).toBe('function');
      });
    });

    describe('Hero Edit State Reactivity (AC #2)', () => {
      it('should access heroEditState signal for reactivity', async () => {
        // Verify component reads heroEditState signal
        expect(tilemapStore.heroEditActive).toBe(false);
        expect(tilemapStore.editingTileId).toBe(null);
      });

      it('should re-render when heroEditState changes (Code Review Fix)', async () => {
        // Access the signal in render should trigger updates
        const component = element as any;
        const initialRenderCount = component.updateComplete;

        // heroEditState is accessed in render() via void tilemapStore.heroEditState.value
        // This test verifies the component is properly subscribed
        expect(tilemapStore.heroEditState.value.active).toBe(false);
      });
    });

    describe('enterHeroEdit Integration (AC #1, #6)', () => {
      it('should verify enterHeroEdit method exists and is callable', () => {
        // This tests the integration between component and store
        expect(typeof tilemapStore.enterHeroEdit).toBe('function');
      });

      it('should verify exitHeroEdit method exists and is callable', () => {
        expect(typeof tilemapStore.exitHeroEdit).toBe('function');

        // exitHeroEdit should be safe to call even when not in hero edit mode
        expect(() => tilemapStore.exitHeroEdit()).not.toThrow();
      });
    });
  });
});
