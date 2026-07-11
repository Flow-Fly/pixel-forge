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

const autoSaveServiceMock = vi.hoisted(() => ({
  saveNow: vi.fn(),
}));

const importReferenceImageFileMock = vi.hoisted(() => vi.fn(async () => null));
const importProjectFilesMock = vi.hoisted(() => vi.fn(async () => null));

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

vi.mock("../../../src/services/auto-save", () => ({
  autoSaveService: autoSaveServiceMock,
}));

vi.mock("../../../src/services/reference-import-action", () => ({
  importReferenceImageFile: importReferenceImageFileMock,
}));

vi.mock("../../../src/services/project-file-handling", () => ({
  importProjectFiles: importProjectFilesMock,
}));

vi.mock("../../../src/commands/layer-commands", () => ({
  FlipLayerCommand: class FlipLayerCommand {},
  RotateLayerCommand: class RotateLayerCommand {},
}));

import "../../../src/components/menu/pf-menu-bar";
import type { PFMenuBar } from "../../../src/components/menu/pf-menu-bar";
import { CRT_PRESETS } from "../../../src/services/view-effects";
import { settingsStore } from "../../../src/stores/settings";
import {
  pwaStore,
  type BeforeInstallPromptEvent,
} from "../../../src/stores/pwa";
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from "../../../src/stores/project-context";

const createdContexts: ProjectContext[] = [];

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
  return vi.spyOn(element, "getBoundingClientRect").mockReturnValue(value);
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

function createContext(name: string) {
  const context = createProjectContext();
  context.project.name.value = name;
  createdContexts.push(context);
  return context;
}

function startGuidedSession(context: ProjectContext) {
  context.guidedDrawing.start({
    version: 1,
    width: 1,
    height: 1,
    target: Uint8Array.from([1]),
    guideColorCount: 1,
    settings: {
      longSide: 1,
      paletteSource: "generated",
      maxColors: 1,
      mapping: "color",
      simplifyIsolatedPixels: false,
    },
    createdAt: 1,
  });
}

function useReferenceImageInput(files: File[], dispatchChangeOnClick = true) {
  const input = document.createElement("input");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files,
  });

  const click = vi.spyOn(input, "click").mockImplementation(() => {
    if (dispatchChangeOnClick) {
      input.dispatchEvent(new Event("change"));
    }
  });

  const originalCreateElement = document.createElement.bind(document);
  const createElement = vi.spyOn(document, "createElement");
  createElement.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    if (tagName === "input") return input;
    return originalCreateElement(tagName, options);
  }) as typeof document.createElement);

  return { click, input };
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("pf-menu-bar popovers", () => {
  beforeEach(() => {
    setViewport(800, 600);
    localStorage.clear();
    settingsStore.setActiveViewEffect(null);
    projectStoreMock.name.value = "Untitled";
    vi.clearAllMocks();
    pwaStore.stop();
    pwaStore.start();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    pwaStore.stop();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
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

  it("selects a live CRT profile from the Image menu", async () => {
    const element = await createMenuBar();
    const imageButton = button(element, "image");
    const imageMenu = menu(element, "image");

    imageButton?.click();
    await element.updateComplete;
    menuItem(imageMenu!, "Arcade Monitor")?.click();
    await element.updateComplete;

    expect(settingsStore.activeViewEffect.value).toBe("crt");
    expect(settingsStore.getViewEffectParams("crt")).toEqual(CRT_PRESETS.arcade);

    imageButton?.click();
    await element.updateComplete;
    const arcadeOption = menuItem(imageMenu!, "Arcade Monitor");
    expect(arcadeOption?.getAttribute("aria-checked")).toBe("true");

    menuItem(imageMenu!, "Off")?.click();
    await element.updateComplete;
    expect(settingsStore.activeViewEffect.value).toBeNull();
  });

  it("opens the project browser from the File menu", async () => {
    const element = await createMenuBar();
    const fileButton = button(element, "file");
    const fileMenu = menu(element, "file");
    let browserRequested = false;

    element.addEventListener("show-project-browser", () => {
      browserRequested = true;
    });

    fileButton?.click();
    await element.updateComplete;

    expect(menuItem(fileMenu!, "New Project")).toBeTruthy();
    expect(menuItem(fileMenu!, "Open Project")).toBeTruthy();
    expect(menuItem(fileMenu!, "Import File")).toBeTruthy();
    expect(menuItem(fileMenu!, "Import Reference Image")).toBeTruthy();

    menuItem(fileMenu!, "Open Project")?.click();
    await element.updateComplete;

    expect(browserRequested).toBe(true);
    expect(fileButton?.getAttribute("aria-expanded")).toBe("false");
  });

  it("only shows the install action while the browser offers installation", async () => {
    const element = await createMenuBar();
    const fileMenu = menu(element, "file")!;

    expect(menuItem(fileMenu, "Install Pixel Forge")).toBeUndefined();

    const installEvent = new Event("beforeinstallprompt", {
      cancelable: true,
    }) as BeforeInstallPromptEvent;
    const prompt = vi.fn().mockResolvedValue(undefined);
    Object.assign(installEvent, {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(installEvent);
    await element.updateComplete;

    menuItem(fileMenu, "Install Pixel Forge")?.click();
    await element.updateComplete;

    expect(prompt).toHaveBeenCalledOnce();
    expect(menuItem(fileMenu, "Install Pixel Forge")).toBeUndefined();
  });

  it("opens guided drawing setup from the File menu", async () => {
    const element = await createMenuBar();
    const fileButton = button(element, "file");
    const fileMenu = menu(element, "file");
    let guidedDrawingRequested = false;

    element.addEventListener("show-paint-by-number-dialog", () => {
      guidedDrawingRequested = true;
    });

    fileButton?.click();
    await element.updateComplete;
    menuItem(fileMenu!, "New Guided Drawing")?.click();
    await element.updateComplete;

    expect(guidedDrawingRequested).toBe(true);
    expect(fileButton?.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps guided structure actions disabled while creative actions stay available", async () => {
    const context = createContext("Portrait guide");
    startGuidedSession(context);
    setActiveProjectContext(context);
    const element = await createMenuBar();
    const fileMenu = menu(element, "file")!;
    const imageMenu = menu(element, "image")!;

    expect(element.shadowRoot?.querySelector(".project-name-display")?.textContent)
      .toContain("Portrait guide");
    expect((menuItem(fileMenu, "Import Reference Image") as HTMLButtonElement).disabled).toBe(true);
    expect((menuItem(imageMenu, "Resize Canvas") as HTMLButtonElement).disabled).toBe(true);
    expect((menuItem(imageMenu, "Flip Horizontal") as HTMLButtonElement).disabled).toBe(true);
    expect((menuItem(imageMenu, "Rotate 90° CW") as HTMLButtonElement).disabled).toBe(true);
    expect((menuItem(imageMenu, "Arcade Monitor") as HTMLButtonElement).disabled).toBe(false);
  });

  it("imports a reference image from the File menu into the project active when the picker opened", async () => {
    const contextA = createContext("Context A");
    const contextB = createContext("Context B");
    const file = new File([Uint8Array.from([1, 2, 3])], "guide.webp", { type: "image/webp" });
    const { input } = useReferenceImageInput([file], false);
    setActiveProjectContext(contextA);
    const element = await createMenuBar();
    const fileButton = button(element, "file");
    const fileMenu = menu(element, "file");

    fileButton?.click();
    await element.updateComplete;
    menuItem(fileMenu!, "Import Reference Image")?.click();
    await element.updateComplete;
    setActiveProjectContext(contextB);
    input.dispatchEvent(new Event("change"));
    await flushImport();

    expect(fileButton?.getAttribute("aria-expanded")).toBe("false");
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/png,image/jpeg,image/webp");
    expect(importReferenceImageFileMock).toHaveBeenCalledTimes(1);
    expect(importReferenceImageFileMock).toHaveBeenCalledWith(contextA, file);
  });

  it("delegates multiple project files from the File menu to the shared importer", async () => {
    const first = new File(["first"], "first.pf");
    const second = new File(["second"], "second.aseprite");
    const { input } = useReferenceImageInput([first, second]);
    const element = await createMenuBar();

    await element.openFile();
    await flushImport();

    expect(input.accept).toBe(".pf,.json,.ase,.aseprite");
    expect(input.multiple).toBe(true);
    expect(importProjectFilesMock).toHaveBeenCalledWith([first, second]);
    expect(projectStoreMock.loadProject).not.toHaveBeenCalled();
  });

  it("does nothing when the File menu reference image picker is canceled", async () => {
    const context = createContext("Context A");
    const { click } = useReferenceImageInput([]);
    setActiveProjectContext(context);
    const element = await createMenuBar();
    const fileButton = button(element, "file");
    const fileMenu = menu(element, "file");

    fileButton?.click();
    await element.updateComplete;
    menuItem(fileMenu!, "Import Reference Image")?.click();
    await flushImport();

    expect(click).toHaveBeenCalledTimes(1);
    expect(importReferenceImageFileMock).not.toHaveBeenCalled();
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
    const viewMenuRect = setRect(viewMenu!, rect(0, 0, 186, 200));

    viewButton?.click();
    await element.updateComplete;
    await nextFrame();

    viewMenuRect.mockReturnValue(
      rect(
        Number.parseFloat(viewMenu!.style.left),
        Number.parseFloat(viewMenu!.style.top),
        186,
        Number.parseFloat(viewMenu!.style.maxHeight)
      )
    );

    expect(viewMenu?.style.top).toBe("8px");
    expect(viewMenu?.style.maxHeight).toBe("104px");
    expect(viewMenu?.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight
    );
  });
});
