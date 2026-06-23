import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const historyStoreMock = vi.hoisted(() => ({
  undo: vi.fn(),
  redo: vi.fn(),
  execute: vi.fn(),
}));

const projectStoreMock = vi.hoisted(() => ({
  name: { value: "Untitled" },
  loadProject: vi.fn(),
}));

const gridStoreMock = vi.hoisted(() => ({
  pixelGridEnabled: { value: false },
  tileGridEnabled: { value: false },
  togglePixelGrid: vi.fn(),
  toggleTileGrid: vi.fn(),
}));

const viewportStoreMock = vi.hoisted(() => ({
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomToLevel: vi.fn(),
  resetView: vi.fn(),
}));

vi.mock("../../../src/stores/history", () => ({
  historyStore: historyStoreMock,
}));

vi.mock("../../../src/stores/layers", () => ({
  layerStore: {
    activeLayerId: { value: null },
  },
}));

vi.mock("../../../src/stores/project", () => ({
  projectStore: projectStoreMock,
}));

vi.mock("../../../src/stores/grid", () => ({
  gridStore: gridStoreMock,
}));

vi.mock("../../../src/stores/viewport", () => ({
  viewportStore: viewportStoreMock,
}));

vi.mock("../../../src/commands/layer-commands", () => ({
  FlipLayerCommand: class FlipLayerCommand {},
  RotateLayerCommand: class RotateLayerCommand {},
}));

import "../../../src/components/menu/pf-menu-bar";
import type { PFMenuBar } from "../../../src/components/menu/pf-menu-bar";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function setRect(element: Element, value: DOMRect) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(value);
}

function setViewport(width: number, height: number) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
}

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function createMenuBar() {
  const element = document.createElement("pf-menu-bar") as PFMenuBar;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function button(element: PFMenuBar, menuId: string) {
  return element.shadowRoot?.querySelector<HTMLButtonElement>(`#btn-${menuId}`);
}

function menu(element: PFMenuBar, menuId: string) {
  return element.shadowRoot?.querySelector<HTMLElement>(`#menu-${menuId}`);
}

function menuItem(panel: HTMLElement, label: string) {
  return [...panel.querySelectorAll<HTMLElement>(".menu-item")].find((item) =>
    item.textContent?.includes(label)
  );
}

describe("pf-menu-bar popovers", () => {
  beforeEach(() => {
    setViewport(800, 600);
    localStorage.clear();
    projectStoreMock.name.value = "Untitled";
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens File from a click", async () => {
    const element = await createMenuBar();
    const fileButton = button(element, "file");
    const fileMenu = menu(element, "file");

    fileButton?.click();
    await element.updateComplete;

    expect(fileButton?.getAttribute("aria-expanded")).toBe("true");
    expect(fileMenu?.getAttribute("data-open")).toBe("true");
  });

  it("switches the active menu while hovering across menu buttons", async () => {
    const element = await createMenuBar();
    const fileButton = button(element, "file");
    const editButton = button(element, "edit");
    const viewButton = button(element, "view");
    const imageButton = button(element, "image");

    fileButton?.click();
    await element.updateComplete;

    editButton?.dispatchEvent(new Event("pointerenter"));
    await element.updateComplete;

    expect(fileButton?.getAttribute("aria-expanded")).toBe("false");
    expect(editButton?.getAttribute("aria-expanded")).toBe("true");

    viewButton?.dispatchEvent(new Event("pointerenter"));
    await element.updateComplete;
    imageButton?.dispatchEvent(new Event("pointerenter"));
    await element.updateComplete;

    expect(viewButton?.getAttribute("aria-expanded")).toBe("false");
    expect(imageButton?.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes the active menu on Escape", async () => {
    const element = await createMenuBar();
    const fileButton = button(element, "file");

    fileButton?.click();
    await element.updateComplete;

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await element.updateComplete;

    expect(fileButton?.getAttribute("aria-expanded")).toBe("false");
    expect(menu(element, "file")?.hasAttribute("data-open")).toBe(false);
  });

  it("closes the active menu on outside pointer down", async () => {
    const element = await createMenuBar();
    const fileButton = button(element, "file");

    fileButton?.click();
    await element.updateComplete;

    document.body.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(fileButton?.getAttribute("aria-expanded")).toBe("false");
    expect(menu(element, "file")?.hasAttribute("data-open")).toBe(false);
  });

  it("runs a clicked menu item command and closes the menu", async () => {
    const element = await createMenuBar();
    const fileButton = button(element, "file");
    const fileMenu = menu(element, "file");
    let exportDialogRequested = false;

    element.addEventListener("show-export-dialog", () => {
      exportDialogRequested = true;
    });

    fileButton?.click();
    await element.updateComplete;
    menuItem(fileMenu!, "Export")?.click();
    await element.updateComplete;

    expect(exportDialogRequested).toBe(true);
    expect(fileButton?.getAttribute("aria-expanded")).toBe("false");
    expect(fileMenu?.hasAttribute("data-open")).toBe(false);
  });

  it("clamps right-edge menus inside the viewport", async () => {
    setViewport(200, 300);
    const element = await createMenuBar();
    const viewButton = button(element, "view");
    const viewMenu = menu(element, "view");

    setRect(viewButton!, rect(170, 0, 28, 24));
    setRect(viewMenu!, rect(0, 0, 180, 100));

    viewButton?.click();
    await element.updateComplete;
    await nextFrame();

    expect(viewMenu?.style.left).toBe("12px");
    expect(viewMenu?.style.top).toBe("28px");
  });

  it("limits tall menus to the viewport height", async () => {
    setViewport(400, 120);
    const element = await createMenuBar();
    const viewButton = button(element, "view");
    const viewMenu = menu(element, "view");

    setRect(viewButton!, rect(20, 0, 40, 24));
    setRect(viewMenu!, rect(0, 0, 186, 200));

    viewButton?.click();
    await element.updateComplete;
    await nextFrame();

    expect(viewMenu?.style.top).toBe("8px");
    expect(viewMenu?.style.maxHeight).toBe("104px");
  });
});
