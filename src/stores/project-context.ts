import { signal } from "../core/signal";
import { createAnimationStore } from "./animation/store";
import { createColorStore } from "./colors-store";
import { createDirtyRectStore } from "./dirty-rect-store";
import { createGridStore } from "./grid-store";
import { createGuidesStore } from "./guides-store";
import { createGuidedDrawingStore } from "./guided-drawing-store";
import { createHistoryHighlightStore } from "./history-highlight-store";
import { createHistoryStore } from "./history-store";
import { createLayerStore } from "./layers-store";
import { createPaletteStore } from "./palette/store";
import { createProjectStore } from "./project-store";
import { createSelectionStore } from "./selection/store";
import { createStoreRefs, type StoreRefs } from "./store-refs";
import { createViewportStore } from "./viewport-store";

export type ProjectAnimationStore = ReturnType<typeof createAnimationStore>;
export type ProjectColorStore = ReturnType<typeof createColorStore>;
export type ProjectDirtyRectStore = ReturnType<typeof createDirtyRectStore>;
export type ProjectGridStore = ReturnType<typeof createGridStore>;
export type ProjectGuidesStore = ReturnType<typeof createGuidesStore>;
export type ProjectGuidedDrawingStore = ReturnType<typeof createGuidedDrawingStore>;
export type ProjectHistoryHighlightStore = ReturnType<
  typeof createHistoryHighlightStore
>;
export type ProjectHistoryStore = ReturnType<typeof createHistoryStore>;
export type ProjectLayerStore = ReturnType<typeof createLayerStore>;
export type ProjectPaletteStore = ReturnType<typeof createPaletteStore>;
export type ProjectStore = ReturnType<typeof createProjectStore>;
export type ProjectSelectionStore = ReturnType<typeof createSelectionStore>;
export type ProjectViewportStore = ReturnType<typeof createViewportStore>;

export interface ProjectContextStores {
  animation: ProjectAnimationStore;
  colors: ProjectColorStore;
  dirtyRect: ProjectDirtyRectStore;
  grid: ProjectGridStore;
  guides: ProjectGuidesStore;
  guidedDrawing: ProjectGuidedDrawingStore;
  history: ProjectHistoryStore;
  historyHighlight: ProjectHistoryHighlightStore;
  layers: ProjectLayerStore;
  palette: ProjectPaletteStore;
  project: ProjectStore;
  refs: StoreRefs;
  selection: ProjectSelectionStore;
  viewport: ProjectViewportStore;
}

export interface CreateProjectContextOptions {
  colorPalette?: Parameters<typeof createColorStore>[0];
  viewportCanvasSize?: Parameters<typeof createViewportStore>[0];
}

function createProjectContextStores(
  options: CreateProjectContextOptions = {},
): ProjectContextStores {
  const refs = createStoreRefs();
  const layers = createLayerStore();
  const dirtyRect = createDirtyRectStore();
  const grid = createGridStore();
  const guides = createGuidesStore();
  const guidedDrawing = createGuidedDrawingStore();
  const historyHighlight = createHistoryHighlightStore();
  const selection = createSelectionStore();
  const palette = createPaletteStore({ layers, refs });
  const animation = createAnimationStore({ layers, palette, refs });
  const colors = createColorStore(options.colorPalette ?? palette);
  const history = createHistoryStore({ palette });
  const project = createProjectStore({
    animation,
    dirtyRect,
    guidedDrawing,
    history,
    layers,
    palette,
    refs,
    selection,
  });
  const viewport = createViewportStore(options.viewportCanvasSize ?? project);

  return {
    animation,
    colors,
    dirtyRect,
    grid,
    guides,
    guidedDrawing,
    history,
    historyHighlight,
    layers,
    palette,
    project,
    refs,
    selection,
    viewport,
  };
}

export class ProjectContext {
  readonly animation: ProjectAnimationStore;
  readonly colors: ProjectColorStore;
  readonly dirtyRect: ProjectDirtyRectStore;
  readonly grid: ProjectGridStore;
  readonly guides: ProjectGuidesStore;
  readonly guidedDrawing: ProjectGuidedDrawingStore;
  readonly history: ProjectHistoryStore;
  readonly historyHighlight: ProjectHistoryHighlightStore;
  readonly layers: ProjectLayerStore;
  readonly palette: ProjectPaletteStore;
  readonly project: ProjectStore;
  readonly refs: StoreRefs;
  readonly selection: ProjectSelectionStore;
  readonly viewport: ProjectViewportStore;

  private started = false;

  constructor(stores: ProjectContextStores = createProjectContextStores()) {
    this.animation = stores.animation;
    this.colors = stores.colors;
    this.dirtyRect = stores.dirtyRect;
    this.grid = stores.grid;
    this.guides = stores.guides;
    this.guidedDrawing = stores.guidedDrawing;
    this.history = stores.history;
    this.historyHighlight = stores.historyHighlight;
    this.layers = stores.layers;
    this.palette = stores.palette;
    this.project = stores.project;
    this.refs = stores.refs;
    this.selection = stores.selection;
    this.viewport = stores.viewport;

    this.start();
  }

  start() {
    if (this.started) return;

    this.animation.startPaletteSync();
    this.started = true;
  }

  dispose() {
    if (!this.started) return;

    this.animation.dispose();
    this.started = false;
  }
}

export function createProjectContext(
  options: CreateProjectContextOptions = {},
): ProjectContext {
  return new ProjectContext(createProjectContextStores(options));
}

export const defaultProjectContext = new ProjectContext();

export const activeProjectContext = signal<ProjectContext>(defaultProjectContext);

export function getActiveProjectContext(): ProjectContext {
  return activeProjectContext.value;
}

export function setActiveProjectContext(context: ProjectContext): ProjectContext {
  const previousContext = activeProjectContext.value;
  activeProjectContext.value = context;
  return previousContext;
}

export function restoreDefaultProjectContext(): ProjectContext {
  return setActiveProjectContext(defaultProjectContext);
}
