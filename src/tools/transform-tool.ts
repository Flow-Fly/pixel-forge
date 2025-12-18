import { BaseTool } from './base-tool';
import { selectionStore } from '../stores/selection';
import { historyStore } from '../stores/history';
import { layerStore } from '../stores/layers';
import { animationStore } from '../stores/animation';
import { TransformSelectionCommand } from '../commands/selection-commands';
import { MoveTextCommand } from '../commands/text-commands';

export class TransformTool extends BaseTool {
  name = 'transform';
  cursor = 'move';

  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private mode: 'move' | 'scale' | 'rotate' = 'move';

  // Text layer drag state
  private isDraggingText = false;
  private textLayerId: string | null = null;
  private originalTextPos = { x: 0, y: 0 };

  onDown(x: number, y: number) {
    // Check if active layer is a text layer
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find(l => l.id === activeLayerId);

    if (activeLayer?.type === 'text') {
      // Start dragging text layer
      const currentFrameId = animationStore.currentFrameId.value;
      const textCelData = animationStore.getTextCelData(activeLayerId, currentFrameId);

      if (textCelData) {
        this.isDraggingText = true;
        this.textLayerId = activeLayerId;
        this.startX = x;
        this.startY = y;
        this.originalTextPos = { x: textCelData.x, y: textCelData.y };
      }
      return;
    }

    // Handle selection-based transforms
    const state = selectionStore.state.value;
    if (state.type === 'none') return;

    // If we're in transforming state and click outside the selection, commit
    if (state.type === 'transforming') {
      if (!selectionStore.isPointInSelection(Math.floor(x), Math.floor(y))) {
        this.commitTransform();
        return;
      }
    }

    this.isDragging = true;
    this.startX = x;
    this.startY = y;

    // Determine mode based on where user clicked
    this.mode = 'move';
  }

  onDrag(x: number, y: number) {
    // Handle text layer dragging
    if (this.isDraggingText && this.textLayerId) {
      const currentFrameId = animationStore.currentFrameId.value;
      const dx = x - this.startX;
      const dy = y - this.startY;

      // Update text position in real-time for visual feedback
      animationStore.updateTextCelData(this.textLayerId, currentFrameId, {
        x: Math.floor(this.originalTextPos.x + dx),
        y: Math.floor(this.originalTextPos.y + dy),
      });
      return;
    }

    // Handle selection-based transforms
    if (!this.isDragging) return;

    const dx = x - this.startX;
    const dy = y - this.startY;

    if (this.mode === 'move') {
      const state = selectionStore.state.value;
      if (state.type === 'floating') {
        // Move floating selection
        selectionStore.moveFloat(dx, dy);
      } else if (state.type === 'transforming') {
        // Move selection during rotation
        selectionStore.moveTransform(dx, dy);
      }
      // For 'selected' state, would need to cut to float first
    }

    this.startX = x;
    this.startY = y;
  }

  onUp(x: number, y: number) {
    // Handle text layer drag completion
    if (this.isDraggingText && this.textLayerId) {
      const currentFrameId = animationStore.currentFrameId.value;
      const dx = x - this.startX;
      const dy = y - this.startY;

      const newPos = {
        x: Math.floor(this.originalTextPos.x + dx),
        y: Math.floor(this.originalTextPos.y + dy),
      };

      // Only create command if position actually changed
      if (newPos.x !== this.originalTextPos.x || newPos.y !== this.originalTextPos.y) {
        // First, revert to original position (command will re-apply)
        animationStore.updateTextCelData(this.textLayerId, currentFrameId, {
          x: this.originalTextPos.x,
          y: this.originalTextPos.y,
        });

        // Execute move command for undo/redo support
        historyStore.execute(
          new MoveTextCommand(
            this.textLayerId,
            currentFrameId,
            this.originalTextPos,
            newPos
          )
        );
      }

      // Reset text drag state
      this.isDraggingText = false;
      this.textLayerId = null;
      return;
    }

    this.isDragging = false;
  }

  onKeyDown(e: KeyboardEvent) {
    const state = selectionStore.state.value;

    if (state.type === 'transforming') {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitTransform();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        selectionStore.cancelTransform();
      }
    }
  }

  private commitTransform() {
    const transformState = selectionStore.getTransformState();
    if (!transformState) return;

    const { imageData, originalBounds, currentBounds, currentOffset, rotation, scale, shape, mask } = transformState;

    // If no transform and no movement, just cancel (no change)
    const hasRotation = rotation !== 0;
    const hasScale = scale.x !== 1 || scale.y !== 1;
    const hasMovement = currentOffset.x !== 0 || currentOffset.y !== 0;

    if (!hasRotation && !hasScale && !hasMovement) {
      selectionStore.cancelTransform();
      return;
    }

    // Use already-computed preview data (scaled + rotated)
    const transformedImageData = selectionStore.getTransformPreview();
    if (!transformedImageData) {
      selectionStore.cancelTransform();
      return;
    }

    // Get the active layer's canvas
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find(l => l.id === activeLayerId);
    if (!activeLayer?.canvas) {
      console.error('Active layer canvas not found');
      selectionStore.cancelTransform();
      return;
    }

    const canvas = activeLayer.canvas;

    // Create and execute the transform command (with offset for movement during transform)
    const command = new TransformSelectionCommand(
      canvas,
      imageData,
      originalBounds,
      transformedImageData,
      currentBounds,
      rotation,
      scale,
      shape,
      mask,
      currentOffset
    );

    historyStore.execute(command);
  }
}
