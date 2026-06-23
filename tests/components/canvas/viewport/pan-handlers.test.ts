import { beforeEach, describe, expect, it, vi } from "vitest";

const viewportStoreMock = vi.hoisted(() => ({
  isSpacebarDown: { value: false },
}));

const toolStoreMock = vi.hoisted(() => ({
  activeTool: { value: "pencil" },
}));

vi.mock("../../../../src/stores/viewport", () => ({
  viewportStore: viewportStoreMock,
}));

vi.mock("../../../../src/stores/colors", () => ({
  colorStore: {
    shiftLightnessDarker: vi.fn(),
    shiftLightnessLighter: vi.fn(),
  },
}));

vi.mock("../../../../src/stores/tools", () => ({
  toolStore: toolStoreMock,
}));

import {
  createPanState,
  handleGlobalMouseDown,
  isClickOnUI,
} from "../../../../src/components/canvas/viewport/pan-handlers";

function createMouseDownFrom(target: HTMLElement) {
  const event = new MouseEvent("mousedown", {
    button: 0,
    bubbles: true,
    composed: true,
  });

  Object.defineProperty(event, "target", { value: target });

  return event;
}

describe("viewport pan handlers", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    toolStoreMock.activeTool.value = "pencil";
    viewportStoreMock.isSpacebarDown.value = false;
  });

  it("treats body-level tool group menus as UI", () => {
    const menu = document.createElement("pf-tool-group-menu");
    document.body.append(menu);

    expect(isClickOnUI(createMouseDownFrom(menu))).toBe(true);
  });

  it("does not start hand-tool panning from body-level tool group menus", () => {
    const menu = document.createElement("pf-tool-group-menu");
    const state = createPanState();
    const startDragging = vi.fn();

    document.body.append(menu);
    toolStoreMock.activeTool.value = "hand";

    handleGlobalMouseDown(createMouseDownFrom(menu), state, startDragging);

    expect(startDragging).not.toHaveBeenCalled();
  });
});
