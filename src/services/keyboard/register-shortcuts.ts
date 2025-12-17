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
  FillSelectionCommand,
} from "../../commands/selection-commands";
import { colorStore } from "../../stores/colors";
import { animationStore } from "../../stores/animation";
import { viewportStore } from "../../stores/viewport";
import { panelStore } from "../../stores/panels";
import { shapeStore } from "../../stores/shape";
import { guidesStore } from "../../stores/guides";
import { AddFrameCommand } from "../../commands/animation-commands";
import {
  GroupLayersCommand,
  UngroupLayersCommand,
} from "../../commands/layer-commands";
import { toolRegistry } from "../../tools/tool-registry";
import { canCaptureBrush, captureBrushAndAdd } from "../brush-capture";
import { MOD_PRIMARY } from "../../utils/platform";
import { getToolSize, setToolSize } from "../../stores/tool-settings";
import { clipboardStore } from "../../stores/clipboard";

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

  // Alt = Eyedropper (quick) - but NOT when using selection tools (they use Alt for subtract mode)
  keyboardService.register(
    "Alt",
    [],
    () => {
      // Don't activate quick eyedropper when using selection tools
      // Selection tools use Alt for subtract mode
      const currentTool = toolStore.activeTool.value;
      const isSelectionTool = [
        "marquee-rect",
        "lasso",
        "polygonal-lasso",
        "magic-wand",
      ].includes(currentTool);
      if (!isSelectionTool) {
        toolStore.setQuickTool("eyedropper");
      }
    },
    "Quick eyedropper",
    {
      quick: true,
      releaseAction: () => {
        // Only restore if we actually switched to eyedropper
        if (toolStore.activeTool.value === "eyedropper") {
          toolStore.restorePreviousTool();
        }
      },
    }
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

  // 0 = Fit to window (reset view)
  keyboardService.register(
    "0",
    [],
    () => viewportStore.resetView(),
    "Fit to window"
  );

  // 1-6 = Zoom levels (Aseprite style)
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

  // ============================================
  // OPACITY SHORTCUTS (Mod + number keys)
  // ============================================

  // Mod+1-9 = Set brush opacity 10%-90%
  for (let i = 1; i <= 9; i++) {
    const opacity = i * 10;
    keyboardService.register(
      String(i),
      [MOD_PRIMARY],
      () => brushStore.setOpacity(opacity),
      `Opacity ${opacity}%`
    );
  }
  // Mod+0 = 100% opacity
  keyboardService.register(
    "0",
    [MOD_PRIMARY],
    () => brushStore.setOpacity(100),
    "Opacity 100%"
  );

  // ============================================
  // BRUSH SIZE SHORTCUTS
  // ============================================

  // [ = Decrease brush size
  keyboardService.register(
    "[",
    [],
    () => {
      const tool = toolStore.activeTool.value;
      const currentSize = getToolSize(tool);
      setToolSize(tool, Math.max(1, currentSize - 1));
    },
    "Decrease brush size"
  );

  // ] = Increase brush size
  keyboardService.register(
    "]",
    [],
    () => {
      const tool = toolStore.activeTool.value;
      const currentSize = getToolSize(tool);
      setToolSize(tool, currentSize + 1);
    },
    "Increase brush size"
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
      const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
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
  // FILL & STROKE
  // ============================================

  // F = Fill selection with foreground color
  keyboardService.register(
    "f",
    [],
    () => {
      const state = selectionStore.state.value;
      if (state.type === "selected") {
        const activeLayerId = layerStore.activeLayerId.value;
        const layer = layerStore.layers.value.find(
          (l) => l.id === activeLayerId
        );
        if (!layer?.canvas) return;

        const fillColor = colorStore.primaryColor.value;
        const mask =
          state.shape === "freeform"
            ? (state as { mask: Uint8Array }).mask
            : undefined;

        const command = new FillSelectionCommand(
          layer.canvas,
          state.bounds,
          state.shape,
          fillColor,
          mask
        );
        historyStore.execute(command);
      }
    },
    "Fill selection"
  );

  // ============================================
  // EDIT SHORTCUTS
  // ============================================

  // Undo: Mod+Z
  keyboardService.register(
    "z",
    [MOD_PRIMARY],
    () => historyStore.undo(),
    "Undo"
  );

  // Redo: Mod+Shift+Z (also Ctrl+Y on Windows for compatibility)
  keyboardService.register(
    "z",
    [MOD_PRIMARY, "shift"],
    () => historyStore.redo(),
    "Redo"
  );
  keyboardService.register("y", ["ctrl"], () => historyStore.redo(), "Redo");

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

  // Mod+D = Deselect
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
  keyboardService.register("d", [MOD_PRIMARY], deselect, "Deselect");

  // Mod+A = Select all
  const selectAll = () => {
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    selectionStore.state.value = {
      type: "selected",
      shape: "rectangle",
      bounds: { x: 0, y: 0, width, height },
    };
  };
  keyboardService.register("a", [MOD_PRIMARY], selectAll, "Select all");

  // Mod+Shift+D = Reselect (restore last selection)
  const reselect = () => {
    selectionStore.reselect();
  };
  keyboardService.register("d", [MOD_PRIMARY, "shift"], reselect, "Reselect");

  // Ctrl+Shift+T = Select cel bounds (non-transparent content)
  // Uses Ctrl (not Mod) to avoid Cmd+T conflict on Mac (new tab in browsers)
  const selectCelBounds = () => {
    const activeLayerId = layerStore.activeLayerId.value;
    if (!activeLayerId) return;

    const currentFrameId = animationStore.currentFrameId.value;
    const canvas = animationStore.getCelCanvas(currentFrameId, activeLayerId);
    if (!canvas) return;

    // Use the selection store's selectLayerContent method
    // Clear selection if no content found
    if (!selectionStore.selectLayerContent(canvas)) {
      selectionStore.clear();
    }
  };
  keyboardService.register("t", ["ctrl", "shift"], selectCelBounds, "Select cel bounds");

  // ============================================
  // CLIPBOARD SHORTCUTS
  // ============================================

  // Mod+C = Copy selection
  const copySelection = () => {
    const state = selectionStore.state.value;
    if (state.type !== "selected") return;

    const activeLayerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
    if (!layer?.canvas) return;

    const ctx = layer.canvas.getContext("2d");
    if (!ctx) return;

    // Get pixels from selection bounds
    const { bounds, shape } = state;
    const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);

    // Apply mask if freeform selection
    if (shape === "freeform" && "mask" in state) {
      const mask = (state as { mask: Uint8Array }).mask;
      const data = imageData.data;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 0) {
          // Clear pixels outside mask
          data[i * 4 + 3] = 0;
        }
      }
    }

    clipboardStore.setData({
      imageData,
      shape: shape as "rectangle" | "ellipse" | "freeform",
      mask: shape === "freeform" ? (state as { mask: Uint8Array }).mask : undefined,
      width: bounds.width,
      height: bounds.height,
    });
  };
  keyboardService.register("c", [MOD_PRIMARY], copySelection, "Copy");

  // Mod+X = Cut selection
  const cutSelection = () => {
    const state = selectionStore.state.value;
    if (state.type !== "selected") return;

    // First copy
    copySelection();

    // Then delete
    const activeLayerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
    if (!layer?.canvas) return;

    const command = new DeleteSelectionCommand(
      layer.canvas,
      state.bounds,
      state.shape,
      state.shape === "freeform" ? (state as { mask: Uint8Array }).mask : undefined
    );
    historyStore.execute(command);
  };
  keyboardService.register("x", [MOD_PRIMARY], cutSelection, "Cut");

  // Mod+V = Paste
  const pasteSelection = () => {
    const data = clipboardStore.getData();
    if (!data) return;

    const activeLayerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
    if (!layer?.canvas) return;

    // Commit any existing floating selection first
    const currentState = selectionStore.state.value;
    if (currentState.type === "floating") {
      const command = new CommitFloatCommand(
        layer.canvas,
        layer.id,
        currentState.imageData,
        currentState.originalBounds,
        currentState.currentOffset,
        currentState.shape,
        currentState.mask
      );
      historyStore.execute(command);
    }

    // Paste at center of viewport or at origin
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;
    const pasteX = Math.floor((canvasWidth - data.width) / 2);
    const pasteY = Math.floor((canvasHeight - data.height) / 2);

    // Create floating selection with pasted data
    selectionStore.state.value = {
      type: "floating",
      shape: data.shape,
      imageData: data.imageData,
      originalBounds: { x: pasteX, y: pasteY, width: data.width, height: data.height },
      currentOffset: { x: 0, y: 0 },
      mask: data.mask,
    };
  };
  keyboardService.register("v", [MOD_PRIMARY], pasteSelection, "Paste");

  // Ctrl+Shift+I = Invert selection (using Ctrl instead of Mod to avoid Mac Cmd+Shift+I conflict with Safari)
  const invertSelection = () => {
    const state = selectionStore.state.value;
    if (state.type !== "selected") return;

    const width = projectStore.width.value;
    const height = projectStore.height.value;
    selectionStore.invertSelection(width, height);
  };
  keyboardService.register("i", ["ctrl", "shift"], invertSelection, "Invert selection");

  // Mod+Shift+B = Toggle Pixel Perfect Mode
  keyboardService.register(
    "b",
    [MOD_PRIMARY, "shift"],
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

  // Ctrl+N = New Project (Cmd+N conflicts with browser on Mac)
  const openNewProjectDialog = () => {
    window.dispatchEvent(new CustomEvent("show-new-project-dialog"));
  };
  keyboardService.register("n", ["ctrl"], openNewProjectDialog, "New project");

  // Mod+O = Open file
  const openFile = () => {
    window.dispatchEvent(new CustomEvent("show-open-file-dialog"));
  };
  keyboardService.register("o", [MOD_PRIMARY], openFile, "Open project");

  // Mod+E = Export
  const showExport = () => {
    window.dispatchEvent(new CustomEvent("show-export-dialog"));
  };
  keyboardService.register("e", [MOD_PRIMARY], showExport, "Export");

  // C = Canvas Resize / Crop
  const openResizeDialog = () => {
    window.dispatchEvent(new CustomEvent("show-resize-dialog"));
  };
  keyboardService.register("c", [], openResizeDialog, "Canvas resize");

  // ============================================
  // BRUSH SHORTCUTS
  // ============================================

  // Mod+B = Capture brush from selection
  const captureBrush = async () => {
    if (!canCaptureBrush()) {
      console.log("No selection to capture as brush");
      return;
    }
    await captureBrushAndAdd();
  };
  keyboardService.register(
    "b",
    [MOD_PRIMARY],
    captureBrush,
    "Capture brush from selection"
  );

  // ============================================
  // LAYER SHORTCUTS
  // ============================================

  // Mod+G = Group layers
  const groupLayers = () => {
    const activeLayerId = layerStore.activeLayerId.value;
    if (!activeLayerId) return;

    const activeLayer = layerStore.layers.value.find(
      (l) => l.id === activeLayerId
    );
    if (!activeLayer) return;

    // Don't group if already a group or inside a group
    if (activeLayer.type === "group") return;

    // For now, group just the active layer
    // TODO: Support multi-selection when layer multi-select is implemented
    const command = new GroupLayersCommand([activeLayerId]);
    historyStore.execute(command);
  };
  keyboardService.register("g", [MOD_PRIMARY], groupLayers, "Group layers");

  // Mod+Shift+G = Ungroup layers
  const ungroupLayers = () => {
    const activeLayerId = layerStore.activeLayerId.value;
    if (!activeLayerId) return;

    const activeLayer = layerStore.layers.value.find(
      (l) => l.id === activeLayerId
    );
    if (!activeLayer) return;

    // If active layer is a group, ungroup it
    if (activeLayer.type === "group") {
      const command = new UngroupLayersCommand(activeLayerId);
      historyStore.execute(command);
      return;
    }

    // If active layer is inside a group, ungroup the parent
    if (activeLayer.parentId) {
      const parentGroup = layerStore.layers.value.find(
        (l) => l.id === activeLayer.parentId
      );
      if (parentGroup && parentGroup.type === "group") {
        const command = new UngroupLayersCommand(parentGroup.id);
        historyStore.execute(command);
      }
    }
  };
  keyboardService.register(
    "g",
    [MOD_PRIMARY, "shift"],
    ungroupLayers,
    "Ungroup layers"
  );

  // ============================================
  // HELP SHORTCUTS
  // ============================================

  // ? = Show keyboard shortcuts dialog
  keyboardService.register(
    "?",
    [],
    () => {
      window.dispatchEvent(new CustomEvent("show-keyboard-shortcuts-dialog"));
    },
    "Keyboard shortcuts"
  );
}
