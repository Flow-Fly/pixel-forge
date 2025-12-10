import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { TextTool } from '../../tools/text-tool';
import { toolStore } from '../../stores/tools';
import { layerStore } from '../../stores/layers';
import { animationStore } from '../../stores/animation';

/**
 * Hidden input component for capturing text input.
 *
 * This component creates an invisible input element that captures keyboard
 * events natively. This gives us free support for:
 * - All keyboard shortcuts (backspace, delete, arrows, home/end)
 * - IME support for international input
 * - Copy/paste
 * - Selection handling
 *
 * The actual text rendering happens on the canvas - this is just for input capture.
 */
@customElement('pf-text-input')
export class PfTextInput extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 1000;
    }

    input {
      /* Hidden input - captures text input while rendering happens on canvas */
      position: absolute;
      top: 0;
      left: 0;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
      background: transparent;
      color: transparent;
      outline: none;
      pointer-events: auto;
      opacity: 0;
    }
  `;

  @state() private isActive = false;

  private inputRef: HTMLInputElement | null = null;
  private cursorBlinkInterval: number | null = null;
  private justStartedEditing = false;

  connectedCallback() {
    super.connectedCallback();

    // Listen for text tool events
    window.addEventListener('text-tool:start-editing', this.handleStartEditing);
    window.addEventListener('text-tool:stop-editing', this.handleStopEditing);
    window.addEventListener('text-tool:edit-layer', this.handleEditLayer);
    window.addEventListener('text-tool:commit', this.handleCommit);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    window.removeEventListener('text-tool:start-editing', this.handleStartEditing);
    window.removeEventListener('text-tool:stop-editing', this.handleStopEditing);
    window.removeEventListener('text-tool:edit-layer', this.handleEditLayer);
    window.removeEventListener('text-tool:commit', this.handleCommit);

    this.stopCursorBlink();
  }

  private handleStartEditing = async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    this.isActive = true;
    this.justStartedEditing = true;

    // Wait for Lit to complete the update cycle
    await this.updateComplete;

    // Use setTimeout to defer focus until after all mouse events complete
    // This prevents the canvas from stealing focus back
    setTimeout(() => {
      const input = this.shadowRoot?.querySelector('input');
      if (input) {
        input.value = detail.initialContent || '';
        input.focus();

        // Position cursor at end
        const len = input.value.length;
        input.setSelectionRange(len, len);

        // Update our ref
        this.inputRef = input;

        // Start cursor blinking
        this.startCursorBlink();

        // Clear the flag after a short delay
        setTimeout(() => {
          this.justStartedEditing = false;
        }, 200);
      }
    }, 50);
  };

  private handleStopEditing = () => {
    this.isActive = false;
    this.justStartedEditing = false;
    this.stopCursorBlink();

    if (this.inputRef) {
      this.inputRef.blur();
      this.inputRef.value = '';
    }
  };

  private handleEditLayer = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    const { layerId } = detail;

    // Switch to text tool if not already active
    if (toolStore.activeTool.value !== 'text') {
      toolStore.setActiveTool('text');
    }

    // Get the text content for this layer
    const currentFrameId = animationStore.currentFrameId.value;
    const textCelData = animationStore.getTextCelData(layerId, currentFrameId);

    // Set active layer
    layerStore.setActiveLayer(layerId);

    // Update editing state
    const celKey = animationStore.getCelKey(layerId, currentFrameId);
    TextTool.editingState.value = {
      isEditing: true,
      layerId,
      celKey,
      cursorPosition: textCelData?.content.length ?? 0,
      cursorVisible: true,
    };

    // Trigger start editing with the content
    this.handleStartEditing(new CustomEvent('text-tool:start-editing', {
      detail: {
        layerId,
        celKey,
        initialContent: textCelData?.content ?? '',
      }
    }));
  };

  private handleCommit = () => {
    const state = TextTool.editingState.value;
    if (!state.isEditing || !state.layerId) return;

    // Check if text is empty - if so, delete the layer
    const currentFrameId = animationStore.currentFrameId.value;
    const textCelData = animationStore.getTextCelData(state.layerId, currentFrameId);

    if (!textCelData?.content || textCelData.content.trim() === '') {
      // Delete empty text layer
      layerStore.removeLayer(state.layerId);
    }

    // Reset editing state
    TextTool.editingState.value = {
      isEditing: false,
      layerId: null,
      celKey: null,
      cursorPosition: 0,
      cursorVisible: true,
    };

    this.handleStopEditing();
  };

  private handleInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const content = input.value;
    const cursorPosition = input.selectionStart ?? content.length;

    // Update the text tool state
    TextTool.updateTextContent(content, cursorPosition);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    // Handle escape or enter to commit
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this.handleCommit();
      return;
    }

    // Prevent other keyboard shortcuts from firing while typing
    if (this.isActive && !e.ctrlKey && !e.metaKey) {
      e.stopPropagation();
    }
  };

  private handleBlur = () => {
    // Don't commit if we just started editing (prevents immediate blur on click)
    if (this.justStartedEditing) {
      // Re-focus the input
      setTimeout(() => {
        this.inputRef?.focus();
      }, 10);
      return;
    }

    // Commit text on blur (clicking elsewhere)
    // Use a small delay to allow for click events to be processed first
    setTimeout(() => {
      const state = TextTool.editingState.value;
      if (state.isEditing && !this.justStartedEditing) {
        this.handleCommit();
      }
    }, 100);
  };

  private handleSelectionChange = () => {
    if (!this.inputRef || !this.isActive) return;

    const cursorPosition = this.inputRef.selectionStart ?? 0;
    const state = TextTool.editingState.value;

    if (state.cursorPosition !== cursorPosition) {
      TextTool.editingState.value = {
        ...state,
        cursorPosition,
      };
    }
  };

  private startCursorBlink() {
    this.stopCursorBlink();

    // Blink cursor every 500ms
    this.cursorBlinkInterval = window.setInterval(() => {
      TextTool.toggleCursorVisibility();
    }, 500);
  }

  private stopCursorBlink() {
    if (this.cursorBlinkInterval !== null) {
      clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = null;
    }
  }

  render() {
    // Access editing state to register with SignalWatcher
    const _state = TextTool.editingState.value;

    return html`
      <input
        type="text"
        tabindex=${this.isActive ? 0 : -1}
        @input=${this.handleInput}
        @keydown=${this.handleKeyDown}
        @blur=${this.handleBlur}
        @select=${this.handleSelectionChange}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
      />
    `;
  }

  protected updated() {
    // Keep inputRef in sync after each render
    this.inputRef = this.shadowRoot?.querySelector('input') ?? null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-text-input': PfTextInput;
  }
}
