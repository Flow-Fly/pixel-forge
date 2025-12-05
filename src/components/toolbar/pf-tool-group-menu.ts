import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ToolType } from '../../stores/tools';
import { getToolMeta } from '../../tools/tool-registry';

/**
 * Popover menu showing all tools in a group
 * Appears on right-click of a tool button
 */
@customElement('pf-tool-group-menu')
export class PFToolGroupMenu extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      z-index: 1000;
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      padding: 4px;
      min-width: 120px;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      color: var(--pf-color-text-main);
      background: none;
      border: none;
      width: 100%;
      text-align: left;
    }

    .menu-item:hover {
      background: var(--pf-color-bg-hover);
    }

    .menu-item.active {
      background: var(--pf-color-primary-muted);
    }

    .tool-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }

    .tool-name {
      flex: 1;
    }

    .shortcut {
      color: var(--pf-color-text-muted);
      font-size: 10px;
    }
  `;

  @property({ type: Array }) tools: ToolType[] = [];
  @property({ type: String }) activeTool: ToolType = 'pencil';
  @property({ type: Number }) x = 0;
  @property({ type: Number }) y = 0;

  private getToolIcon(tool: ToolType): string {
    const icons: Record<string, string> = {
      'pencil': '✏️',
      'eraser': '🧹',
      'eyedropper': '💧',
      'marquee-rect': '⬚',
      'lasso': '◯',
      'polygonal-lasso': '⬡',
      'magic-wand': '✨',
      'line': '╱',
      'rectangle': '▢',
      'ellipse': '◯',
      'fill': '🪣',
      'gradient': '▤',
      'transform': '⤡',
      'hand': '✋',
      'zoom': '🔍',
    };
    return icons[tool] || '•';
  }

  private getShortcut(tool: ToolType): string {
    const shortcuts: Record<string, string> = {
      'pencil': 'B',
      'eraser': 'E',
      'eyedropper': 'I',
      'marquee-rect': 'M',
      'lasso': 'Q',
      'polygonal-lasso': '⇧Q',
      'magic-wand': 'W',
      'line': 'L',
      'rectangle': 'U',
      'ellipse': '⇧U',
      'fill': 'G',
      'gradient': '⇧G',
      'transform': 'V',
      'hand': 'H',
      'zoom': 'Z',
    };
    return shortcuts[tool] || '';
  }

  private selectTool(tool: ToolType) {
    this.dispatchEvent(new CustomEvent('tool-selected', {
      detail: { tool },
      bubbles: true,
      composed: true,
    }));
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('x') || changedProperties.has('y')) {
      this.style.left = `${this.x}px`;
      this.style.top = `${this.y}px`;
    }
  }

  render() {
    return html`
      ${this.tools.map(tool => {
        const meta = getToolMeta(tool);
        const name = meta?.name || tool;
        const isActive = tool === this.activeTool;

        return html`
          <button
            class="menu-item ${isActive ? 'active' : ''}"
            @click=${() => this.selectTool(tool)}
          >
            <span class="tool-icon">${this.getToolIcon(tool)}</span>
            <span class="tool-name">${name}</span>
            <span class="shortcut">${this.getShortcut(tool)}</span>
          </button>
        `;
      })}
    `;
  }
}
