import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { animationStore } from "../../src/stores/animation";
import { colorStore } from "../../src/stores/colors";
import { dirtyRectStore } from "../../src/stores/dirty-rect";
import { gridStore } from "../../src/stores/grid";
import { guidesStore } from "../../src/stores/guides";
import { historyStore } from "../../src/stores/history";
import { historyHighlightStore } from "../../src/stores/history-highlight";
import { layerStore } from "../../src/stores/layers";
import { paletteStore } from "../../src/stores/palette";
import { projectStore } from "../../src/stores/project";
import {
  createProjectContext,
  defaultProjectContext,
} from "../../src/stores/project-context";
import { selectionStore } from "../../src/stores/selection";
import { viewportStore } from "../../src/stores/viewport";

const paletteWithLightnessVariations = {
  getLightnessVariations() {
    return [
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
      "#777777",
    ];
  },
};

function createTestContext(width: number, height: number) {
  return createProjectContext({
    colorPalette: paletteWithLightnessVariations,
    viewportCanvasSize: {
      width: { value: width },
      height: { value: height },
    },
  });
}

describe("ProjectContext", () => {
  it("creates isolated layer, dirty rect, and guide stores", () => {
    const contextA = createTestContext(100, 80);
    const contextB = createTestContext(20, 20);
    const contextBLayerCount = contextB.layers.layers.value.length;

    contextA.layers.addLayer("Only A", 8, 8);
    contextA.dirtyRect.markDirty({ x: 0, y: 0, width: 2, height: 2 });
    contextA.guides.setVerticalGuide(12);

    expect(contextA.layers.layers.value).toHaveLength(contextBLayerCount + 1);
    expect(contextB.layers.layers.value).toHaveLength(contextBLayerCount);
    expect(contextA.dirtyRect.consumePendingDirty()).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
    expect(contextB.dirtyRect.consumePendingDirty()).toBeNull();
    expect(contextA.guides.verticalGuide.value).toBe(12);
    expect(contextB.guides.verticalGuide.value).toBeNull();
  });

  it("creates isolated selection, color, grid, highlight, and viewport stores", () => {
    const contextA = createTestContext(100, 80);
    const contextB = createTestContext(20, 20);

    contextA.selection.startSelection("rectangle", { x: 1, y: 1 });
    contextA.colors.setPrimaryColor("#123456");
    contextA.grid.setTileSize(32);
    contextA.historyHighlight.highlightedCommandId.value = "command-a";
    contextA.viewport.setZoom(2);

    expect(contextA.selection.state.value.type).toBe("selecting");
    expect(contextB.selection.state.value.type).toBe("none");
    expect(contextA.colors.primaryColor.value).toBe("#123456");
    expect(contextB.colors.primaryColor.value).toBe("#000000");
    expect(contextA.grid.tileGridSize.value).toBe(32);
    expect(contextB.grid.tileGridSize.value).toBe(16);
    expect(contextA.historyHighlight.highlightedCommandId.value).toBe(
      "command-a",
    );
    expect(contextB.historyHighlight.highlightedCommandId.value).toBeNull();
    expect(contextA.viewport.zoom.value).toBe(2);
    expect(contextB.viewport.zoom.value).toBe(8);
  });

  it("creates isolated project, animation, palette, and history stores", async () => {
    const contextA = createTestContext(100, 80);
    const contextB = createTestContext(20, 20);

    contextA.project.setSize(32, 24);
    contextA.animation.fps.value = 24;
    contextA.palette.setPalette(["#111111", "#222222"]);
    await contextA.history.execute({
      id: "command-a",
      name: "Command A",
      execute() {},
      undo() {},
    });

    expect(contextA.project.width.value).toBe(32);
    expect(contextB.project.width.value).toBe(64);
    expect(contextA.animation.fps.value).toBe(24);
    expect(contextB.animation.fps.value).toBe(12);
    expect(contextA.palette.mainColors.value).toEqual(["#111111", "#222222"]);
    expect(contextB.palette.mainColors.value).not.toEqual(["#111111", "#222222"]);
    expect(contextA.history.canUndo.value).toBe(true);
    expect(contextB.history.canUndo.value).toBe(false);
  });

  it("keeps default context stores compatible with singleton exports", () => {
    expect(defaultProjectContext.animation).toBe(animationStore);
    expect(defaultProjectContext.colors).toBe(colorStore);
    expect(defaultProjectContext.dirtyRect).toBe(dirtyRectStore);
    expect(defaultProjectContext.grid).toBe(gridStore);
    expect(defaultProjectContext.guides).toBe(guidesStore);
    expect(defaultProjectContext.history).toBe(historyStore);
    expect(defaultProjectContext.historyHighlight).toBe(historyHighlightStore);
    expect(defaultProjectContext.layers).toBe(layerStore);
    expect(defaultProjectContext.palette).toBe(paletteStore);
    expect(defaultProjectContext.project).toBe(projectStore);
    expect(defaultProjectContext.selection).toBe(selectionStore);
    expect(defaultProjectContext.viewport).toBe(viewportStore);
  });
});
