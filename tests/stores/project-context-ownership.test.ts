import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { createColorStore } from "../../src/stores/colors";
import { createDirtyRectStore } from "../../src/stores/dirty-rect";
import { createGridStore } from "../../src/stores/grid";
import { createGuidesStore } from "../../src/stores/guides";
import { createHistoryHighlightStore } from "../../src/stores/history-highlight";
import { createLayerStore } from "../../src/stores/layers";
import { createSelectionStore } from "../../src/stores/selection";
import { createViewportStore } from "../../src/stores/viewport";

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

describe("ProjectContext ownership exports", () => {
  it("can construct isolated instances of simple per-project stores", () => {
    const layersA = createLayerStore();
    const layersB = createLayerStore();
    const layersBCount = layersB.layers.value.length;

    layersA.addLayer("Only A", 8, 8);

    expect(layersA.layers.value).toHaveLength(layersBCount + 1);
    expect(layersB.layers.value).toHaveLength(layersBCount);

    const dirtyA = createDirtyRectStore();
    const dirtyB = createDirtyRectStore();

    dirtyA.markDirty({ x: 0, y: 0, width: 2, height: 2 });

    expect(dirtyA.consumePendingDirty()).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
    expect(dirtyB.consumePendingDirty()).toBeNull();

    const guidesA = createGuidesStore();
    const guidesB = createGuidesStore();

    guidesA.setVerticalGuide(12);

    expect(guidesA.verticalGuide.value).toBe(12);
    expect(guidesB.verticalGuide.value).toBeNull();

    const viewportA = createViewportStore({
      width: { value: 100 },
      height: { value: 80 },
    });
    const viewportB = createViewportStore({
      width: { value: 20 },
      height: { value: 20 },
    });

    viewportA.setZoom(2);

    expect(viewportA.zoom.value).toBe(2);
    expect(viewportB.zoom.value).toBe(8);

    const selectionA = createSelectionStore();
    const selectionB = createSelectionStore();

    selectionA.startSelection("rectangle", { x: 1, y: 1 });

    expect(selectionA.state.value.type).toBe("selecting");
    expect(selectionB.state.value.type).toBe("none");

    const colorA = createColorStore(paletteWithLightnessVariations);
    const colorB = createColorStore(paletteWithLightnessVariations);

    colorA.setPrimaryColor("#123456");

    expect(colorA.primaryColor.value).toBe("#123456");
    expect(colorB.primaryColor.value).toBe("#000000");

    const gridA = createGridStore();
    const gridB = createGridStore();

    gridA.setTileSize(32);

    expect(gridA.tileGridSize.value).toBe(32);
    expect(gridB.tileGridSize.value).toBe(16);

    const highlightA = createHistoryHighlightStore();
    const highlightB = createHistoryHighlightStore();

    highlightA.highlightedCommandId.value = "command-a";

    expect(highlightA.highlightedCommandId.value).toBe("command-a");
    expect(highlightB.highlightedCommandId.value).toBeNull();
  });
});
