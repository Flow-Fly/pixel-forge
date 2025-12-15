import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { layerStore } from "../../stores/layers";
import { historyStore } from "../../stores/history";
import {
  AddLayerCommand,
  RemoveLayerCommand,
  UpdateLayerCommand,
} from "../../commands/layer-commands";
import "./pf-layer-item";

@customElement("pf-layers-panel")
export class PFLayersPanel extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .layer-list {
      flex: 1;
      overflow-y: auto;
    }

    .controls {
      padding: 8px;
      border-top: 1px solid var(--pf-color-border);
      display: flex;
      gap: 4px;
    }
  `;

  addLayer() {
    historyStore.execute(new AddLayerCommand());
  }

  selectLayer(id: string) {
    layerStore.activeLayerId.value = id;
  }

  render() {
    const layers = layerStore.layers.value;
    const activeId = layerStore.activeLayerId.value;

    // Render in reverse order so top layers are at the top of the list
    const reversedLayers = [...layers].reverse();

    return html`
      <div class="layer-list">
        ${reversedLayers.map(
          (layer) => html`
            <pf-layer-item
              .layer=${layer}
              ?active=${layer.id === activeId}
              @click=${() => this.selectLayer(layer.id)}
              @dblclick=${() => this.startRenaming(layer)}
            ></pf-layer-item>
          `
        )}
      </div>
      <div class="controls">
        <button @click=${this.addLayer} title="New Layer">+</button>
        <button @click=${() => this.deleteLayer()} title="Delete Layer">-</button>
        <button @click=${() => this.moveLayer("up")} title="Move Up">↑</button>
        <button @click=${() => this.moveLayer("down")} title="Move Down">↓</button>
      </div>
    `;
  }

  deleteLayer() {
    const activeId = layerStore.activeLayerId.value;
    if (activeId) {
      historyStore.execute(new RemoveLayerCommand(activeId));
    }
  }

  moveLayer(direction: "up" | "down") {
    const activeId = layerStore.activeLayerId.value;
    if (activeId) {
      layerStore.reorderLayer(activeId, direction);
    }
  }

  startRenaming(layer: any) {
    // For text layers, double-click enters edit mode
    if (layer.type === "text") {
      this.editTextLayer(layer.id);
      return;
    }

    const newName = prompt("Rename Layer", layer.name);
    if (newName && newName !== layer.name) {
      historyStore.execute(new UpdateLayerCommand(layer.id, { name: newName }));
    }
  }

  editTextLayer(layerId: string) {
    // Dispatch event to trigger text editing
    window.dispatchEvent(
      new CustomEvent("text-tool:edit-layer", {
        detail: { layerId },
      })
    );
  }
}
