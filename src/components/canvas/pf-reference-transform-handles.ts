import { html, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { TransformReferenceLayerCommand } from '../../commands/layer-commands';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';
import { ReferenceBitmapCache } from '../../services/reference-bitmap-cache';
import type { ReferenceLayerRenderEntry } from '../../services/reference-render-plan';
import {
  createReferenceTransformBox,
  moveReferenceTransform,
  type ReferenceLayerTransform,
  type ReferenceTransformBox,
} from '../../services/reference-transform-geometry';
import type { Layer } from '../../types/layer';
import type { ReferenceLayerData } from '../../types/reference';

type EditableReferenceLayer = Layer & { referenceData: ReferenceLayerData };

interface ReferenceMoveDrag {
  context: ProjectContext;
  layerId: string;
  startPointer: { x: number; y: number };
  startTransform: ReferenceLayerTransform;
  currentTransform: ReferenceLayerTransform;
  zoom: number;
}

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
      cursor: move;
      pointer-events: auto;
    }

    .reference-box.dragging {
      cursor: grabbing;
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
      pointer-events: none;
    }
  `;

  private context: ProjectContext = defaultProjectContext;
  private readonly bitmapCache = new ReferenceBitmapCache();
  private readonly pendingBitmapLoads = new Set<Promise<ImageBitmap>>();
  private moveDrag: ReferenceMoveDrag | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeMoveListeners();
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

  private handleReferenceMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;

    const layer = this.getActiveReferenceLayer();
    if (!layer) return;

    event.preventDefault();
    event.stopPropagation();

    const startTransform = pickReferenceTransform(layer.referenceData);
    this.moveDrag = {
      context: this.context,
      layerId: layer.id,
      startPointer: { x: event.clientX, y: event.clientY },
      startTransform,
      currentTransform: startTransform,
      zoom: this.context.viewport.zoom.value,
    };
    document.addEventListener('mousemove', this.handleDocumentMouseMove);
    document.addEventListener('mouseup', this.handleDocumentMouseUp);
    this.requestUpdate();
  };

  private handleDocumentMouseMove = (event: MouseEvent) => {
    const drag = this.moveDrag;
    if (!drag) return;

    const layer = this.getDragLayer(drag);
    if (!layer) {
      this.cancelMoveDrag();
      return;
    }

    const nextTransform = moveReferenceTransform(
      drag.startTransform,
      drag.startPointer,
      { x: event.clientX, y: event.clientY },
      drag.zoom
    );
    if (sameReferenceTransform(nextTransform, drag.currentTransform)) return;

    drag.currentTransform = nextTransform;
    this.applyReferenceTransform(drag.context, layer, nextTransform);
    this.requestUpdate();
  };

  private handleDocumentMouseUp = () => {
    const drag = this.moveDrag;
    if (!drag) return;

    this.removeMoveListeners();
    this.moveDrag = null;
    this.requestUpdate();

    const layer = this.getDragLayer(drag);
    if (!layer) {
      this.restoreReferenceTransform(drag);
      return;
    }

    if (sameReferenceTransform(drag.startTransform, drag.currentTransform)) return;

    void drag.context.history.execute(
      new TransformReferenceLayerCommand(
        drag.layerId,
        drag.startTransform,
        drag.currentTransform,
        drag.context
      )
    );
  };

  private getDragLayer(drag: ReferenceMoveDrag): EditableReferenceLayer | null {
    if (drag.context.layers.activeLayerId.value !== drag.layerId) return null;

    const layer = drag.context.layers.layers.value.find((item) => item.id === drag.layerId);
    if (!isVisibleEditableReferenceLayer(layer)) return null;

    return layer;
  }

  private applyReferenceTransform(
    context: ProjectContext,
    layer: EditableReferenceLayer,
    transform: ReferenceLayerTransform
  ) {
    context.layers.updateLayer(layer.id, {
      referenceData: {
        ...layer.referenceData,
        ...transform,
      },
    });
    context.dirtyRect.requestFullRedraw();
  }

  private restoreReferenceTransform(drag: ReferenceMoveDrag) {
    const layer = drag.context.layers.layers.value.find((item) => item.id === drag.layerId);
    if (!isReferenceLayerWithData(layer)) return;

    this.applyReferenceTransform(drag.context, layer, drag.startTransform);
  }

  private cancelMoveDrag() {
    const drag = this.moveDrag;
    if (!drag) return;

    this.removeMoveListeners();
    this.moveDrag = null;
    this.restoreReferenceTransform(drag);
    this.requestUpdate();
  }

  private removeMoveListeners() {
    document.removeEventListener('mousemove', this.handleDocumentMouseMove);
    document.removeEventListener('mouseup', this.handleDocumentMouseUp);
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
        class="reference-box ${this.moveDrag ? 'dragging' : ''}"
        aria-hidden="true"
        style=${boxStyle(box)}
        @mousedown=${this.handleReferenceMouseDown}
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
  return isReferenceLayerWithData(layer) && layer.visible && !layer.locked;
}

function isReferenceLayerWithData(layer: Layer | undefined): layer is EditableReferenceLayer {
  return layer?.type === 'reference' && !!layer.referenceData;
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

function pickReferenceTransform(referenceData: ReferenceLayerData): ReferenceLayerTransform {
  return {
    x: referenceData.x,
    y: referenceData.y,
    scale: referenceData.scale,
  };
}

function sameReferenceTransform(
  first: ReferenceLayerTransform,
  second: ReferenceLayerTransform
): boolean {
  return first.x === second.x && first.y === second.y && first.scale === second.scale;
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-reference-transform-handles': PFReferenceTransformHandles;
  }
}
