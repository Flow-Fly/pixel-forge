import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/services/persistence/palette-persistence", () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock("../../../src/components/color/pf-color-picker-popup", () => ({}));

import "../../../src/components/color/palette-panel/pf-palette-grid";
import "../../../src/components/color/pf-palette-panel";
import type { PFPaletteGrid } from "../../../src/components/color/palette-panel/pf-palette-grid";
import type { PFPalettePanel } from "../../../src/components/color/pf-palette-panel";
import { paletteStore } from "../../../src/stores/palette";

const BASE_PALETTE = ["#ff0000", "#00ff00", "#0000ff"];

async function createPaletteGrid() {
  const grid = document.createElement("pf-palette-grid") as PFPaletteGrid;
  document.body.append(grid);
  await grid.updateComplete;
  return grid;
}

async function createPalettePanel() {
  const panel = document.createElement("pf-palette-panel") as PFPalettePanel;
  document.body.append(panel);
  await panel.updateComplete;
  return panel;
}

async function updateAfterSignalChange(element: { updateComplete: Promise<unknown> }) {
  await Promise.resolve();
  await element.updateComplete;
}

async function getPanelGrid(panel: PFPalettePanel) {
  const grid = panel.shadowRoot?.querySelector<PFPaletteGrid>("pf-palette-grid");
  await grid?.updateComplete;
  return grid;
}

describe("palette new color badges", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    paletteStore.setPalette([...BASE_PALETTE]);
    paletteStore.clearAllNewFlags();
  });

  afterEach(() => {
    document.body.replaceChildren();
    paletteStore.clearAllNewFlags();
  });

  it("renders a badge for a flagged new color", async () => {
    paletteStore.addColor("#123456", { flagNew: true });

    const grid = await createPaletteGrid();
    const badges = grid.shadowRoot?.querySelectorAll(".new-color-badge");
    const newSwatch = grid.shadowRoot?.querySelector(".swatch-container.new-color");

    expect(badges).toHaveLength(1);
    expect(newSwatch).toBeTruthy();
    expect(badges?.[0]?.getAttribute("aria-label")).toBe(
      "Mark #123456 as kept"
    );
  });

  it("clears one badge when the color is marked as kept", async () => {
    paletteStore.addColor("#123456", { flagNew: true });

    const grid = await createPaletteGrid();
    const badge = grid.shadowRoot?.querySelector<HTMLButtonElement>(
      ".new-color-badge"
    );

    badge?.click();
    await updateAfterSignalChange(grid);

    expect(paletteStore.isNewColor("#123456")).toBe(false);
    expect(grid.shadowRoot?.querySelector(".new-color-badge")).toBeNull();
  });

  it("clears all badges from the panel action", async () => {
    paletteStore.addColor("#123456", { flagNew: true });
    paletteStore.addColor("#abcdef", { flagNew: true });

    const panel = await createPalettePanel();
    const grid = await getPanelGrid(panel);
    const clearAll = panel.shadowRoot?.querySelector<HTMLButtonElement>(
      ".clear-new-marks"
    );

    expect(grid?.shadowRoot?.querySelectorAll(".new-color-badge")).toHaveLength(
      2
    );

    clearAll?.click();
    await updateAfterSignalChange(panel);
    await updateAfterSignalChange(grid!);

    expect(paletteStore.newColorFlags.value.size).toBe(0);
    expect(panel.shadowRoot?.querySelector(".clear-new-marks")).toBeNull();
    expect(grid?.shadowRoot?.querySelectorAll(".new-color-badge")).toHaveLength(
      0
    );
  });
});
