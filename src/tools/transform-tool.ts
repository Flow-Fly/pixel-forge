import { BaseTool } from './base-tool';
import { TransformSelectionCommand } from '../commands/selection-commands';
import { MoveTextCommand } from '../commands/text-commands';
import { log } from '../utils/log';

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
    const { animation, layers, selection } = this.projectContext;
    // Check if active layer is a text layer
    const activeLayerId = layers.activeLayerId.value;
    const activeLayer = layers.layers.value.find(l => l.id === activeLayerId);

    if (activeLayer?.type === 'text' && activeLayerId) {
      // Start dragging text layer
      const currentFrameId = animation.currentFrameId.value;
      if (!currentFrameId) return;
      const textCelData = animation.getTextCelData(activeLayerId, currentFrameId);

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
    const state = selection.state.value;
    if (state.type === 'none') return;

    // If we're in transforming state and click outside the selection, commit
    if (state.type === 'transforming') {
      if (!selection.isPointInSelection(Math.floor(x), Math.floor(y))) {
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
    const { animation, selection } = this.projectContext;
    // Handle text layer dragging
    if (this.isDraggingText && this.textLayerId) {
      const currentFrameId = animation.currentFrameId.value;
      const dx = x - this.startX;
      const dy = y - this.startY;

      // Update text position in real-time for visual feedback
      animation.updateTextCelData(this.textLayerId, currentFrameId, {
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
      const state = selection.state.value;
      if (state.type === 'floating') {
        // Move floating selection
        selection.moveFloat(dx, dy);
      } else if (state.type === 'transforming') {
        // Move selection during rotation
        selection.moveTransform(dx, dy);
      }
      // For 'selected' state, would need to cut to float first
    }

    this.startX = x;
    this.startY = y;
  }

  onUp(x: number, y: number) {
    const { animation, history } = this.projectContext;
    // Handle text layer drag completion
    if (this.isDraggingText && this.textLayerId) {
      const currentFrameId = animation.currentFrameId.value;
      const dx = x - this.startX;
      const dy = y - this.startY;

      const newPos = {
        x: Math.floor(this.originalTextPos.x + dx),
        y: Math.floor(this.originalTextPos.y + dy),
      };

      // Only create command if position actually changed
      if (newPos.x !== this.originalTextPos.x || newPos.y !== this.originalTextPos.y) {
        // First, revert to original position (command will re-apply)
        animation.updateTextCelData(this.textLayerId, currentFrameId, {
          x: this.originalTextPos.x,
          y: this.originalTextPos.y,
        });

        // Execute move command for undo/redo support
        history.execute(
          new MoveTextCommand(
            this.textLayerId,
            currentFrameId,
            this.originalTextPos,
            newPos,
            this.projectContext
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
    const selection = this.projectContext.selection;
    const state = selection.state.value;

    if (state.type === 'transforming') {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitTransform();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        selection.cancelTransform();
      }
    }
  }

  private commitTransform() {
    const { history, layers, selection } = this.projectContext;
    const transformState = selection.getTransformState();
    if (!transformState) return;

    const { imageData, originalBounds, currentBounds, currentOffset, rotation, scale, shape, mask } = transformState;

    // If no transform and no movement, just cancel (no change)
    const hasRotation = rotation !== 0;
    const hasScale = scale.x !== 1 || scale.y !== 1;
    const hasMovement = currentOffset.x !== 0 || currentOffset.y !== 0;

    if (!hasRotation && !hasScale && !hasMovement) {
      selection.cancelTransform();
      return;
    }

    // Use already-computed preview data (scaled + rotated)
    const transformedImageData = selection.getTransformPreview();
    if (!transformedImageData) {
      selection.cancelTransform();
      return;
    }

    // Get the active layer's canvas
    const activeLayerId = layers.activeLayerId.value;
    const activeLayer = layers.layers.value.find(l => l.id === activeLayerId);
    if (!activeLayer?.canvas) {
      log.error('Active layer canvas not found');
      selection.cancelTransform();
      return;
    }

    // Create and execute the transform command (with offset for movement during transform)
    const command = new TransformSelectionCommand(
      activeLayer.id,
      this.projectContext.animation.currentFrameId.value,
      imageData,
      originalBounds,
      transformedImageData,
      currentBounds,
      rotation,
      scale,
      shape,
      mask,
      currentOffset,
      this.projectContext
    );

    history.execute(command);
  }
}
