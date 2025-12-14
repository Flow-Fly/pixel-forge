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
  CutToFloatCommand,
} from "../../commands/selection-commands";
import { colorStore } from "../../stores/colors";
import { animationStore } from "../../stores/animation";
import { viewportStore } from "../../stores/viewport";
import { panelStore } from "../../stores/panels";
import { shapeStore } from "../../stores/shape";
import { guidesStore } from "../../stores/guides";
import { AddFrameCommand } from "../../commands/animation-commands";
import { toolRegistry } from "../../tools/tool-registry";
import { canCaptureBrush, captureBrushAndAdd } from "../brush-capture";

export function registerShortcuts() {
  // ============================================
  // TOOL SHORTCUTS (from tool registry)
  // ============================================

  // Register shortcuts dynamically from tool registry
  for (const [toolName, meta] of Object.entries(toolRegistry)) {
    const shortcutKey = meta.shortcutKey;
    if (!shortcutKey) continue;

    // Parse shortcut key (e.g., "shift+G" -> key: "g", modifiers: ["shift"])
    const parts = shortcutKey.toLowerCase().split("+");
    const key = parts.pop() || "";
    const modifiers = parts; // Any remaining parts are modifiers

    keyboardService.register(
      key,
      modifiers,
      () => toolStore.setActiveTool(toolName as ToolType),
      `${meta.name} tool`
    );
  }

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

  // Shift+G = Toggle guide visibility
  keyboardService.register(
    "g",
    ["shift"],
    () => guidesStore.toggleVisibility(),
    "Toggle guides"
  );

  // ============================================
  // ANIMATION / FRAME NAVIGATION
  // ============================================

  // Helper: Move selection by arrow key (auto-floats if needed)
  const moveSelectionByArrow = (dx: number, dy: number) => {
    const state = selectionStore.state.value;

    if (state.type === "selected") {
      // Auto-float: cut pixels first, then move
      const activeLayerId = layerStore.activeLayerId.value;
      const layer = layerStore.layers.value.find(
        (l) => l.id === activeLayerId
      );
      if (!layer?.canvas) return;

      const mask =
        state.shape === "freeform"
          ? (state as { mask: Uint8Array }).mask
          : undefined;

      const cutCommand = new CutToFloatCommand(
        layer.canvas,
        layer.id,
        state.bounds,
        state.shape,
        mask
      );
      historyStore.execute(cutCommand);

      // Now move the floating selection
      selectionStore.moveFloat(dx, dy);
    } else if (state.type === "floating") {
      // Already floating, just move
      selectionStore.moveFloat(dx, dy);
    } else if (state.type === "transforming") {
      // In transforming state (rotation mode), use moveTransform
      selectionStore.moveTransform(dx, dy);
    }
  };

  // Arrow keys = Move selection (if active) or Previous/Next frame
  keyboardService.register(
    "ArrowLeft",
    [],
    () => {
      if (selectionStore.isActive) {
        moveSelectionByArrow(-1, 0);
      } else {
        animationStore.prevFrame();
      }
    },
    "Move selection left / Previous frame"
  );
  keyboardService.register(
    "ArrowRight",
    [],
    () => {
      if (selectionStore.isActive) {
        moveSelectionByArrow(1, 0);
      } else {
        animationStore.nextFrame();
      }
    },
    "Move selection right / Next frame"
  );
  keyboardService.register(
    "ArrowUp",
    [],
    () => {
      if (selectionStore.isActive) {
        moveSelectionByArrow(0, -1);
      }
    },
    "Move selection up"
  );
  keyboardService.register(
    "ArrowDown",
    [],
    () => {
      if (selectionStore.isActive) {
        moveSelectionByArrow(0, 1);
      }
    },
    "Move selection down"
  );

  // Shift+Arrow = Move selection by 10px
  keyboardService.register(
    "ArrowLeft",
    ["shift"],
    () => {
      if (selectionStore.isActive) {
        moveSelectionByArrow(-10, 0);
      }
    },
    "Move selection left 10px"
  );
  keyboardService.register(
    "ArrowRight",
    ["shift"],
    () => {
      if (selectionStore.isActive) {
        moveSelectionByArrow(10, 0);
      }
    },
    "Move selection right 10px"
  );
  keyboardService.register(
    "ArrowUp",
    ["shift"],
    () => {
      if (selectionStore.isActive) {
        moveSelectionByArrow(0, -10);
      }
    },
    "Move selection up 10px"
  );
  keyboardService.register(
    "ArrowDown",
    ["shift"],
    () => {
      if (selectionStore.isActive) {
        moveSelectionByArrow(0, 10);
      }
    },
    "Move selection down 10px"
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

  // ============================================
  // FILE SHORTCUTS
  // ============================================

  // Ctrl+N / Cmd+N = New Project
  const openNewProjectDialog = () => {
    window.dispatchEvent(new CustomEvent('show-new-project-dialog'));
  };
  keyboardService.register("n", ["ctrl"], openNewProjectDialog, "New project");
  keyboardService.register("n", ["meta"], openNewProjectDialog, "New project");

  // ============================================
  // BRUSH SHORTCUTS
  // ============================================

  // Ctrl+B / Cmd+B = Capture brush from selection
  const captureBrush = async () => {
    if (!canCaptureBrush()) {
      console.log("No selection to capture as brush");
      return;
    }
    await captureBrushAndAdd();
  };
  keyboardService.register("b", ["ctrl"], captureBrush, "Capture brush from selection");
  keyboardService.register("b", ["meta"], captureBrush, "Capture brush from selection");
}
