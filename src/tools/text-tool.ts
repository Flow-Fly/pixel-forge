import { BaseTool, type ModifierKeys } from "./base-tool";
import { layerStore } from "../stores/layers";
import { animationStore } from "../stores/animation";
import { historyStore } from "../stores/history";
import { textSettings } from "../stores/tool-settings";
import { colorStore } from "../stores/colors";
import { projectStore } from "../stores/project";
import { signal } from "../core/signal";
import type { TextEditingState } from "../types/text";
import {
  defaultFontId,
  getFont,
  getDefaultFont,
  measureText,
} from "../utils/pixel-fonts";
import { MoveTextCommand } from "../commands/text-commands";

/**
 * Text tool for creating and editing text layers.
 *
 * Unlike other tools, the text tool doesn't draw directly to the canvas.
 * Instead, it creates text layers and manages text editing state.
 *
 * Behavior:
 * - Click on empty space: create new text layer
 * - Single-click on existing text: drag to move
 * - Double-click on existing text: enter edit mode
 */
export class TextTool extends BaseTool {
  name = "text";
  cursor = "text";

  // Drag state for moving text
  private isDragging = false;
  private dragLayerId: string | null = null;
  private dragStartPos = { x: 0, y: 0 };
  private originalTextPos = { x: 0, y: 0 };

  // Double-click detection
  private lastClickTime = 0;
  private lastClickLayerId: string | null = null;
  private readonly DOUBLE_CLICK_THRESHOLD = 300; // ms

  /**
   * Text editing state - shared with canvas and input components.
   */
  static editingState = signal<TextEditingState>({
    isEditing: false,
    layerId: null,
    celKey: null,
    cursorPosition: 0,
    cursorVisible: true,
  });

  /**
   * Event emitter for text tool events.
   * Components listen to these to coordinate behavior.
   */
  private emitEvent(type: string, detail?: unknown) {
    window.dispatchEvent(new CustomEvent(`text-tool:${type}`, { detail }));
  }

  onDown(x: number, y: number, _modifiers?: ModifierKeys): void {
    const state = TextTool.editingState.value;

    // If already editing, clicking elsewhere commits the text
    if (state.isEditing) {
      this.commitText();
      return;
    }

    // Check if clicking on an existing text layer
    const clickedTextLayer = this.findTextLayerAtPosition(x, y);

    if (clickedTextLayer) {
      const now = Date.now();
      const isDoubleClick =
        this.lastClickLayerId === clickedTextLayer.layerId &&
        now - this.lastClickTime < this.DOUBLE_CLICK_THRESHOLD;

      if (isDoubleClick) {
        // Double-click: enter edit mode
        this.lastClickTime = 0;
        this.lastClickLayerId = null;
        this.startEditing(clickedTextLayer.layerId, x, y);
      } else {
        // Single-click: start dragging
        this.lastClickTime = now;
        this.lastClickLayerId = clickedTextLayer.layerId;
        this.startDragging(clickedTextLayer.layerId, x, y);
      }
    } else {
      // Click on empty space: create new text layer
      this.lastClickTime = 0;
      this.lastClickLayerId = null;
      this.createTextLayer(x, y);
    }
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isDragging || !this.dragLayerId) return;

    const currentFrameId = animationStore.currentFrameId.value;
    const dx = x - this.dragStartPos.x;
    const dy = y - this.dragStartPos.y;

    // Update text position in real-time for visual feedback
    animationStore.updateTextCelData(this.dragLayerId, currentFrameId, {
      x: Math.floor(this.originalTextPos.x + dx),
      y: Math.floor(this.originalTextPos.y + dy),
    });
  }

  onUp(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isDragging || !this.dragLayerId) return;

    const currentFrameId = animationStore.currentFrameId.value;
    const dx = x - this.dragStartPos.x;
    const dy = y - this.dragStartPos.y;

    const newPos = {
      x: Math.floor(this.originalTextPos.x + dx),
      y: Math.floor(this.originalTextPos.y + dy),
    };

    // Only create command if position actually changed
    if (
      newPos.x !== this.originalTextPos.x ||
      newPos.y !== this.originalTextPos.y
    ) {
      // First, revert to original position (command will re-apply)
      animationStore.updateTextCelData(this.dragLayerId, currentFrameId, {
        x: this.originalTextPos.x,
        y: this.originalTextPos.y,
      });

      // Execute move command for undo/redo support
      historyStore.execute(
        new MoveTextCommand(
          this.dragLayerId,
          currentFrameId,
          this.originalTextPos,
          newPos
        )
      );
    }

    // Reset drag state
    this.isDragging = false;
    this.dragLayerId = null;
  }

  /**
   * Start dragging a text layer.
   */
  private startDragging(layerId: string, x: number, y: number): void {
    const currentFrameId = animationStore.currentFrameId.value;
    const textCelData = animationStore.getTextCelData(layerId, currentFrameId);

    if (!textCelData) return;

    this.isDragging = true;
    this.dragLayerId = layerId;
    this.dragStartPos = { x, y };
    this.originalTextPos = { x: textCelData.x, y: textCelData.y };

    // Set active layer
    layerStore.setActiveLayer(layerId);
  }

  onKeyDown(e: KeyboardEvent): void {
    const state = TextTool.editingState.value;

    if (!state.isEditing) return;

    // Handle escape to commit
    if (e.key === "Escape") {
      e.preventDefault();
      this.commitText();
    }
  }

  /**
   * Create a new text layer at the specified position.
   */
  private createTextLayer(x: number, y: number): void {
    const currentFrameId = animationStore.currentFrameId.value;
    const font = textSettings.font.value || defaultFontId;
    const color = colorStore.primaryColor.value;

    // Create the text layer with style data
    const layer = layerStore.addTextLayer(
      { font, color },
      undefined, // auto-generate name
      projectStore.width.value,
      projectStore.height.value
    );

    // Set initial text cel data (empty content at click position)
    animationStore.setTextCelData(layer.id, currentFrameId, {
      content: "",
      x: Math.floor(x),
      y: Math.floor(y),
    });

    // Start editing the new layer
    this.startEditing(layer.id, x, y);
  }

  /**
   * Start editing a text layer.
   */
  private startEditing(layerId: string, _x: number, _y: number): void {
    const currentFrameId = animationStore.currentFrameId.value;
    const celKey = animationStore.getCelKey(layerId, currentFrameId);
    const textCelData = animationStore.getTextCelData(layerId, currentFrameId);

    // Set active layer
    layerStore.setActiveLayer(layerId);

    // Update editing state
    TextTool.editingState.value = {
      isEditing: true,
      layerId,
      celKey,
      cursorPosition: textCelData?.content.length ?? 0,
      cursorVisible: true,
    };

    // Emit event for input component to focus
    this.emitEvent("start-editing", {
      layerId,
      celKey,
      initialContent: textCelData?.content ?? "",
    });
  }

  /**
   * Commit the current text and exit editing mode.
   */
  commitText(): void {
    const state = TextTool.editingState.value;

    if (!state.isEditing || !state.layerId) return;

    // Check if text is empty - if so, delete the layer
    const currentFrameId = animationStore.currentFrameId.value;
    const textCelData = animationStore.getTextCelData(
      state.layerId,
      currentFrameId
    );

    if (!textCelData?.content || textCelData.content.trim() === "") {
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

    // Emit event for input component to blur
    this.emitEvent("stop-editing");
  }

  /**
   * Update the text content for the current editing session.
   */
  static updateTextContent(content: string, cursorPosition: number): void {
    const state = TextTool.editingState.value;

    if (!state.isEditing || !state.layerId) return;

    const currentFrameId = animationStore.currentFrameId.value;
    const existingData = animationStore.getTextCelData(
      state.layerId,
      currentFrameId
    );

    if (existingData) {
      animationStore.updateTextCelData(state.layerId, currentFrameId, {
        content,
      });
    }

    // Update cursor position in state
    TextTool.editingState.value = {
      ...state,
      cursorPosition,
    };
  }

  /**
   * Toggle cursor visibility (for blinking).
   */
  static toggleCursorVisibility(): void {
    const state = TextTool.editingState.value;
    TextTool.editingState.value = {
      ...state,
      cursorVisible: !state.cursorVisible,
    };
  }

  /**
   * Find a text layer at the given canvas position.
   * Returns the layer ID if found, null otherwise.
   */
  private findTextLayerAtPosition(
    x: number,
    y: number
  ): { layerId: string } | null {
    const layers = layerStore.layers.value;
    const currentFrameId = animationStore.currentFrameId.value;

    // Check text layers from top to bottom (reverse order)
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.type !== "text" || !layer.visible || !layer.textData) continue;

      const textCelData = animationStore.getTextCelData(
        layer.id,
        currentFrameId
      );
      if (!textCelData || !textCelData.content) continue;

      // Get the font for accurate measurement
      const font = getFont(layer.textData.font) || getDefaultFont();
      const textWidth = measureText(textCelData.content, font);
      const textHeight = font.charHeight;

      const textX = textCelData.x;
      const textY = textCelData.y;

      // Hit test with padding for easier selection
      const hitPadding = 4;
      if (
        x >= textX - hitPadding &&
        y >= textY - hitPadding &&
        x <= textX + textWidth + hitPadding &&
        y <= textY + textHeight + hitPadding
      ) {
        return { layerId: layer.id };
      }
    }

    return null;
  }

  /**
   * Check if a double-click should start editing.
   * Called from the canvas component on dblclick.
   */
  static handleDoubleClick(layerId: string): boolean {
    const layer = layerStore.layers.value.find((l) => l.id === layerId);
    if (layer?.type !== "text") return false;

    // Trigger editing via event
    window.dispatchEvent(
      new CustomEvent("text-tool:edit-layer", {
        detail: { layerId },
      })
    );

    return true;
  }
}
