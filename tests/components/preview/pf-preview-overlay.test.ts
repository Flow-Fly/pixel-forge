import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PFPreviewOverlay } from "../../../src/components/preview/pf-preview-overlay";
import {
  DEFAULT_CHECKER_SETTINGS,
  settingsStore,
} from "../../../src/stores/settings";

const STORAGE_KEY_BG = "pf-preview-bg";

const animationStoreMock = vi.hoisted(() => ({
  currentFrameId: { value: "frame-1" },
  cels: { value: new Map() },
  isPlaying: { value: false },
  togglePlayback: vi.fn(),
}));

const layerStoreMock = vi.hoisted(() => ({
  layers: { value: [] },
}));

const projectStoreMock = vi.hoisted(() => ({
  width: { value: 16 },
  height: { value: 16 },
}));

const viewportStoreMock = vi.hoisted(() => ({
  zoom: { value: 1 },
  panX: { value: 0 },
  panY: { value: 0 },
  containerWidth: { value: 0 },
  containerHeight: { value: 0 },
  centerOn: vi.fn(),
}));

vi.mock("../../../src/stores/animation", () => ({
  animationStore: animationStoreMock,
}));

vi.mock("../../../src/stores/layers", () => ({
  layerStore: layerStoreMock,
}));

vi.mock("../../../src/stores/project", () => ({
  projectStore: projectStoreMock,
}));

vi.mock("../../../src/stores/viewport", () => ({
  viewportStore: viewportStoreMock,
}));

function createOverlay() {
  const overlay = document.createElement(
    "pf-preview-overlay"
  ) as PFPreviewOverlay;
  document.body.append(overlay);
  return overlay;
}

function getPreviewSurface(overlay: PFPreviewOverlay) {
  const surface = overlay.shadowRoot?.querySelector(".preview-canvas-wrapper");
  expect(surface).toBeTruthy();
  return surface as HTMLElement;
}

function getBackgroundButton(overlay: PFPreviewOverlay, title: string) {
  const button = overlay.shadowRoot?.querySelector<HTMLButtonElement>(
    `button[title="${title}"]`
  );
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

async function chooseBackground(overlay: PFPreviewOverlay, title: string) {
  getBackgroundButton(overlay, title).click();
  await overlay.updateComplete;
}

function expectBackgroundMode(
  overlay: PFPreviewOverlay,
  mode: "white" | "black" | "checker",
  activeTitle: string
) {
  expect(getPreviewSurface(overlay).classList.contains(`bg-${mode}`)).toBe(true);
  expect(
    getBackgroundButton(overlay, activeTitle).classList.contains("active")
  ).toBe(true);
  expect(localStorage.getItem(STORAGE_KEY_BG)).toBe(mode);
}

describe("pf-preview-overlay background modes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    settingsStore.setCheckerSettings(DEFAULT_CHECKER_SETTINGS);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
        }) as unknown as CanvasRenderingContext2D
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("switches white, black, and checker backgrounds without reloading", async () => {
    const overlay = createOverlay();
    await overlay.updateComplete;

    await chooseBackground(overlay, "White background");
    expectBackgroundMode(overlay, "white", "White background");

    await chooseBackground(overlay, "Transparent (checker)");
    expectBackgroundMode(overlay, "checker", "Transparent (checker)");

    await chooseBackground(overlay, "Black background");
    expectBackgroundMode(overlay, "black", "Black background");

    await chooseBackground(overlay, "Transparent (checker)");
    expectBackgroundMode(overlay, "checker", "Transparent (checker)");

    await chooseBackground(overlay, "White background");
    await chooseBackground(overlay, "Black background");
    await chooseBackground(overlay, "Transparent (checker)");
    expectBackgroundMode(overlay, "checker", "Transparent (checker)");
  });

  it("renders checker mode on a surface that consumes the persisted checker variables", async () => {
    const styleText = (PFPreviewOverlay.styles as { cssText: string }).cssText;

    expect(styleText).toContain("var(--pf-checker-light-color)");
    expect(styleText).toContain("var(--pf-checker-dark-color)");
    expect(styleText).toContain("var(--pf-checker-tile-size)");
  });
});
