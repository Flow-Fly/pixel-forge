import { keyboardService } from "./shortcuts";
import { toolStore, type ToolType } from "../../stores/tools";
import { historyStore } from "../../stores/history";
import { brushStore } from "../../stores/brush";
import { selectionStore } from "../../stores/selection";
import { layerStore } from "../../stores/layers";
import { projectStore } from "../../stores/project";
import {
  DeleteSelectionCommand,
  CommitFloatCommand,
} from "../../commands/selection-commands";
import { colorStore } from "../../stores/colors";
import { animationStore } from "../../stores/animation";
import { viewportStore } from "../../stores/viewport";
import { panelStore } from "../../stores/panels";
import { shapeStore } from "../../stores/shape";
import { AddFrameCommand } from "../../commands/animation-commands";

export function registerShortcuts() {
  // ============================================
  // TOOL SHORTCUTS (Aseprite-compatible)
  // ============================================

  const tools: Array<{ key: string; tool: ToolType; shift?: boolean }> = [
    { key: "b", tool: "pencil" },
    { key: "e", tool: "eraser" },
    { key: "i", tool: "eyedropper" },
    { key: "g", tool: "fill" },
    { key: "g", tool: "gradient", shift: true }, // Shift+G
    { key: "l", tool: "line" }, // Was lasso, now line (Aseprite)
    { key: "q", tool: "lasso" }, // Moved from L to Q (Aseprite)
    { key: "u", tool: "rectangle" }, // Was line, now rectangle (Aseprite)
    { key: "m", tool: "marquee-rect" },
    { key: "w", tool: "magic-wand" },
    { key: "v", tool: "transform" }, // Was T, now V (Aseprite)
    { key: "h", tool: "hand" }, // Pan tool
    { key: "z", tool: "zoom" }, // Zoom tool
  ];

  for (const { key, tool, shift } of tools) {
    const modifiers = shift ? ["shift"] : [];
    keyboardService.register(
      key,
      modifiers,
      () => toolStore.setActiveTool(tool),
      `${tool} tool`
    );
  }

  // Shift+U for ellipse (Aseprite uses U to cycle, we use Shift+U)
  keyboardService.register(
    "u",
    ["shift"],
    () => toolStore.setActiveTool("ellipse"),
    "ellipse tool"
  );

  // ============================================
  // QUICK TOOLS (hold to temporarily switch)
  // ============================================

  // Alt = Eyedropper (quick)
  keyboardService.register(
    "Alt",
    [],
    () => toolStore.setQuickTool("eyedropper"),
    "Quick eyedropper",
    { quick: true, releaseAction: () => toolStore.restorePreviousTool() }
  );

  // Space = Hand/Pan (quick) - handled by viewport, but register for consistency
  // Note: Space is already handled in pf-canvas-viewport for panning
  // We register it here to ensure quick-tool state is tracked
  keyboardService.register(
    " ",
    [],
    () => toolStore.setQuickTool("hand"),
    "Quick pan",
    { quick: true, releaseAction: () => toolStore.restorePreviousTool() }
  );

  // ============================================
  // COLOR SHORTCUTS
  // ============================================

  // X = Swap foreground/background colors
  keyboardService.register(
    "x",
    [],
    () => colorStore.swapColors(),
    "Swap colors"
  );

  // ============================================
  // VIEW & NAVIGATION
  // ============================================

  // 1-6 = Zoom levels
  keyboardService.register(
    "1",
    [],
    () => viewportStore.zoomToLevel(1),
    "Zoom 100%"
  );
  keyboardService.register(
    "2",
    [],
    () => viewportStore.zoomToLevel(2),
    "Zoom 200%"
  );
  keyboardService.register(
    "3",
    [],
    () => viewportStore.zoomToLevel(3),
    "Zoom 400%"
  );
  keyboardService.register(
    "4",
    [],
    () => viewportStore.zoomToLevel(4),
    "Zoom 800%"
  );
  keyboardService.register(
    "5",
    [],
    () => viewportStore.zoomToLevel(5),
    "Zoom 1600%"
  );
  keyboardService.register(
    "6",
    [],
    () => viewportStore.zoomToLevel(6),
    "Zoom 3200%"
  );

  // Tab = Toggle timeline
  keyboardService.register(
    "Tab",
    [],
    () => panelStore.togglePanel("timeline"),
    "Toggle timeline"
  );

  // ============================================
  // ANIMATION / FRAME NAVIGATION
  // ============================================

  // Arrow keys = Previous/Next frame
  keyboardService.register(
    "ArrowLeft",
    [],
    () => animationStore.prevFrame(),
    "Previous frame"
  );
  keyboardService.register(
    "ArrowRight",
    [],
    () => animationStore.nextFrame(),
    "Next frame"
  );

  // Home/End = First/Last frame
  keyboardService.register(
    "Home",
    [],
    () => animationStore.goToFirstFrame(),
    "First frame"
  );
  keyboardService.register(
    "End",
    [],
    () => animationStore.goToLastFrame(),
    "Last frame"
  );

  // Enter = Play/Stop animation
  keyboardService.register(
    "Enter",
    [],
    () => animationStore.togglePlayback(),
    "Play/Stop"
  );

  // Alt+N = New frame
  keyboardService.register(
    "n",
    ["alt"],
    () => {
      historyStore.execute(new AddFrameCommand(true));
    },
    "New frame"
  );

  // ============================================
  // SHAPE OPTIONS
  // ============================================

  // F = Toggle filled shape (when shape tool is active)
  keyboardService.register(
    "f",
    [],
    () => {
      const tool = toolStore.activeTool.value;
      if (tool === "rectangle" || tool === "ellipse" || tool === "line") {
        shapeStore.toggleFilled();
      }
    },
    "Toggle filled shape"
  );

  // ============================================
  // EDIT SHORTCUTS
  // ============================================

  // Undo: Ctrl+Z / Cmd+Z
  keyboardService.register("z", ["ctrl"], () => historyStore.undo(), "Undo");
  keyboardService.register("z", ["meta"], () => historyStore.undo(), "Undo");

  // Redo: Ctrl+Y, Ctrl+Shift+Z, Cmd+Shift+Z
  keyboardService.register("y", ["ctrl"], () => historyStore.redo(), "Redo");
  keyboardService.register(
    "z",
    ["ctrl", "shift"],
    () => historyStore.redo(),
    "Redo"
  );
  keyboardService.register(
    "z",
    ["meta", "shift"],
    () => historyStore.redo(),
    "Redo"
  );

  // Big Pixel Mode: Ctrl+Shift+B / Cmd+Shift+B
  //keyboardService.register('b', ['ctrl', 'shift'], () => brushStore.toggleBigPixelMode(), 'Toggle Big Pixel Mode');
  //keyboardService.register('b', ['meta', 'shift'], () => brushStore.toggleBigPixelMode(), 'Toggle Big Pixel Mode');

  // ============================================
  // SELECTION SHORTCUTS
  // ============================================

  // Enter = Commit floating selection
  keyboardService.register(
    "Enter",
    [],
    () => {
      const state = selectionStore.state.value;
      if (state.type === "floating") {
        const activeLayerId = layerStore.activeLayerId.value;
        const layer = layerStore.layers.value.find(
          (l) => l.id === activeLayerId
        );
        if (!layer?.canvas) return;

        const command = new CommitFloatCommand(
          layer.canvas,
          layer.id,
          state.imageData,
          state.originalBounds,
          state.currentOffset,
          state.shape,
          state.mask
        );
        historyStore.execute(command);
      }
    },
    "Commit selection"
  );

  // Escape = Cancel floating selection (undo cut) or clear selection
  keyboardService.register(
    "Escape",
    [],
    () => {
      const state = selectionStore.state.value;
      if (state.type === "floating") {
        historyStore.undo();
      } else if (state.type === "selected" || state.type === "selecting") {
        selectionStore.clear();
      }
    },
    "Cancel selection"
  );

  // Delete = Delete selected pixels
  keyboardService.register(
    "Delete",
    [],
    () => {
      const state = selectionStore.state.value;
      if (state.type === "selected") {
        const activeLayerId = layerStore.activeLayerId.value;
        const layer = layerStore.layers.value.find(
          (l) => l.id === activeLayerId
        );
        if (!layer?.canvas) return;

        const command = new DeleteSelectionCommand(
          layer.canvas,
          state.bounds,
          state.shape,
          state.shape === "freeform"
            ? (state as { mask: Uint8Array }).mask
            : undefined
        );
        historyStore.execute(command);
      }
    },
    "Delete selection"
  );

  // Backspace = Delete selected pixels (alternative)
  keyboardService.register(
    "Backspace",
    [],
    () => {
      const state = selectionStore.state.value;
      if (state.type === "selected") {
        const activeLayerId = layerStore.activeLayerId.value;
        const layer = layerStore.layers.value.find(
          (l) => l.id === activeLayerId
        );
        if (!layer?.canvas) return;

        const command = new DeleteSelectionCommand(
          layer.canvas,
          state.bounds,
          state.shape,
          state.shape === "freeform"
            ? (state as { mask: Uint8Array }).mask
            : undefined
        );
        historyStore.execute(command);
      }
    },
    "Delete selection"
  );

  // Ctrl+D / Cmd+D = Deselect
  const deselect = () => {
    const state = selectionStore.state.value;
    if (state.type === "floating") {
      // Commit first, then clear
      const activeLayerId = layerStore.activeLayerId.value;
      const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
      if (layer?.canvas) {
        const command = new CommitFloatCommand(
          layer.canvas,
          layer.id,
          state.imageData,
          state.originalBounds,
          state.currentOffset,
          state.shape,
          state.mask
        );
        historyStore.execute(command);
      }
    } else {
      selectionStore.clear();
    }
  };
  keyboardService.register("d", ["ctrl"], deselect, "Deselect");
  keyboardService.register("d", ["meta"], deselect, "Deselect");

  // Ctrl+A / Cmd+A = Select all
  const selectAll = () => {
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    selectionStore.state.value = {
      type: "selected",
      shape: "rectangle",
      bounds: { x: 0, y: 0, width, height },
    };
  };
  keyboardService.register("a", ["ctrl"], selectAll, "Select all");
  keyboardService.register("a", ["meta"], selectAll, "Select all");
  // Big Pixel Mode: Ctrl+Shift+B / Cmd+Shift+B (toggle pixelPerfect on active brush)
  keyboardService.register(
    "b",
    ["ctrl", "shift"],
    () => {
      const currentBrush = brushStore.activeBrush.value;
      brushStore.updateActiveBrushSettings({
        pixelPerfect: !currentBrush.pixelPerfect,
      });
    },
    "Toggle Pixel Perfect Mode"
  );
  keyboardService.register(
    "b",
    ["meta", "shift"],
    () => {
      const currentBrush = brushStore.activeBrush.value;
      brushStore.updateActiveBrushSettings({
        pixelPerfect: !currentBrush.pixelPerfect,
      });
    },
    "Toggle Pixel Perfect Mode"
  );
}
