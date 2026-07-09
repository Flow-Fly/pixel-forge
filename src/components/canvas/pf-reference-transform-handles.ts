import { html, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';
import { ReferenceBitmapCache } from '../../services/reference-bitmap-cache';
import type { ReferenceLayerRenderEntry } from '../../services/reference-render-plan';
import {
  createReferenceTransformBox,
  type ReferenceTransformBox,
} from '../../services/reference-transform-geometry';
import type { Layer } from '../../types/layer';
import type { ReferenceLayerData } from '../../types/reference';

type EditableReferenceLayer = Layer & { referenceData: ReferenceLayerData };

@customElement('pf-reference-transform-handles')
export class PFReferenceTransformHandles extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 49;
    }

    .reference-box {
      position: absolute;
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.92);
      outline: 1px solid rgba(18, 24, 32, 0.9);
    }

    .reference-handle {
      position: absolute;
      width: 10px;
      height: 10px;
      margin-inline-start: -5px;
      margin-block-start: -5px;
      box-sizing: border-box;
      background: white;
      border: 1px solid #333;
      border-radius: 2px;
    }
  `;

  private context: ProjectContext = defaultProjectContext;
  private readonly bitmapCache = new ReferenceBitmapCache();
  private readonly pendingBitmapLoads = new Set<Promise<ImageBitmap>>();

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.bitmapCache.clear();
    this.pendingBitmapLoads.clear();
  }

  private getActiveReferenceLayer(): EditableReferenceLayer | null {
    const layerId = this.context.layers.activeLayerId.value;
    const layer = this.context.layers.layers.value.find((item) => item.id === layerId);

    if (!isVisibleEditableReferenceLayer(layer)) return null;
    return layer;
  }

  private getTransformBox(): ReferenceTransformBox | null {
    const layer = this.getActiveReferenceLayer();
    if (!layer) return null;

    const entry = createRenderEntry(layer);
    const bitmap = this.bitmapCache.getCached(entry);
    if (!bitmap) {
      this.loadBitmap(entry);
      return null;
    }

    return createReferenceTransformBox(
      layer,
      { width: bitmap.width, height: bitmap.height },
      {
        panX: this.context.viewport.panX.value,
        panY: this.context.viewport.panY.value,
        zoom: this.context.viewport.zoom.value,
      }
    );
  }

  private loadBitmap(entry: ReferenceLayerRenderEntry): void {
    let promise: Promise<ImageBitmap>;

    try {
      promise = this.bitmapCache.get(entry);
    } catch {
      return;
    }

    if (this.pendingBitmapLoads.has(promise)) return;

    this.pendingBitmapLoads.add(promise);
    void promise.then(
      () => {
        this.pendingBitmapLoads.delete(promise);
        this.requestUpdate();
      },
      () => {
        this.pendingBitmapLoads.delete(promise);
      }
    );
  }

  render() {
    void this.context.layers.activeLayerId.value;
    void this.context.layers.layers.value;
    void this.context.viewport.panX.value;
    void this.context.viewport.panY.value;
    void this.context.viewport.zoom.value;

    const box = this.getTransformBox();
    if (!box) return nothing;

    return html`
      <div
        class="reference-box"
        aria-hidden="true"
        style=${boxStyle(box)}
      ></div>
      ${box.handles.map(
        (handle) => html`
          <div
            class="reference-handle"
            data-position=${handle.position}
            aria-hidden="true"
            style="left: ${handle.screenX}px; top: ${handle.screenY}px; cursor: ${handle.cursor};"
          ></div>
        `
      )}
    `;
  }
}

function isVisibleEditableReferenceLayer(
  layer: Layer | undefined
): layer is EditableReferenceLayer {
  return layer?.type === 'reference' && layer.visible && !layer.locked && !!layer.referenceData;
}

function createRenderEntry(layer: EditableReferenceLayer): ReferenceLayerRenderEntry {
  const reference = layer.referenceData;

  return {
    layerId: layer.id,
    bytes: reference.bytes,
    mimeType: reference.mimeType,
    x: reference.x,
    y: reference.y,
    scale: reference.scale,
    opacity: layer.opacity,
    desaturate: reference.desaturate ?? false,
    position: reference.position ?? 'below',
  };
}

function boxStyle(box: ReferenceTransformBox): string {
  return [
    `left: ${box.screenLeft}px`,
    `top: ${box.screenTop}px`,
    `width: ${box.screenRight - box.screenLeft}px`,
    `height: ${box.screenBottom - box.screenTop}px`,
  ].join('; ');
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-reference-transform-handles': PFReferenceTransformHandles;
  }
}
