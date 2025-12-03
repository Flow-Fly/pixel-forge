import { signal } from "../core/signal";

export type PanelId =
  | "color-sliders"
  | "brush"
  | "palette"
  | "preview"
  | "layers"
  | "history"
  | "shape-options"
  | "palette-generator"
  | "timeline";

interface PanelState {
  collapsed: boolean;
}

const DEFAULT_STATES: Record<PanelId, PanelState> = {
  "color-sliders": { collapsed: false },
  brush: { collapsed: false },
  palette: { collapsed: false },
  preview: { collapsed: false },
  layers: { collapsed: false },
  history: { collapsed: true },
  "shape-options": { collapsed: false },
  "palette-generator": { collapsed: false },
  "timeline": { collapsed: false },
};

class PanelStore {
  panelStates = signal<Record<PanelId, PanelState>>({ ...DEFAULT_STATES });

  constructor() {
    this.loadFromStorage();
  }

  togglePanel(id: PanelId) {
    const current = this.panelStates.value;
    this.panelStates.value = {
      ...current,
      [id]: { collapsed: !current[id]?.collapsed },
    };
    this.saveToStorage();
  }

  setCollapsed(id: PanelId, collapsed: boolean) {
    const current = this.panelStates.value;
    this.panelStates.value = {
      ...current,
      [id]: { collapsed },
    };
    this.saveToStorage();
  }

  isCollapsed(id: PanelId): boolean {
    return this.panelStates.value[id]?.collapsed ?? false;
  }

  private loadFromStorage() {
    const saved = localStorage.getItem("pf-panel-states");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new panels
        this.panelStates.value = { ...DEFAULT_STATES, ...parsed };
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }

  private saveToStorage() {
    localStorage.setItem(
      "pf-panel-states",
      JSON.stringify(this.panelStates.value)
    );
  }

  reset() {
    this.panelStates.value = { ...DEFAULT_STATES };
    this.saveToStorage();
  }
}

export const panelStore = new PanelStore();
