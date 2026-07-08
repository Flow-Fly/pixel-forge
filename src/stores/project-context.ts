import { colorStore, createColorStore } from "./colors";
import { dirtyRectStore, createDirtyRectStore } from "./dirty-rect";
import { gridStore, createGridStore } from "./grid";
import { guidesStore, createGuidesStore } from "./guides";
import {
  historyHighlightStore,
  createHistoryHighlightStore,
} from "./history-highlight";
import { layerStore, createLayerStore } from "./layers";
import { selectionStore, createSelectionStore } from "./selection";
import { viewportStore, createViewportStore } from "./viewport";

export type ProjectColorStore = ReturnType<typeof createColorStore>;
export type ProjectDirtyRectStore = ReturnType<typeof createDirtyRectStore>;
export type ProjectGridStore = ReturnType<typeof createGridStore>;
export type ProjectGuidesStore = ReturnType<typeof createGuidesStore>;
export type ProjectHistoryHighlightStore = ReturnType<
  typeof createHistoryHighlightStore
>;
export type ProjectLayerStore = ReturnType<typeof createLayerStore>;
export type ProjectSelectionStore = ReturnType<typeof createSelectionStore>;
export type ProjectViewportStore = ReturnType<typeof createViewportStore>;

export interface ProjectContextStores {
  colors: ProjectColorStore;
  dirtyRect: ProjectDirtyRectStore;
  grid: ProjectGridStore;
  guides: ProjectGuidesStore;
  historyHighlight: ProjectHistoryHighlightStore;
  layers: ProjectLayerStore;
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
  return {
    colors: createColorStore(options.colorPalette),
    dirtyRect: createDirtyRectStore(),
    grid: createGridStore(),
    guides: createGuidesStore(),
    historyHighlight: createHistoryHighlightStore(),
    layers: createLayerStore(),
    selection: createSelectionStore(),
    viewport: createViewportStore(options.viewportCanvasSize),
  };
}

class ProjectContext {
  readonly colors: ProjectColorStore;
  readonly dirtyRect: ProjectDirtyRectStore;
  readonly grid: ProjectGridStore;
  readonly guides: ProjectGuidesStore;
  readonly historyHighlight: ProjectHistoryHighlightStore;
  readonly layers: ProjectLayerStore;
  readonly selection: ProjectSelectionStore;
  readonly viewport: ProjectViewportStore;

  constructor(stores: ProjectContextStores = createProjectContextStores()) {
    this.colors = stores.colors;
    this.dirtyRect = stores.dirtyRect;
    this.grid = stores.grid;
    this.guides = stores.guides;
    this.historyHighlight = stores.historyHighlight;
    this.layers = stores.layers;
    this.selection = stores.selection;
    this.viewport = stores.viewport;
  }
}

export function createProjectContext(
  options: CreateProjectContextOptions = {},
): ProjectContextStores {
  return new ProjectContext(createProjectContextStores(options));
}

export const defaultProjectContext: ProjectContextStores = new ProjectContext({
  colors: colorStore,
  dirtyRect: dirtyRectStore,
  grid: gridStore,
  guides: guidesStore,
  historyHighlight: historyHighlightStore,
  layers: layerStore,
  selection: selectionStore,
  viewport: viewportStore,
});
