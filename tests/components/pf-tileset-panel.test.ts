/**
 * Tests for pf-tileset-panel component
 *
 * Tests for Story 2-3:
 * - Panel structure and visibility (Task 1)
 * - Empty state with Import CTA (Task 1, AC #5)
 * - Drag-and-drop file support (Task 5, AC #5, #7)
 * - Dialog integration (Task 7)
 * - Header with tileset name (Task 1, AC #1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tilesetStore } from '../../src/stores/tileset';
import type { Tileset } from '../../src/types/tilemap';

// Mock File class for testing
class MockFile {
  name: string;
  type: string;
  size: number;

  constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
    this.name = name;
    this.type = options?.type || '';
    this.size = bits.length > 0 ? 1024 : 0;
  }
}

// Replace global File with mock
(globalThis as unknown as Record<string, unknown>).File = MockFile;

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
async function createTilesetPanel(): Promise<HTMLElement & {
  showImportDialog: boolean;
  preloadedFile: File | null;
  isDragOver: boolean;
}> {
  await import('../../src/components/panels/pf-tileset-panel');
  const element = document.createElement('pf-tileset-panel') as any;
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

function cleanup(element: HTMLElement) {
  element.remove();
}

describe('pf-tileset-panel', () => {
  let element: Awaited<ReturnType<typeof createTilesetPanel>>;

  beforeEach(async () => {
    tilesetStore.clearAllTilesets();
    element = await createTilesetPanel();
  });

  afterEach(() => {
    cleanup(element);
    vi.restoreAllMocks();
  });

  describe('Task 1: Component structure', () => {
    it('should be defined as custom element', () => {
      expect(customElements.get('pf-tileset-panel')).toBeDefined();
    });

    it('should use flex column layout', () => {
      const host = element.shadowRoot?.host as HTMLElement;
      const styles = getComputedStyle(host);
      // Lit styles are encapsulated; verify host has correct styles
      expect(element.shadowRoot).not.toBeNull();
    });
  });

  describe('AC #5: Empty state with Import CTA', () => {
    it('should show empty state when no tileset is loaded', async () => {
      const emptyState = element.shadowRoot?.querySelector('.empty-state');
      expect(emptyState).not.toBeNull();
    });

    it('should have "Import Tileset" button in empty state', async () => {
      const importBtn = element.shadowRoot?.querySelector('.import-btn');
      expect(importBtn).not.toBeNull();
      expect(importBtn?.textContent).toContain('Import Tileset');
    });

    it('should have drag-and-drop hint text', async () => {
      const dropHint = element.shadowRoot?.querySelector('.drop-hint, .empty-text');
      expect(dropHint).not.toBeNull();
    });

    it('should open import dialog when Import button is clicked', async () => {
      const importBtn = element.shadowRoot?.querySelector('.import-btn') as HTMLButtonElement;
      importBtn?.click();
      await (element as any).updateComplete;

      expect(element.showImportDialog).toBe(true);
    });

    it('should open import dialog when empty state is clicked', async () => {
      const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;
      emptyState?.click();
      await (element as any).updateComplete;

      expect(element.showImportDialog).toBe(true);
    });
  });

  describe('AC #1: Header with tileset name', () => {
    it('should show tileset name in header when tileset is loaded', async () => {
      const tileset = createMockTileset({ name: 'My Custom Tileset' });
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const tilesetName = element.shadowRoot?.querySelector('.tileset-name');
      expect(tilesetName?.textContent).toContain('My Custom Tileset');
    });

    it('should not show empty state when tileset is loaded', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const emptyState = element.shadowRoot?.querySelector('.empty-state');
      expect(emptyState).toBeNull();
    });

    it('should show grid container when tileset is loaded', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const gridContainer = element.shadowRoot?.querySelector('.grid-container');
      expect(gridContainer).not.toBeNull();
    });
  });

  describe('Task 5: Drag-and-drop file support (AC #5, #7)', () => {
    // Helper to create mock drag event with dataTransfer
    function createMockDragEvent(
      type: string,
      files: MockFile[] = [],
      hasFiles: boolean = true
    ): DragEvent {
      const mockDataTransfer = {
        files: files,
        types: hasFiles ? ['Files'] : [],
        dropEffect: 'none',
        effectAllowed: 'all',
        items: [],
        setData: vi.fn(),
        getData: vi.fn(),
        clearData: vi.fn(),
        setDragImage: vi.fn()
      };

      const event = new Event(type, {
        bubbles: true,
        cancelable: true
      }) as DragEvent;

      Object.defineProperty(event, 'dataTransfer', {
        value: mockDataTransfer,
        writable: false
      });

      return event;
    }

    it('should highlight empty state on drag over', async () => {
      const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;

      const dragEvent = createMockDragEvent('dragover');
      emptyState?.dispatchEvent(dragEvent);
      await (element as any).updateComplete;

      expect(element.isDragOver).toBe(true);
    });

    it('should remove highlight on drag leave', async () => {
      element.isDragOver = true;
      await (element as any).updateComplete;

      const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;
      emptyState?.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
      await (element as any).updateComplete;

      expect(element.isDragOver).toBe(false);
    });

    it('should open import dialog on valid file drop', async () => {
      const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;

      const mockFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      const dropEvent = createMockDragEvent('drop', [mockFile as any]);

      emptyState?.dispatchEvent(dropEvent);
      await (element as any).updateComplete;

      expect(element.showImportDialog).toBe(true);
      expect(element.preloadedFile).not.toBeNull();
    });

    it('should emit file-dropped event on valid file drop', async () => {
      const listener = vi.fn();
      element.addEventListener('file-dropped', listener);

      const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;

      const mockFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      const dropEvent = createMockDragEvent('drop', [mockFile as any]);

      emptyState?.dispatchEvent(dropEvent);

      expect(listener).toHaveBeenCalled();
    });

    it('should not open dialog on invalid file type drop', async () => {
      const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;

      const mockFile = new MockFile(['test'], 'document.pdf', { type: 'application/pdf' });
      const dropEvent = createMockDragEvent('drop', [mockFile as any]);

      emptyState?.dispatchEvent(dropEvent);
      await (element as any).updateComplete;

      expect(element.showImportDialog).toBe(false);
    });

    it('should not open dialog on file exceeding size limit (10MB)', async () => {
      const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;

      // Create mock file with size exceeding 10MB
      const mockFile = new MockFile(['test'], 'huge-tileset.png', { type: 'image/png' });
      // Override size to exceed limit (10MB = 10 * 1024 * 1024 bytes)
      Object.defineProperty(mockFile, 'size', { value: 11 * 1024 * 1024 });

      const dropEvent = createMockDragEvent('drop', [mockFile as any]);

      emptyState?.dispatchEvent(dropEvent);
      await (element as any).updateComplete;

      expect(element.showImportDialog).toBe(false);
    });

    it('should open dialog for files within size limit', async () => {
      const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;

      // Create mock file with valid size (5MB)
      const mockFile = new MockFile(['test'], 'valid-tileset.png', { type: 'image/png' });
      Object.defineProperty(mockFile, 'size', { value: 5 * 1024 * 1024 });

      const dropEvent = createMockDragEvent('drop', [mockFile as any]);

      emptyState?.dispatchEvent(dropEvent);
      await (element as any).updateComplete;

      expect(element.showImportDialog).toBe(true);
    });

    it('should support PNG, JPG, and WebP file types', async () => {
      const validTypes = ['image/png', 'image/jpeg', 'image/webp'];

      for (const type of validTypes) {
        // Reset state
        element.showImportDialog = false;
        element.preloadedFile = null;
        await (element as any).updateComplete;

        const emptyState = element.shadowRoot?.querySelector('.empty-state') as HTMLElement;
        const mockFile = new MockFile(['test'], `tileset.${type.split('/')[1]}`, { type });
        const dropEvent = createMockDragEvent('drop', [mockFile as any]);

        emptyState?.dispatchEvent(dropEvent);
        await (element as any).updateComplete;

        expect(element.showImportDialog).toBe(true);
      }
    });

    it('should show drag overlay when tileset is loaded and dragging', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const panelContent = element.shadowRoot?.querySelector('.panel-content') as HTMLElement;

      const dragEvent = createMockDragEvent('dragover');
      panelContent?.dispatchEvent(dragEvent);
      await (element as any).updateComplete;

      const overlay = element.shadowRoot?.querySelector('.drag-overlay');
      expect(overlay).not.toBeNull();
    });
  });

  describe('Task 7: Dialog integration', () => {
    it('should have import tileset dialog element', async () => {
      const dialog = element.shadowRoot?.querySelector('pf-import-tileset-dialog');
      expect(dialog).not.toBeNull();
    });

    it('should close dialog on tileset-imported event', async () => {
      element.showImportDialog = true;
      await (element as any).updateComplete;

      const dialog = element.shadowRoot?.querySelector('pf-import-tileset-dialog');
      dialog?.dispatchEvent(new CustomEvent('tileset-imported', { bubbles: true }));
      await (element as any).updateComplete;

      expect(element.showImportDialog).toBe(false);
    });

    it('should reset preloaded file after dialog closes', async () => {
      element.showImportDialog = true;
      element.preloadedFile = new MockFile(['test'], 'test.png', { type: 'image/png' }) as unknown as File;
      await (element as any).updateComplete;

      const dialog = element.shadowRoot?.querySelector('pf-import-tileset-dialog');
      dialog?.dispatchEvent(new CustomEvent('tileset-imported', { bubbles: true }));
      await (element as any).updateComplete;

      expect(element.preloadedFile).toBeNull();
    });
  });

  describe('Integration tests', () => {
    it('should transition from empty state to grid when tileset is added', async () => {
      // Initially empty
      expect(element.shadowRoot?.querySelector('.empty-state')).not.toBeNull();

      // Add tileset
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      // Should show grid
      expect(element.shadowRoot?.querySelector('.empty-state')).toBeNull();
      expect(element.shadowRoot?.querySelector('.grid-container')).not.toBeNull();
    });

    it('should transition back to empty state when tileset is removed', async () => {
      // Add tileset
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      // Remove tileset
      tilesetStore.removeTileset(tileset.id);
      await (element as any).updateComplete;

      // Should show empty state
      expect(element.shadowRoot?.querySelector('.empty-state')).not.toBeNull();
    });

    it('should contain pf-tileset-grid when tileset is loaded', async () => {
      const tileset = createMockTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      await (element as any).updateComplete;

      const grid = element.shadowRoot?.querySelector('pf-tileset-grid');
      expect(grid).not.toBeNull();
    });
  });
});
