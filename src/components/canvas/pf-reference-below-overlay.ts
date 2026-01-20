import { css } from "lit";
import { customElement } from "lit/decorators.js";
import { PFReferenceOverlayBase } from "./pf-reference-overlay-base";
import type { ReferenceImage } from "../../types/reference";

@customElement("pf-reference-below-overlay")
export class PFReferenceBelowOverlay extends PFReferenceOverlayBase {
  static styles = css`
    ${PFReferenceOverlayBase.baseStyles}
    :host {
      z-index: 5;
    }
  `;

  protected getZIndex(): number {
    return 5;
  }

  protected filterImages(images: ReferenceImage[]): ReferenceImage[] {
    return images.filter((img) => img.visible && !img.aboveLayers);
  }
}
