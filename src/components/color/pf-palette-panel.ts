import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { colorStore } from '../../stores/colors';

@customElement('pf-palette-panel')
export class PFPalettePanel extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      padding: var(--pf-spacing-2);
    }

    .palette-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 1px;
      background-color: var(--pf-color-border);
      border: 1px solid var(--pf-color-border);
    }

    .swatch {
      aspect-ratio: 1;
      cursor: pointer;
    }

    .swatch:hover {
      transform: scale(1.1);
      z-index: 1;
      box-shadow: 0 0 4px rgba(0,0,0,0.5);
    }
  `;

  // DB32 Palette
  @state() colors = [
    '#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a',
    '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
    '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
    '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30'
  ];

  selectColor(color: string) {
    colorStore.setPrimaryColor(color);
  }

  render() {
    return html`
      <div class="palette-grid">
        ${this.colors.map(color => html`
          <div 
            class="swatch" 
            style="background-color: ${color}"
            title="${color}"
            @click=${() => this.selectColor(color)}
          ></div>
        `)}
      </div>
    `;
  }
}
