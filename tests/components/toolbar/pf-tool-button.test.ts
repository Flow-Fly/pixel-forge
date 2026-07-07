import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolType } from "../../../src/stores/tools";

const toolStoreMock = vi.hoisted(() => ({
  activeTool: { value: "pencil" },
  setActiveTool(tool: string) {
    toolStoreMock.activeTool.value = tool;
  },
}));

vi.mock("../../../src/stores/tools", () => ({
  toolStore: toolStoreMock,
}));


import "../../../src/components/toolbar/pf-tool-button";
import "../../../src/components/toolbar/pf-tool-group-menu";
import type { PFToolButton } from "../../../src/components/toolbar/pf-tool-button";
import type { PFToolGroupMenu } from "../../../src/components/toolbar/pf-tool-group-menu";

const selectionTools: ToolType[] = [
  "marquee-rect",
  "lasso",
  "polygonal-lasso",
  "magic-wand",
];

async function nextAnimationFrame() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function createSelectionToolButton() {
  const toolButton = document.createElement("pf-tool-button") as PFToolButton;
  toolButton.tool = "marquee-rect";
  toolButton.groupId = "selection";
  toolButton.groupTools = selectionTools;
  toolButton.shortcut = "M";

  document.body.append(toolButton);
  await toolButton.updateComplete;
  await toolButton.updateComplete;

  return toolButton;
}

function clickToolButton(toolButton: PFToolButton) {
  const button = toolButton.shadowRoot?.querySelector("button");
  expect(button).toBeInstanceOf(HTMLButtonElement);
  (button as HTMLButtonElement).click();
}

function getOpenMenu() {
  return document.body.querySelector(
    "pf-tool-group-menu"
  ) as PFToolGroupMenu | null;
}

function getMenuItem(menu: PFToolGroupMenu, label: string) {
  const items = Array.from(
    menu.shadowRoot?.querySelectorAll<HTMLButtonElement>(".menu-item") ?? []
  );

  return items.find((item) => item.textContent?.includes(label));
}

describe("pf-tool-button group menu", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    toolStoreMock.activeTool.value = "pencil";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("opens the group menu in the document body", async () => {
    const toolButton = await createSelectionToolButton();

    clickToolButton(toolButton);

    const menu = getOpenMenu();
    expect(menu).toBeTruthy();
    expect(menu?.parentElement).toBe(document.body);
    expect(toolButton.shadowRoot?.querySelector("pf-tool-group-menu")).toBeNull();
  });

  it("selects a menu item and dispatches the displayed group tool update", async () => {
    const toolButton = await createSelectionToolButton();
    let changedTool: ToolType | null = null;
    let changedGroupId = "";

    toolButton.addEventListener("group-tool-changed", (event) => {
      const detail = (event as CustomEvent<{ tool: ToolType; groupId: string }>)
        .detail;
      changedTool = detail.tool;
      changedGroupId = detail.groupId;
    });

    clickToolButton(toolButton);
    const menu = getOpenMenu();
    expect(menu).toBeTruthy();

    await menu!.updateComplete;
    getMenuItem(menu!, "Lasso")?.click();

    expect(toolStoreMock.activeTool.value).toBe("lasso");
    expect(changedTool).toBe("lasso");
    expect(changedGroupId).toBe("selection");
    expect(getOpenMenu()).toBeNull();
  });

  it("closes the group menu from outside mousedown and Escape", async () => {
    const toolButton = await createSelectionToolButton();

    clickToolButton(toolButton);
    expect(getOpenMenu()).toBeTruthy();

    document.body.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, composed: true })
    );
    expect(getOpenMenu()).toBeNull();

    clickToolButton(toolButton);
    expect(getOpenMenu()).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(getOpenMenu()).toBeNull();
  });

  it("clamps the menu inside a small viewport", async () => {
    vi.stubGlobal("innerWidth", 200);
    vi.stubGlobal("innerHeight", 150);

    const menu = document.createElement(
      "pf-tool-group-menu"
    ) as PFToolGroupMenu;
    menu.tools = selectionTools;
    menu.x = 190;
    menu.y = 140;
    menu.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 190, y: 140, width: 120, height: 100 });

    document.body.append(menu);
    await menu.updateComplete;
    await nextAnimationFrame();

    expect(menu.style.left).toBe("72px");
    expect(menu.style.top).toBe("42px");
  });
});
