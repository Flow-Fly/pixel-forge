import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modeStore } from '../../src/stores/mode';

/**
 * pf-mode-toggle Component Tests
 *
 * Tests for Story 1.2 Acceptance Criteria:
 * - AC #1: Mode toggle switches between Art and Map modes
 * - AC #2: M key triggers mode toggle globally
 * - AC #3: Transition animation completes in ~200ms
 * - AC #4: Reduced motion disables animations
 * - AC #5: Keyboard navigation and ARIA attributes
 */

// Helper function to create and mount the component
async function createModeToggle(): Promise<HTMLElement> {
  // Dynamically import the component to ensure it's registered
  await import('../../src/components/toolbar/pf-mode-toggle');

  const element = document.createElement('pf-mode-toggle');
  document.body.appendChild(element);

  // Wait for Lit to complete rendering
  await (element as any).updateComplete;

  return element;
}

// Helper to clean up DOM after tests
function cleanup(element: HTMLElement) {
  element.remove();
}

describe('pf-mode-toggle', () => {
  let element: HTMLElement;

  beforeEach(async () => {
    // Reset mode store to default state before each test
    modeStore.setMode('art');
    modeStore.setHeroEditActive(false);

    element = await createModeToggle();
  });

  afterEach(() => {
    cleanup(element);
  });

  describe('Default State (AC #1)', () => {
    it('should render with Art mode active by default', async () => {
      const shadowRoot = element.shadowRoot;
      const artButton = shadowRoot?.querySelector('[data-mode="art"]') as HTMLButtonElement;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;

      expect(artButton).toBeTruthy();
      expect(mapButton).toBeTruthy();
      expect(artButton?.classList.contains('active')).toBe(true);
      expect(mapButton?.classList.contains('active')).toBe(false);
    });

    it('should have correct aria-selected attributes', async () => {
      const shadowRoot = element.shadowRoot;
      const artButton = shadowRoot?.querySelector('[data-mode="art"]') as HTMLButtonElement;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;

      expect(artButton?.getAttribute('aria-selected')).toBe('true');
      expect(mapButton?.getAttribute('aria-selected')).toBe('false');
    });
  });

  describe('Mode Switching (AC #1)', () => {
    it('should switch to Map mode when Map button is clicked', async () => {
      const shadowRoot = element.shadowRoot;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;
      mapButton?.click();
      await (element as any).updateComplete;

      expect(modeStore.mode.value).toBe('map');
      expect(mapButton?.classList.contains('active')).toBe(true);
    });

    it('should switch back to Art mode when Art button is clicked', async () => {
      // First switch to Map
      modeStore.setMode('map');
      await (element as any).updateComplete;

      const shadowRoot = element.shadowRoot;
      const artButton = shadowRoot?.querySelector('[data-mode="art"]') as HTMLButtonElement;
      artButton?.click();
      await (element as any).updateComplete;

      expect(modeStore.mode.value).toBe('art');
      expect(artButton?.classList.contains('active')).toBe(true);
    });

    it('should update visual state reactively when store changes externally', async () => {
      // Change store directly (simulating external change)
      modeStore.setMode('map');
      await (element as any).updateComplete;

      const shadowRoot = element.shadowRoot;
      const artButton = shadowRoot?.querySelector('[data-mode="art"]') as HTMLButtonElement;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;

      expect(artButton?.getAttribute('aria-selected')).toBe('false');
      expect(mapButton?.getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('M Key Shortcut (AC #2)', () => {
    it('should toggle mode when M key is pressed', async () => {
      expect(modeStore.mode.value).toBe('art');

      // Simulate M key press
      const event = new KeyboardEvent('keydown', { key: 'm', bubbles: true });
      window.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(modeStore.mode.value).toBe('map');
    });

    it('should toggle mode when uppercase M key is pressed', async () => {
      expect(modeStore.mode.value).toBe('art');

      const event = new KeyboardEvent('keydown', { key: 'M', bubbles: true });
      window.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(modeStore.mode.value).toBe('map');
    });

    it('should NOT toggle mode when M is pressed in an input element', async () => {
      // Create and focus an input element
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      expect(modeStore.mode.value).toBe('art');

      const event = new KeyboardEvent('keydown', { key: 'm', bubbles: true });
      window.dispatchEvent(event);
      await (element as any).updateComplete;

      // Should NOT have toggled since input was focused
      expect(modeStore.mode.value).toBe('art');

      // Cleanup
      document.body.removeChild(input);
    });

    it('should NOT toggle mode when M is pressed in a textarea', async () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      expect(modeStore.mode.value).toBe('art');

      const event = new KeyboardEvent('keydown', { key: 'm', bubbles: true });
      window.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(modeStore.mode.value).toBe('art');

      document.body.removeChild(textarea);
    });

    it('should NOT toggle mode when M is pressed in a contentEditable element', async () => {
      const editableDiv = document.createElement('div');
      editableDiv.contentEditable = 'true';
      document.body.appendChild(editableDiv);
      editableDiv.focus();

      expect(modeStore.mode.value).toBe('art');

      const event = new KeyboardEvent('keydown', { key: 'm', bubbles: true });
      window.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(modeStore.mode.value).toBe('art');

      document.body.removeChild(editableDiv);
    });
  });

  describe('Arrow Key Navigation (AC #5)', () => {
    it('should toggle mode when ArrowRight is pressed while focused', async () => {
      const shadowRoot = element.shadowRoot;
      const container = shadowRoot?.querySelector('[role="tablist"]') as HTMLElement;

      expect(modeStore.mode.value).toBe('art');

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      container?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(modeStore.mode.value).toBe('map');
    });

    it('should toggle mode when ArrowLeft is pressed while focused', async () => {
      modeStore.setMode('map');
      await (element as any).updateComplete;

      const shadowRoot = element.shadowRoot;
      const container = shadowRoot?.querySelector('[role="tablist"]') as HTMLElement;

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
      container?.dispatchEvent(event);
      await (element as any).updateComplete;

      expect(modeStore.mode.value).toBe('art');
    });
  });

  describe('ARIA Attributes (AC #5)', () => {
    it('should have role="tablist" on the container', async () => {
      const shadowRoot = element.shadowRoot;
      const container = shadowRoot?.querySelector('[role="tablist"]');
      expect(container).toBeTruthy();
    });

    it('should have role="tab" on each button', async () => {
      const shadowRoot = element.shadowRoot;
      const buttons = shadowRoot?.querySelectorAll('[role="tab"]');
      expect(buttons?.length).toBe(2);
    });

    it('should have aria-label on the container', async () => {
      const shadowRoot = element.shadowRoot;
      const container = shadowRoot?.querySelector('[role="tablist"]');
      expect(container?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should update aria-selected when mode changes', async () => {
      const shadowRoot = element.shadowRoot;
      const artButton = shadowRoot?.querySelector('[data-mode="art"]') as HTMLButtonElement;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;

      // Initial state
      expect(artButton?.getAttribute('aria-selected')).toBe('true');
      expect(mapButton?.getAttribute('aria-selected')).toBe('false');

      // Click Map button
      mapButton?.click();
      await (element as any).updateComplete;

      expect(artButton?.getAttribute('aria-selected')).toBe('false');
      expect(mapButton?.getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('mode-changed Event (AC #3)', () => {
    it('should emit mode-changed event when mode changes', async () => {
      const eventPromise = new Promise<CustomEvent>((resolve) => {
        element.addEventListener('mode-changed', (e) => resolve(e as CustomEvent), { once: true });
      });

      const shadowRoot = element.shadowRoot;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;
      mapButton?.click();

      const event = await eventPromise;
      expect(event.detail.mode).toBe('map');
    });

    it('should bubble the mode-changed event', async () => {
      let bubbled = false;
      document.addEventListener('mode-changed', () => { bubbled = true; }, { once: true });

      const shadowRoot = element.shadowRoot;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;
      mapButton?.click();
      await (element as any).updateComplete;

      // Small delay to ensure event propagation
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(bubbled).toBe(true);
    });

    it('should announce mode change to screen readers', async () => {
      const shadowRoot = element.shadowRoot;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;
      mapButton?.click();
      await (element as any).updateComplete;

      const srAnnouncement = shadowRoot?.querySelector('[role="status"]');
      expect(srAnnouncement?.textContent?.trim()).toBe('Switched to Tilemap Mode');
    });
  });

  describe('Focus Styles (AC #5)', () => {
    it('should have active button focusable with tabindex 0', async () => {
      const shadowRoot = element.shadowRoot;
      const artButton = shadowRoot?.querySelector('[data-mode="art"]') as HTMLButtonElement;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;
      // Active button (art) should be focusable, inactive button should not
      expect(artButton?.tabIndex).toBe(0);
      expect(mapButton?.tabIndex).toBe(-1);
    });

    it('should update tabindex when mode changes (roving tabindex pattern)', async () => {
      const shadowRoot = element.shadowRoot;
      const artButton = shadowRoot?.querySelector('[data-mode="art"]') as HTMLButtonElement;
      const mapButton = shadowRoot?.querySelector('[data-mode="map"]') as HTMLButtonElement;

      // Initial state: Art is active
      expect(artButton?.tabIndex).toBe(0);
      expect(mapButton?.tabIndex).toBe(-1);

      // Switch to Map mode
      mapButton?.click();
      await (element as any).updateComplete;

      // Now Map should be focusable, Art should not
      expect(artButton?.tabIndex).toBe(-1);
      expect(mapButton?.tabIndex).toBe(0);
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
