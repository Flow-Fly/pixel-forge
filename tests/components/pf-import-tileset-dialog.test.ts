/**
 * Tests for pf-import-tileset-dialog component
 *
 * Tests for Story 2-2:
 * - Dialog structure and visibility control (Task 1)
 * - File selection mechanism (Task 2)
 * - Preview canvas with grid overlay (Task 3)
 * - Auto-detection of tile size (Task 4)
 * - Grid parameter form inputs (Task 5)
 * - Validation and error handling (Task 6)
 * - Store integration (Task 7)
 * - Preset tile size buttons (Task 8)
 * - Accessibility features (Task 9)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tilesetStore } from '../../src/stores/tileset';

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

// Helper to dynamically import and create component
async function createImportTilesetDialog(): Promise<HTMLElement & {
  open: boolean;
  selectFile: () => void;
  handleFileSelect: (file: File) => Promise<void>;
  handleImport: () => Promise<void>;
  autoDetectTileSize: (width: number, height: number) => { tileWidth: number; tileHeight: number };
  validateConfiguration: () => boolean;
  updatePreview: () => void;
  getColumns: () => number;
  getRows: () => number;
  tileWidth: number;
  tileHeight: number;
  spacing: number;
  margin: number;
  errorMessage: string;
}> {
  await import('../../src/components/dialogs/pf-import-tileset-dialog');
  const element = document.createElement('pf-import-tileset-dialog') as any;
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

function cleanup(element: HTMLElement) {
  element.remove();
}

describe('pf-import-tileset-dialog', () => {
  let element: Awaited<ReturnType<typeof createImportTilesetDialog>>;

  beforeEach(async () => {
    tilesetStore.clearAllTilesets();
    element = await createImportTilesetDialog();
  });

  afterEach(() => {
    cleanup(element);
    vi.restoreAllMocks();
  });

  describe('Task 1: Component structure', () => {
    it('should be defined as custom element', () => {
      expect(customElements.get('pf-import-tileset-dialog')).toBeDefined();
    });

    it('should be hidden by default (open=false)', () => {
      expect(element.open).toBe(false);
      const overlay = element.shadowRoot?.querySelector('.overlay');
      expect(overlay).toBeNull();
    });

    it('should show dialog when open=true', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const overlay = element.shadowRoot?.querySelector('.overlay');
      expect(overlay).not.toBeNull();
    });

    it('should have dialog structure with header, content, and footer', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const dialog = element.shadowRoot?.querySelector('.dialog');
      const header = element.shadowRoot?.querySelector('.header');
      const content = element.shadowRoot?.querySelector('.content');
      const footer = element.shadowRoot?.querySelector('.footer');

      expect(dialog).not.toBeNull();
      expect(header).not.toBeNull();
      expect(content).not.toBeNull();
      expect(footer).not.toBeNull();
    });

    it('should close when Escape key is pressed', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      element.shadowRoot?.querySelector('.dialog')?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(element.open).toBe(false);
    });

    it('should close when backdrop is clicked', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const overlay = element.shadowRoot?.querySelector('.overlay');
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await (element as any).updateComplete;

      expect(element.open).toBe(false);
    });

    it('should NOT close when dialog content is clicked', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const dialog = element.shadowRoot?.querySelector('.dialog');
      dialog?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await (element as any).updateComplete;

      expect(element.open).toBe(true);
    });

    it('should have reflect:true for open property', async () => {
      element.open = true;
      await (element as any).updateComplete;
      expect(element.hasAttribute('open')).toBe(true);

      element.open = false;
      await (element as any).updateComplete;
      expect(element.hasAttribute('open')).toBe(false);
    });
  });

  describe('Task 2: File selection mechanism', () => {
    it('should have hidden file input for PNG, JPG, WebP', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const fileInput = element.shadowRoot?.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();
      expect(fileInput?.accept).toContain('image/png');
      expect(fileInput?.accept).toContain('image/jpeg');
      expect(fileInput?.accept).toContain('image/webp');
    });

    it('should have selectFile method', () => {
      expect(typeof element.selectFile).toBe('function');
    });

    it('should reject invalid file types', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const invalidFile = new MockFile(['test'], 'test.txt', { type: 'text/plain' });
      await element.handleFileSelect(invalidFile as unknown as File);

      expect(element.errorMessage).toBe('Invalid file type. Please select a PNG, JPG, or WebP image.');
    });

    it('should have drag-and-drop zone', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const dropZone = element.shadowRoot?.querySelector('.drop-zone, .preview-container');
      expect(dropZone).not.toBeNull();
    });

    it('should emit file-selected event on valid file', async () => {
      const listener = vi.fn();
      element.addEventListener('file-selected', listener);

      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Task 3: Preview canvas with grid overlay', () => {
    it('should have preview canvas element after loading a file', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      const canvas = element.shadowRoot?.querySelector('canvas.preview-canvas');
      expect(canvas).not.toBeNull();
    });

    it('should update grid overlay on parameter change', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      // Spy after initial load completes
      const updateSpy = vi.spyOn(element, 'updatePreview');

      // Change a parameter that triggers updatePreview via debounce
      element.tileWidth = 8;
      await (element as any).updateComplete;

      // Wait for debounce timer (100ms)
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('Task 4: Auto-detection of tile size', () => {
    it('should have autoDetectTileSize method', () => {
      expect(typeof element.autoDetectTileSize).toBe('function');
    });

    it('should detect 32x32 for 128x128 image', () => {
      const result = element.autoDetectTileSize(128, 128);
      expect(result.tileWidth).toBe(32);
      expect(result.tileHeight).toBe(32);
    });

    it('should detect 32x32 for 64x64 image (32 is most common)', () => {
      const result = element.autoDetectTileSize(64, 64);
      expect(result.tileWidth).toBe(32);
      expect(result.tileHeight).toBe(32);
    });

    it('should detect 16x16 for 48x48 image (divisible by 16 but not 32)', () => {
      const result = element.autoDetectTileSize(48, 48);
      expect(result.tileWidth).toBe(16);
      expect(result.tileHeight).toBe(16);
    });

    it('should default to 16x16 for non-standard sizes', () => {
      const result = element.autoDetectTileSize(100, 100);
      expect(result.tileWidth).toBe(16);
      expect(result.tileHeight).toBe(16);
    });

    it('should detect 8x8 for 24x24 image (divisible by 8)', () => {
      const result = element.autoDetectTileSize(24, 24);
      expect(result.tileWidth).toBe(8);
      expect(result.tileHeight).toBe(8);
    });
  });

  describe('Task 5: Grid parameter form inputs', () => {
    it('should have tile width input', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const input = element.shadowRoot?.querySelector('input[name="tileWidth"]');
      expect(input).not.toBeNull();
    });

    it('should have tile height input', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const input = element.shadowRoot?.querySelector('input[name="tileHeight"]');
      expect(input).not.toBeNull();
    });

    it('should have spacing input', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const input = element.shadowRoot?.querySelector('input[name="spacing"]');
      expect(input).not.toBeNull();
    });

    it('should have margin input', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const input = element.shadowRoot?.querySelector('input[name="margin"]');
      expect(input).not.toBeNull();
    });

    it('should display tile count information after loading a file', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      const info = element.shadowRoot?.querySelector('.info, .tile-count');
      expect(info).not.toBeNull();
    });
  });

  describe('Task 6: Validation and error handling', () => {
    it('should show error for invalid tile dimensions', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      element.tileWidth = 0;
      const isValid = element.validateConfiguration();

      expect(isValid).toBe(false);
      expect(element.errorMessage.toLowerCase()).toContain('tile');
    });

    it('should show error when no complete tiles can be extracted', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      // Set tile size larger than image (32x32 mock ImageBitmap)
      element.tileWidth = 100;
      element.tileHeight = 100;
      const isValid = element.validateConfiguration();

      expect(isValid).toBe(false);
    });

    it('should set error message on invalid file type', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const invalidFile = new MockFile(['test'], 'test.txt', { type: 'text/plain' });
      await element.handleFileSelect(invalidFile as unknown as File);

      expect(element.errorMessage).not.toBe('');
    });
  });

  describe('Task 7: Store integration', () => {
    it('should create tileset with valid UUID', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      await element.handleImport();

      expect(tilesetStore.getTilesetCount()).toBe(1);
      const tileset = tilesetStore.tilesets.value[0];
      // UUID format: 8-4-4-4-12 hex characters
      expect(tileset.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should set active tileset after import', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      await element.handleImport();

      expect(tilesetStore.getActiveTileset()).not.toBeNull();
    });

    it('should emit tileset-imported event', async () => {
      const listener = vi.fn();
      element.addEventListener('tileset-imported', listener);

      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      await element.handleImport();

      expect(listener).toHaveBeenCalled();
    });

    it('should close dialog on successful import', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      await element.handleImport();

      expect(element.open).toBe(false);
    });
  });

  describe('Task 8: Preset tile size buttons', () => {
    it('should have preset buttons for common sizes', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const presets = element.shadowRoot?.querySelectorAll('.presets button, .preset-btn');
      expect(presets?.length).toBeGreaterThanOrEqual(4);
    });

    it('should update tile size on preset click', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      const preset32 = element.shadowRoot?.querySelector('[data-preset="32"]');
      preset32?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await (element as any).updateComplete;

      expect(element.tileWidth).toBe(32);
      expect(element.tileHeight).toBe(32);
    });
  });

  describe('Task 9: Accessibility', () => {
    it('should have role="dialog" and aria-modal="true"', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const dialog = element.shadowRoot?.querySelector('.dialog');
      expect(dialog?.getAttribute('role')).toBe('dialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-labelledby pointing to title', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const dialog = element.shadowRoot?.querySelector('.dialog');
      const labelledby = dialog?.getAttribute('aria-labelledby');
      expect(labelledby).not.toBeNull();

      const title = element.shadowRoot?.getElementById(labelledby!);
      expect(title).not.toBeNull();
    });

    it('should have labels for all form inputs', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const inputs = element.shadowRoot?.querySelectorAll('input[type="number"]');
      inputs?.forEach((input) => {
        const id = input.id;
        const label = element.shadowRoot?.querySelector(`label[for="${id}"]`);
        // Either explicit label or aria-label
        expect(label || input.getAttribute('aria-label')).not.toBeNull();
      });
    });
  });

  describe('Task 10: Integration tests', () => {
    it('should disable import button until valid configuration', async () => {
      element.open = true;
      await (element as any).updateComplete;

      // No file loaded yet
      const importBtn = element.shadowRoot?.querySelector('.primary, [data-action="import"]') as HTMLButtonElement;
      expect(importBtn?.disabled).toBe(true);
    });

    it('should enable import button with valid configuration', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      const importBtn = element.shadowRoot?.querySelector('.primary, [data-action="import"]') as HTMLButtonElement;
      expect(importBtn?.disabled).toBe(false);
    });

    it('should calculate columns and rows correctly', async () => {
      element.open = true;
      await (element as any).updateComplete;

      const validFile = new MockFile(['test'], 'tileset.png', { type: 'image/png' });
      await element.handleFileSelect(validFile as unknown as File);
      await (element as any).updateComplete;

      // With 32x32 mock image and 16x16 tiles, expect 2x2 = 4 tiles
      element.tileWidth = 16;
      element.tileHeight = 16;
      element.spacing = 0;
      element.margin = 0;

      const columns = element.getColumns();
      const rows = element.getRows();

      expect(columns).toBe(2);
      expect(rows).toBe(2);
    });
  });
});
