import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { toolStore } from '../../stores/tools';
import { getSelectedLayerSelection } from '../../stores/selection/selected-layer';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';
import { getToolMeta } from '../../tools/tool-registry';
import { LinkCelsCommand, UnlinkCelsCommand } from '../../commands/animation-commands';
import { SetCelOpacityCommand } from '../../commands/cel-opacity-command';
import { FlipSelectionCommand } from '../../commands/selection-commands';
import type { ToolOption } from '../../types/tool-meta';
import './options/pf-option-slider';
import './options/pf-option-checkbox';
import './options/pf-option-select';
import './pf-alternative-tools';
import '../color/pf-lightness-bar';
import '../ui/pf-button';

@customElement('pf-context-bar')
export class PFContextBar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 18px;
      gap: 12px;
      font-size: 12px;
      background: linear-gradient(180deg, rgba(15, 18, 24, 0.86), rgba(10, 12, 17, 0.84));
      border-bottom: 1px solid var(--pf-color-border);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.025) inset;
      color: var(--pf-color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .tool-name {
      font-weight: 700;
      color: var(--pf-color-text-main);
      white-space: nowrap;
      min-width: 86px;
    }

    .separator {
      width: 1px;
      height: 20px;
      background-color: var(--pf-color-border);
      flex-shrink: 0;
    }

    .options-section {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
      flex: 1;
      min-width: 0;
    }

    .alternatives-section {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .lightness-section {
      margin-left: auto;
    }

    .no-options {
      color: var(--pf-color-text-muted);
      font-family: var(--pf-font-serif);
      font-style: italic;
      text-transform: none;
      font-size: 11px;
    }

    /* Transform controls */
    .transform-section {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
      flex: 1;
    }

    .angle-control {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .angle-control label {
      color: var(--pf-color-text-muted);
      font-size: 12px;
      text-transform: uppercase;
    }

    .angle-control input[type='range'] {
      width: 80px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--pf-color-bg-tertiary);
      border-radius: var(--pf-radius-sm);
      cursor: pointer;
    }

    .angle-control input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      background: var(--pf-color-accent);
      border-radius: 0;
      cursor: pointer;
    }

    .angle-control input[type='number'] {
      width: 50px;
      padding: 2px 4px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-input);
      color: var(--pf-color-text-primary);
      font-size: 11px;
      text-align: right;
    }

    .toggle-group {
      display: flex;
      gap: 0;
    }

    .toggle-btn {
      padding: 4px 8px;
      border: 1px solid var(--pf-color-border);
      background: var(--pf-color-bg-input);
      color: var(--pf-color-text-secondary);
      font-size: 11px;
      cursor: pointer;
      text-transform: uppercase;
    }

    .toggle-btn:first-child {
      border-radius: var(--pf-radius-sm) 0 0 var(--pf-radius-sm);
    }

    .toggle-btn:last-child {
      border-radius: 0 var(--pf-radius-sm) var(--pf-radius-sm) 0;
      border-left: none;
    }

    .toggle-btn.active {
      background: var(--pf-color-accent);
      color: white;
      border-color: var(--pf-color-accent);
    }

    /* Cel controls */
    .cel-section {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
      padding: 0 var(--pf-spacing-2);
      border-left: 1px solid var(--pf-color-border);
    }

    .cel-label {
      color: var(--pf-color-text-muted);
      font-size: 11px;
      text-transform: uppercase;
    }

    .cel-opacity {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .opacity-scrubber {
      cursor: ew-resize;
      padding: 2px 6px;
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-input);
      color: var(--pf-color-text-primary);
      font-size: 11px;
      min-width: 36px;
      text-align: center;
      user-select: none;
    }

    .opacity-scrubber:hover {
      background: var(--pf-color-bg-secondary);
    }

    .opacity-scrubber.scrubbing {
      background: var(--pf-color-primary-muted);
    }
  `;

  @state() private isCommitting = false;
  @state() private isCelScrubbing = false;
  @state() private lockAspectRatio = true;
  private celScrubStartX = 0;
  private celScrubStartOpacity = 0;
  private celScrubBeforeOpacities: Map<string, number> = new Map();
  private celScrubContext: ProjectContext | null = null;
  private celScrubSelectedKeys: string[] = [];
  private context: ProjectContext = defaultProjectContext;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this._handleCelScrubMove);
    window.removeEventListener('mouseup', this._handleCelScrubEnd);
  }

  render() {
    const context = this.context;

    // Check if we're in transforming state - show transform controls instead
    const selectionState = context.selection.state.value;
    if (selectionState.type === 'transforming') {
      return this._renderTransformControls(context);
    }

    // Check if we have an active selection - show selection controls
    if (selectionState.type === 'selected') {
      return this._renderSelectionControls(selectionState, context);
    }

    const tool = toolStore.activeTool.value;
    const meta = getToolMeta(tool);

    if (!meta) {
      return html`
        <span class="tool-name">${this._formatToolName(tool)}</span>
        <div class="separator"></div>
        <span class="no-options">Unknown tool</span>
      `;
    }

    // Check for selected cels
    const selectedCelKeys = context.animation.selectedCelKeys.value;
    const hasSelectedCels = selectedCelKeys.size > 0;

    return html`
      <span class="tool-name">${meta.name}</span>
      <div class="separator"></div>

      <div class="options-section">${this._renderOptions(meta.options)}</div>
      <!--
      ${
        meta.alternatives.length > 0
          ? html`
              <div class="separator"></div>
              <div class="alternatives-section">
                <pf-alternative-tools .alternatives=${meta.alternatives}></pf-alternative-tools>
              </div>
            `
          : ''
      }
    -->
      ${hasSelectedCels ? this._renderCelControls(selectedCelKeys, context) : ''}

      <div class="separator"></div>
      <div class="lightness-section">
        <pf-lightness-bar></pf-lightness-bar>
      </div>
    `;
  }

  private _renderTransformControls(context: ProjectContext) {
    const selection = context.selection;
    const rotation = selection.rotation;
    const scale = selection.scale;
    const transformState = selection.getTransformState();

    // Calculate current dimensions
    const originalWidth = transformState?.originalBounds.width ?? 0;
    const originalHeight = transformState?.originalBounds.height ?? 0;
    const currentWidth = Math.round(originalWidth * scale.x);
    const currentHeight = Math.round(originalHeight * scale.y);

    return html`
      <span class="tool-name">Transform Selection</span>
      <div class="separator"></div>

      <div class="transform-section">
        <!-- Scale controls -->
        <div class="angle-control">
          <label>W:</label>
          <input
            type="number"
            min="1"
            .value=${String(currentWidth)}
            @input=${(e: Event) => this._handleWidthInput(e, context)}
            @keydown=${(e: KeyboardEvent) => this._handleTransformKeydown(e, context)}
            style="width: 45px;"
          />
          <span style="color: var(--pf-color-text-muted); font-size: 11px;">px</span>
        </div>

        <button
          class="toggle-btn ${this.lockAspectRatio ? 'active' : ''}"
          @click=${this._toggleAspectRatioLock}
          title="${this.lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}"
          style="padding: 2px 6px; font-size: 10px;"
        >
          ${this.lockAspectRatio ? '🔗' : '🔓'}
        </button>

        <div class="angle-control">
          <label>H:</label>
          <input
            type="number"
            min="1"
            .value=${String(currentHeight)}
            @input=${(e: Event) => this._handleHeightInput(e, context)}
            @keydown=${(e: KeyboardEvent) => this._handleTransformKeydown(e, context)}
            style="width: 45px;"
          />
          <span style="color: var(--pf-color-text-muted); font-size: 11px;">px</span>
        </div>

        <span style="color: var(--pf-color-text-muted); font-size: 11px;">
          (${Math.round(scale.x * 100)}%×${Math.round(scale.y * 100)}%)
        </span>

        <div class="separator"></div>

        <!-- Rotation controls -->
        <div class="angle-control">
          <label>Angle:</label>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            .value=${String(rotation)}
            @input=${(e: Event) => this._handleAngleSlider(e, context)}
          />
          <input
            type="number"
            min="0"
            max="360"
            .value=${String(Math.round(rotation))}
            @input=${(e: Event) => this._handleAngleInput(e, context)}
            @keydown=${(e: KeyboardEvent) => this._handleTransformKeydown(e, context)}
          />
          <span style="color: var(--pf-color-text-muted); font-size: 11px;">°</span>
        </div>

        <div class="separator"></div>

        <pf-button
          variant="primary"
          @click=${() => this._commitTransform(context)}
          ?disabled=${this.isCommitting}
          title="Apply transform (Enter)"
        >
          ${this.isCommitting ? 'Applying...' : 'Apply'}
        </pf-button>
        <pf-button
          @click=${() => this._cancelTransform(context)}
          ?disabled=${this.isCommitting}
          title="Cancel transform (Escape)"
        >
          Cancel
        </pf-button>
      </div>
    `;
  }

  private _handleWidthInput(e: Event, context: ProjectContext) {
    const selection = context.selection;
    const input = e.target as HTMLInputElement;
    const newWidth = parseInt(input.value) || 1;
    const transformState = selection.getTransformState();
    if (!transformState) return;

    const originalWidth = transformState.originalBounds.width;
    const newScaleX = newWidth / originalWidth;

    if (this.lockAspectRatio) {
      selection.updateScale(newScaleX, newScaleX);
    } else {
      selection.updateScale(newScaleX, selection.scale.y);
    }
  }

  private _handleHeightInput(e: Event, context: ProjectContext) {
    const selection = context.selection;
    const input = e.target as HTMLInputElement;
    const newHeight = parseInt(input.value) || 1;
    const transformState = selection.getTransformState();
    if (!transformState) return;

    const originalHeight = transformState.originalBounds.height;
    const newScaleY = newHeight / originalHeight;

    if (this.lockAspectRatio) {
      selection.updateScale(newScaleY, newScaleY);
    } else {
      selection.updateScale(selection.scale.x, newScaleY);
    }
  }

  private _toggleAspectRatioLock() {
    this.lockAspectRatio = !this.lockAspectRatio;
  }

  private _handleTransformKeydown(e: KeyboardEvent, context: ProjectContext) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._commitTransform(context);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._cancelTransform(context);
    }
  }

  private _handleAngleSlider(e: Event, context: ProjectContext) {
    const input = e.target as HTMLInputElement;
    const angle = parseFloat(input.value);
    context.selection.updateRotation(angle);
  }

  private _handleAngleInput(e: Event, context: ProjectContext) {
    const input = e.target as HTMLInputElement;
    let angle = parseFloat(input.value) || 0;
    // Clamp to valid range
    angle = Math.max(0, Math.min(360, angle));
    context.selection.updateRotation(angle);
  }

  private _commitTransform(context: ProjectContext) {
    if (this.isCommitting) return;

    // Dispatch event for viewport to handle the commit
    // The viewport has access to the canvas and can perform the rotation
    this.dispatchEvent(
      new CustomEvent('commit-transform', {
        bubbles: true,
        composed: true,
        detail: { context },
      })
    );
  }

  private _cancelTransform(context: ProjectContext) {
    if (this.isCommitting) return;
    context.selection.cancelTransform();
  }

  private _renderSelectionControls(
    selectionState: {
      bounds: { width: number; height: number };
    },
    context: ProjectContext
  ) {
    const bounds = selectionState.bounds;

    return html`
      <span class="tool-name">Selection</span>
      <div class="separator"></div>

      <div
        class="selection-section"
        style="display: flex; align-items: center; gap: var(--pf-spacing-2);"
      >
        <span style="color: var(--pf-color-text-muted); font-size: 11px;">
          ${bounds.width} × ${bounds.height} px
        </span>
        <div class="separator"></div>
        <pf-button
          @click=${() => this._flipSelection('horizontal', context)}
          title="Flip selection horizontally"
        >
          ↔ Flip H
        </pf-button>
        <pf-button
          @click=${() => this._flipSelection('vertical', context)}
          title="Flip selection vertically"
        >
          ↕ Flip V
        </pf-button>
        <div class="separator"></div>
        <pf-button
          @click=${() => this._shrinkToContent(context)}
          title="Shrink selection to fit content (Ctrl+release during draw)"
        >
          Shrink to Content
        </pf-button>
        <pf-button @click=${() => this._clearSelection(context)} title="Deselect (Escape)">
          Deselect
        </pf-button>
      </div>
    `;
  }

  private _flipSelection(direction: 'horizontal' | 'vertical', context: ProjectContext) {
    const selected = getSelectedLayerSelection(context);
    if (!selected) return;

    const command = new FlipSelectionCommand(
      selected.layer.id,
      context.animation.currentFrameId.value,
      selected.bounds,
      selected.shape,
      direction,
      selected.mask,
      context
    );
    context.history.execute(command);
  }

  private _shrinkToContent(context: ProjectContext) {
    const activeLayerId = context.layers.activeLayerId.value;
    const layer = context.layers.layers.value.find((l) => l.id === activeLayerId);
    if (layer?.canvas) {
      context.selection.shrinkToContent(layer.canvas);
    }
  }

  private _clearSelection(context: ProjectContext) {
    context.selection.clear();
  }

  _formatToolName(tool: string): string {
    return tool
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  _renderOptions(options: ToolOption[]) {
    if (options.length === 0) {
      return html`<span class="no-options">No options</span>`;
    }

    return options.map((option, index) => {
      const showSeparator = index < options.length - 1;
      return html`
        ${this._renderOption(option)} ${showSeparator ? html`<div class="separator"></div>` : ''}
      `;
    });
  }

  _renderOption(option: ToolOption) {
    switch (option.type) {
      case 'slider': {
        const isOpacity = option.storeKey === 'opacity';
        const multiplier = isOpacity ? 100 : 1;
        return html`
          <pf-option-slider
            label=${option.label}
            store=${option.store}
            storeKey=${option.storeKey}
            min=${option.min}
            max=${option.max}
            step=${option.step || 1}
            unit=${option.unit || ''}
            multiplier=${multiplier}
          ></pf-option-slider>
        `;
      }
      case 'checkbox':
        return html`
          <pf-option-checkbox
            label=${option.label}
            store=${option.store}
            storeKey=${option.storeKey}
          ></pf-option-checkbox>
        `;
      case 'select':
        return html`
          <pf-option-select
            label=${option.label}
            store=${option.store}
            storeKey=${option.storeKey}
            .options=${option.options}
          ></pf-option-select>
        `;
      default:
        return html``;
    }
  }

  // Cel controls
  private _renderCelControls(selectedCelKeys: Set<string>, context: ProjectContext) {
    const celKeys = Array.from(selectedCelKeys);
    const cels = context.animation.cels.value;

    // Get average opacity of selected cels
    let totalOpacity = 0;
    let celCount = 0;
    let hasLinked = false;

    for (const key of celKeys) {
      const cel = cels.get(key);
      if (cel) {
        totalOpacity += cel.opacity ?? 100;
        celCount++;
        if (cel.linkedCelId) {
          hasLinked = true;
        }
      }
    }

    const avgOpacity = celCount > 0 ? Math.round(totalOpacity / celCount) : 100;
    const canLink = celKeys.length >= 2;
    const canUnlink = hasLinked;

    return html`
      <div class="cel-section">
        <span class="cel-label">${celKeys.length} cel${celKeys.length > 1 ? 's' : ''}</span>

        <div class="cel-opacity">
          <span class="cel-label">Opacity:</span>
          <span
            class="opacity-scrubber ${this.isCelScrubbing ? 'scrubbing' : ''}"
            @mousedown=${(e: MouseEvent) => this._handleCelScrubStart(e, avgOpacity, context)}
            title="Drag to adjust opacity"
          >
            ${avgOpacity}%
          </span>
        </div>

        ${
          celKeys.length >= 2
            ? html`
                <pf-button
                  @click=${() => this._linkSelectedCels(context)}
                  ?disabled=${!canLink}
                  title="Link selected cels"
                >
                  🔗 Link
                </pf-button>
                <pf-button
                  @click=${() => this._unlinkSelectedCels(context)}
                  ?disabled=${!canUnlink}
                  title="Unlink selected cels"
                >
                  ⛓️‍💥 Unlink
                </pf-button>
              `
            : ''
        }
      </div>
    `;
  }

  private _handleCelScrubStart = (
    e: MouseEvent,
    currentOpacity: number,
    context: ProjectContext
  ) => {
    e.preventDefault();
    this.isCelScrubbing = true;
    this.celScrubContext = context;
    this.celScrubStartX = e.clientX;
    this.celScrubStartOpacity = currentOpacity;

    // Capture before opacities for undo/redo
    this.celScrubBeforeOpacities.clear();
    this.celScrubSelectedKeys = Array.from(context.animation.selectedCelKeys.value);
    const cels = context.animation.cels.value;
    for (const celKey of this.celScrubSelectedKeys) {
      const cel = cels.get(celKey);
      this.celScrubBeforeOpacities.set(celKey, cel?.opacity ?? 100);
    }

    window.addEventListener('mousemove', this._handleCelScrubMove);
    window.addEventListener('mouseup', this._handleCelScrubEnd);
  };

  private _handleCelScrubMove = (e: MouseEvent) => {
    if (!this.isCelScrubbing) return;
    const context = this.celScrubContext ?? this.context;

    const deltaX = e.clientX - this.celScrubStartX;
    const deltaPercent = Math.round(deltaX / 2);
    const newOpacity = Math.max(0, Math.min(100, this.celScrubStartOpacity + deltaPercent));

    context.animation.setCelOpacity(this.celScrubSelectedKeys, newOpacity);
  };

  private _handleCelScrubEnd = () => {
    window.removeEventListener('mousemove', this._handleCelScrubMove);
    window.removeEventListener('mouseup', this._handleCelScrubEnd);

    // Create undo/redo command if opacity actually changed
    const context = this.celScrubContext ?? this.context;
    const selectedCelKeys = this.celScrubSelectedKeys;
    if (selectedCelKeys.length > 0 && this.celScrubBeforeOpacities.size > 0) {
      // Get the current (final) opacity from any selected cel
      const cels = context.animation.cels.value;
      const firstCel = cels.get(selectedCelKeys[0]);
      const afterOpacity = firstCel?.opacity ?? 100;

      // Check if opacity actually changed
      const firstBeforeOpacity = this.celScrubBeforeOpacities.get(selectedCelKeys[0]) ?? 100;
      if (afterOpacity !== firstBeforeOpacity) {
        const command = new SetCelOpacityCommand(
          selectedCelKeys,
          new Map(this.celScrubBeforeOpacities),
          afterOpacity,
          context
        );
        // Execute adds to history - value already applied so it's a no-op
        context.history.execute(command);
      }
    }

    this.isCelScrubbing = false;
    this.celScrubContext = null;
    this.celScrubSelectedKeys = [];
    this.celScrubBeforeOpacities.clear();
  };

  private _linkSelectedCels = (context: ProjectContext) => {
    const selectedCelKeys = Array.from(context.animation.selectedCelKeys.value);
    if (selectedCelKeys.length >= 2) {
      const command = new LinkCelsCommand(selectedCelKeys, context);
      context.history.execute(command);
    }
  };

  private _unlinkSelectedCels = (context: ProjectContext) => {
    const selectedCelKeys = Array.from(context.animation.selectedCelKeys.value);
    if (selectedCelKeys.length > 0) {
      const command = new UnlinkCelsCommand(selectedCelKeys, context);
      context.history.execute(command);
    }
  };
}
