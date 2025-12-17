import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import "../timeline/pf-timeline-layers";

/**
 * Layers panel that wraps pf-timeline-layers for sidebar display.
 * This provides a unified layers component used in both the timeline and sidebar.
 */
@customElement("pf-layers-panel")
export class PFLayersPanel extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    pf-timeline-layers {
      flex: 1;
      overflow-y: auto;
    }
  `;

  render() {
    return html`
      <pf-timeline-layers></pf-timeline-layers>
    `;
  }
}
