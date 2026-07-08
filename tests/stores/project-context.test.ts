import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { colorStore } from "../../src/stores/colors";
import { dirtyRectStore } from "../../src/stores/dirty-rect";
import { gridStore } from "../../src/stores/grid";
import { guidesStore } from "../../src/stores/guides";
import { historyHighlightStore } from "../../src/stores/history-highlight";
import { layerStore } from "../../src/stores/layers";
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

  it("keeps the default context compatible with current singleton exports", () => {
    expect(defaultProjectContext.colors).toBe(colorStore);
    expect(defaultProjectContext.dirtyRect).toBe(dirtyRectStore);
    expect(defaultProjectContext.grid).toBe(gridStore);
    expect(defaultProjectContext.guides).toBe(guidesStore);
    expect(defaultProjectContext.historyHighlight).toBe(historyHighlightStore);
    expect(defaultProjectContext.layers).toBe(layerStore);
    expect(defaultProjectContext.selection).toBe(selectionStore);
    expect(defaultProjectContext.viewport).toBe(viewportStore);
  });
});
