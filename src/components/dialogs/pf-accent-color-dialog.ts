import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { settingsStore, ACCENT_THEMES, type AccentTheme } from "../../stores/settings";
import "../ui/pf-button";

@customElement("pf-accent-color-dialog")
export class PFAccentColorDialog extends BaseComponent {
  static styles = css`
    :host {
      display: none;
    }

    :host([open]) {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: var(--pf-z-modal, 1000);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dialog {
      background: var(--pf-color-bg-panel, #141414);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 8px;
      padding: 20px;
      min-width: 320px;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--pf-color-text-muted, #808080);
      cursor: pointer;
      font-size: 18px;
      padding: 4px;
      line-height: 1;
    }

    .close-btn:hover {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .themes-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }

    .theme-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px;
      border-radius: 6px;
      cursor: pointer;
      border: 2px solid transparent;
      background: var(--pf-color-bg-surface, #1e1e1e);
      transition: all 0.15s ease;
    }

    .theme-option:hover {
      background: var(--pf-color-bg-tertiary, #282828);
    }

    .theme-option.selected {
      border-color: var(--pf-color-accent, #f59e0b);
      background: var(--pf-color-bg-tertiary, #282828);
    }

    .color-preview {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      margin-bottom: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .theme-name {
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
    }

    .theme-option.selected .theme-name {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;
  @state() private selectedTheme: AccentTheme = "ember";

  connectedCallback() {
    super.connectedCallback();
    this.selectedTheme = settingsStore.accentTheme.value;
    window.addEventListener("show-accent-color-dialog", this.handleShowDialog);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("show-accent-color-dialog", this.handleShowDialog);
  }

  private handleShowDialog = () => {
    this.selectedTheme = settingsStore.accentTheme.value;
    this.open = true;
  };

  private handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.close();
    }
  }

  private close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("close"));
  }

  private selectTheme(theme: AccentTheme) {
    this.selectedTheme = theme;
    // Apply immediately for preview
    settingsStore.setAccentTheme(theme);
  }

  private handleApply() {
    settingsStore.setAccentTheme(this.selectedTheme);
    this.close();
  }

  render() {
    const themes = Object.entries(ACCENT_THEMES) as [AccentTheme, typeof ACCENT_THEMES[AccentTheme]][];

    return html`
      <div class="overlay" @click=${this.handleOverlayClick}>
        <div class="dialog">
          <div class="header">
            <h2>Accent Color</h2>
            <button class="close-btn" @click=${this.close}>&times;</button>
          </div>

          <div class="themes-grid">
            ${themes.map(([key, theme]) => html`
              <div
                class="theme-option ${this.selectedTheme === key ? 'selected' : ''}"
                @click=${() => this.selectTheme(key)}
              >
                <div class="color-preview" style="background: ${theme.rest}"></div>
                <span class="theme-name">${theme.name}</span>
              </div>
            `)}
          </div>

          <div class="actions">
            <pf-button @click=${this.close}>Close</pf-button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-accent-color-dialog": PFAccentColorDialog;
  }
}
