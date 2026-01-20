import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { tilemapStore } from '../../stores/tilemap';
import { modeStore } from '../../stores/mode';
import { historyStore } from '../../stores/history';
import { TileLayerReorderCommand, TileLayerDeleteCommand } from '../../commands/tile-layer-command';
import type { TileLayer } from '../../types/tilemap';

/**
 * PFTileLayersPanel - Panel for managing tile layers in Map mode
 *
 * Features:
 * - Display list of tile layers (bottom-to-top visual order)
 * - Add new layers with auto-naming
 * - Select active layer for painting
 * - Inline rename on double-click
 * - Visibility and lock icons (display only for now)
 *
 * Story 4-1: Tile Layers Panel
 */
@customElement('pf-tile-layers-panel')
export class PFTileLayersPanel extends BaseComponent {
  private boundKeydownHandler: (e: KeyboardEvent) => void;

  constructor() {
    super();
    this.boundKeydownHandler = this.handleGlobalKeydown.bind(this);
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.boundKeydownHandler);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.boundKeydownHandler);
  }

  private handleGlobalKeydown(e: KeyboardEvent): void {
    // Only handle shortcuts in Map mode (Story 4-2 Task 5 / M4 fix)
    if (modeStore.mode.value !== 'map') {
      return;
    }

    // Ignore if typing in an input or editing a layer name
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (this.editingLayerId) {
      return;
    }

    const activeLayerId = this.activeLayerId;
    if (!activeLayerId) return;

    // H key - toggle visibility of active layer
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      tilemapStore.toggleLayerVisibility(activeLayerId);
    }

    // / key - toggle lock of active layer
    if (e.key === '/') {
      e.preventDefault();
      tilemapStore.toggleLayerLocked(activeLayerId);
    }

    // Cmd/Ctrl+Up - move layer up (towards top in z-order)
    // Story 4-3 Task 4.1, 4.3, 4.4
    // Note: Boundary check here avoids creating no-op commands in history stack
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
      e.preventDefault();
      const layers = tilemapStore.layers.value;
      const currentIndex = layers.findIndex(l => l.id === activeLayerId);
      if (currentIndex !== -1 && currentIndex < layers.length - 1) {
        const command = new TileLayerReorderCommand(activeLayerId, currentIndex, currentIndex + 1);
        historyStore.execute(command);
      }
    }

    // Cmd/Ctrl+Down - move layer down (towards bottom in z-order)
    // Story 4-3 Task 4.2, 4.3, 4.4
    // Note: Boundary check here avoids creating no-op commands in history stack
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
      e.preventDefault();
      const layers = tilemapStore.layers.value;
      const currentIndex = layers.findIndex(l => l.id === activeLayerId);
      if (currentIndex !== -1 && currentIndex > 0) {
        const command = new TileLayerReorderCommand(activeLayerId, currentIndex, currentIndex - 1);
        historyStore.execute(command);
      }
    }

    // Delete/Backspace - delete active layer (Story 4-4 Task 1.7)
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.handleDeleteClick(new Event('keydown'), activeLayerId);
    }
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--pf-spacing-2, 8px);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--pf-spacing-2, 8px);
    }

    .header-title {
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-main, #e0e0e0);
      font-weight: 500;
    }

    .add-layer-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: var(--pf-color-text-main, #e0e0e0);
      cursor: pointer;
      border-radius: var(--pf-radius-sm, 4px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: background 0.2s;
    }

    .add-layer-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .add-layer-btn:focus {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: 1px;
    }

    .layer-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-1, 4px);
    }

    .layer-item {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2, 8px);
      padding: var(--pf-spacing-2, 8px);
      background: var(--pf-color-bg-dark, #1a1a1a);
      border-radius: var(--pf-radius-sm, 4px);
      cursor: pointer;
      transition: background 0.15s;
      position: relative;
    }

    /* Drag-and-drop styles (Story 4-3 Task 1.6, 1.7) */
    .layer-item.dragging {
      opacity: 0.5;
      border: 1px dashed var(--pf-color-accent, #f59e0b);
    }

    .layer-item.drop-indicator-above::before {
      content: '';
      position: absolute;
      top: -2px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--pf-color-accent, #f59e0b);
    }

    .layer-item.drop-indicator-below::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--pf-color-accent, #f59e0b);
    }

    .layer-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .layer-item.selected {
      background: var(--pf-color-selection, rgba(245, 158, 11, 0.2));
      outline: 1px solid var(--pf-color-accent, #f59e0b);
    }

    .layer-item:focus {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: -2px;
    }

    .layer-icons {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-1, 4px);
    }

    .visibility-icon,
    .lock-icon,
    .delete-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: var(--pf-color-text-muted, #808080);
      cursor: pointer;
      border-radius: 2px;
    }

    .visibility-icon:hover,
    .lock-icon:hover {
      color: var(--pf-color-text-main, #e0e0e0);
      background: rgba(255, 255, 255, 0.1);
    }

    .delete-icon {
      opacity: 0.6;
      transition: opacity 0.15s, color 0.15s;
    }

    .delete-icon:hover {
      opacity: 1;
      color: var(--pf-color-danger, #ef4444);
      background: rgba(239, 68, 68, 0.1);
    }

    .visibility-icon.hidden {
      opacity: 0.4;
    }

    .lock-icon.locked {
      color: var(--pf-color-accent, #f59e0b);
    }

    /* Confirmation dialog styles (Story 4-4 Task 7) */
    .confirm-dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .confirm-dialog {
      background: var(--pf-color-bg-panel, #252525);
      border: 1px solid var(--pf-color-border, #404040);
      border-radius: var(--pf-radius-md, 8px);
      padding: var(--pf-spacing-4, 16px);
      max-width: 300px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }

    .confirm-dialog-title {
      font-size: var(--pf-font-size-md, 14px);
      font-weight: 500;
      color: var(--pf-color-text-main, #e0e0e0);
      margin-bottom: var(--pf-spacing-2, 8px);
    }

    .confirm-dialog-message {
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-muted, #808080);
      margin-bottom: var(--pf-spacing-4, 16px);
    }

    .confirm-dialog-buttons {
      display: flex;
      justify-content: flex-end;
      gap: var(--pf-spacing-2, 8px);
    }

    .confirm-dialog-btn {
      padding: var(--pf-spacing-1, 4px) var(--pf-spacing-3, 12px);
      border-radius: var(--pf-radius-sm, 4px);
      font-size: var(--pf-font-size-sm, 12px);
      cursor: pointer;
      border: none;
      transition: background 0.15s;
    }

    .confirm-dialog-btn-cancel {
      background: var(--pf-color-bg-dark, #1a1a1a);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .confirm-dialog-btn-cancel:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .confirm-dialog-btn-delete {
      background: var(--pf-color-danger, #ef4444);
      color: white;
    }

    .confirm-dialog-btn-delete:hover {
      background: #dc2626;
    }

    /* Toast message for "at least one layer required" */
    .toast-message {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--pf-color-bg-dark, #1a1a1a);
      border: 1px solid var(--pf-color-border, #404040);
      border-radius: var(--pf-radius-sm, 4px);
      padding: var(--pf-spacing-2, 8px) var(--pf-spacing-4, 16px);
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-main, #e0e0e0);
      z-index: 1001;
      animation: fadeInOut 2.5s ease-in-out;
    }

    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
      15% { opacity: 1; transform: translateX(-50%) translateY(0); }
      85% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }

    .layer-name {
      flex: 1;
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-main, #e0e0e0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .layer-name-input {
      flex: 1;
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-main, #e0e0e0);
      background: var(--pf-color-bg-panel, #252525);
      border: 1px solid var(--pf-color-accent, #f59e0b);
      border-radius: var(--pf-radius-sm, 4px);
      padding: 2px 4px;
      outline: none;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--pf-color-text-muted, #808080);
      font-size: var(--pf-font-size-sm, 12px);
      text-align: center;
      padding: var(--pf-spacing-4, 16px);
    }
  `;

  @state() private editingLayerId: string | null = null;
  @state() private editingName: string = '';

  // Drag-and-drop state (Story 4-3 Task 1)
  @state() private draggingLayerId: string | null = null;
  @state() private dropTargetId: string | null = null;
  @state() private dropPosition: 'above' | 'below' | null = null;

  // Delete confirmation state (Story 4-4 Task 7)
  @state() private pendingDeleteLayerId: string | null = null;
  @state() private toastMessage: string | null = null;
  private toastTimeoutId: number | null = null;

  private get layers(): TileLayer[] {
    return tilemapStore.layers.value;
  }

  private get activeLayerId(): string | null {
    return tilemapStore.activeLayerId.value;
  }

  private handleAddLayer(): void {
    const newLayer = tilemapStore.addLayer();
    // Fire component-level event for testing/integration (Task 3.5)
    this.dispatchEvent(new CustomEvent('layer-added', {
      bubbles: true,
      composed: true,
      detail: { layer: newLayer }
    }));
  }

  private handleLayerClick(layerId: string): void {
    // Don't change selection while editing
    if (this.editingLayerId) {
      return;
    }
    tilemapStore.setActiveLayer(layerId);
  }

  private handleLayerKeyDown(e: KeyboardEvent, layerId: string): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleLayerClick(layerId);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.navigateLayers(e.key === 'ArrowUp' ? -1 : 1);
    }
  }

  private navigateLayers(direction: number): void {
    const layers = this.layers;
    if (layers.length === 0) return;

    // Layers are rendered in reverse order (top layer first in UI)
    const reversedLayers = [...layers].reverse();
    const currentIndex = reversedLayers.findIndex(l => l.id === this.activeLayerId);

    // If no current selection, start at 0; otherwise move and clamp to valid range
    const newIndex = currentIndex === -1
      ? 0
      : Math.max(0, Math.min(reversedLayers.length - 1, currentIndex + direction));

    const newLayer = reversedLayers[newIndex];
    if (newLayer && newLayer.id !== this.activeLayerId) {
      tilemapStore.setActiveLayer(newLayer.id);
      // Focus the new layer item
      this.updateComplete.then(() => {
        const items = this.shadowRoot?.querySelectorAll('.layer-item');
        (items?.[newIndex] as HTMLElement)?.focus();
      });
    }
  }

  private handleVisibilityClick(e: Event, layerId: string): void {
    e.stopPropagation(); // Don't trigger layer selection
    tilemapStore.toggleLayerVisibility(layerId);
  }

  private handleLockClick(e: Event, layerId: string): void {
    e.stopPropagation(); // Don't trigger layer selection
    tilemapStore.toggleLayerLocked(layerId);
  }

  // ========================================
  // Story 4-4: Layer Deletion Handlers
  // ========================================

  /**
   * Handle delete button click (Story 4-4 Task 1.2-1.6)
   */
  private handleDeleteClick(e: Event, layerId: string): void {
    e.stopPropagation();

    const layers = tilemapStore.layers.value;

    // Block if only one layer (AC #3)
    if (layers.length === 1) {
      this.showToast('At least one layer is required');
      return;
    }

    // Check if layer is empty (AC #1)
    if (tilemapStore.isLayerEmpty(layerId)) {
      // Delete immediately without confirmation
      this.executeDelete(layerId);
    } else {
      // Show confirmation dialog
      this.pendingDeleteLayerId = layerId;
    }
  }

  /**
   * Confirm deletion from dialog (Story 4-4 Task 7.3)
   */
  private confirmDelete(): void {
    if (this.pendingDeleteLayerId) {
      this.executeDelete(this.pendingDeleteLayerId);
      this.pendingDeleteLayerId = null;
    }
  }

  /**
   * Cancel deletion dialog (Story 4-4 Task 7.3)
   */
  private cancelDelete(): void {
    this.pendingDeleteLayerId = null;
  }

  /**
   * Execute layer deletion via command (Story 4-4 Task 1.4, AC #2)
   */
  private executeDelete(layerId: string): void {
    const layers = tilemapStore.layers.value;
    const layerIndex = layers.findIndex(l => l.id === layerId);
    const layer = layers[layerIndex];

    if (layer) {
      const command = new TileLayerDeleteCommand(layer, layerIndex);
      historyStore.execute(command);
    }
  }

  /**
   * Show toast message (Story 4-4 Task 1.6)
   */
  private showToast(message: string): void {
    // Clear existing timeout
    if (this.toastTimeoutId !== null) {
      clearTimeout(this.toastTimeoutId);
    }

    this.toastMessage = message;

    // Auto-hide after animation completes (2.5s)
    this.toastTimeoutId = window.setTimeout(() => {
      this.toastMessage = null;
      this.toastTimeoutId = null;
    }, 2500);
  }

  /**
   * Handle dialog keyboard events (Story 4-4 Task 7.4)
   */
  private handleDialogKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelDelete();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.confirmDelete();
    }
  }

  private handleNameDoubleClick(e: MouseEvent, layerId: string): void {
    e.stopPropagation();
    const layer = tilemapStore.getLayerById(layerId);
    if (layer) {
      this.editingLayerId = layerId;
      this.editingName = layer.name;
    }
  }

  private handleNameKeyDown(e: KeyboardEvent, layerId: string): void {
    if (e.key === 'Enter') {
      this.confirmRename(layerId);
    } else if (e.key === 'Escape') {
      this.cancelRename();
    }
  }

  private handleNameBlur(layerId: string): void {
    if (this.editingLayerId === layerId) {
      this.confirmRename(layerId);
    }
  }

  private handleNameInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.editingName = input.value;
  }

  private confirmRename(layerId: string): void {
    // Guard against layer being deleted during edit
    if (tilemapStore.getLayerById(layerId)) {
      tilemapStore.renameLayer(layerId, this.editingName);
    }
    this.editingLayerId = null;
    this.editingName = '';
  }

  private cancelRename(): void {
    this.editingLayerId = null;
    this.editingName = '';
  }

  // ========================================
  // Story 4-3: Drag-and-Drop Handlers (Task 1)
  // ========================================

  private handleDragStart(e: DragEvent, layerId: string): void {
    this.draggingLayerId = layerId;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', layerId);
      e.dataTransfer.effectAllowed = 'move';
    }

    // Add dragging class after brief delay for visual feedback
    requestAnimationFrame(() => {
      this.requestUpdate();
    });
  }

  private handleDragOver(e: DragEvent, targetLayerId: string): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }

    if (targetLayerId === this.draggingLayerId) {
      this.dropTargetId = null;
      this.dropPosition = null;
      return;
    }

    // Determine if dropping above or below based on mouse position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    this.dropTargetId = targetLayerId;
    this.dropPosition = e.clientY < midpoint ? 'above' : 'below';
  }

  private handleDragLeave(e: DragEvent): void {
    // Only clear if leaving the layer item entirely
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as HTMLElement;

    if (!currentTarget.contains(relatedTarget)) {
      // Check if we're moving to another layer item
      const layerList = this.shadowRoot?.querySelector('.layer-list');
      if (relatedTarget && layerList?.contains(relatedTarget)) {
        // Moving to another layer item, don't clear
        return;
      }
      this.dropTargetId = null;
      this.dropPosition = null;
    }
  }

  private handleDrop(e: DragEvent, targetLayerId: string): void {
    e.preventDefault();

    if (!this.draggingLayerId || this.draggingLayerId === targetLayerId) {
      this.cleanupDragState();
      return;
    }

    const layers = tilemapStore.layers.value;
    const sourceIndex = layers.findIndex(l => l.id === this.draggingLayerId);
    const targetIndex = layers.findIndex(l => l.id === targetLayerId);

    if (sourceIndex === -1 || targetIndex === -1) {
      this.cleanupDragState();
      return;
    }

    // Calculate new index based on drop position
    // Remember: UI is reversed, so "above" in UI = higher z-order = higher array index
    let newIndex: number;
    if (this.dropPosition === 'above') {
      // In reversed UI, "above" means higher z-order = higher array index
      newIndex = sourceIndex < targetIndex ? targetIndex : targetIndex + 1;
    } else {
      // "below" means lower z-order = lower array index
      newIndex = sourceIndex > targetIndex ? targetIndex : targetIndex - 1;
    }

    // Clamp to valid range
    newIndex = Math.max(0, Math.min(layers.length - 1, newIndex));

    // Execute via history for undo support
    if (sourceIndex !== newIndex) {
      const command = new TileLayerReorderCommand(this.draggingLayerId, sourceIndex, newIndex);
      historyStore.execute(command);
    }

    this.cleanupDragState();
  }

  private handleDragEnd(_e: DragEvent): void {
    this.cleanupDragState();
  }

  private cleanupDragState(): void {
    this.draggingLayerId = null;
    this.dropTargetId = null;
    this.dropPosition = null;
  }

  private renderLayerItem(layer: TileLayer) {
    const isSelected = layer.id === this.activeLayerId;
    const isEditing = this.editingLayerId === layer.id;
    const isDragging = this.draggingLayerId === layer.id;
    const isDropTarget = this.dropTargetId === layer.id;
    const dropClass = isDropTarget && this.dropPosition
      ? `drop-indicator-${this.dropPosition}`
      : '';

    return html`
      <div
        class="layer-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${dropClass}"
        tabindex="0"
        role="option"
        aria-selected="${isSelected}"
        draggable="true"
        @click=${() => this.handleLayerClick(layer.id)}
        @keydown=${(e: KeyboardEvent) => this.handleLayerKeyDown(e, layer.id)}
        @dragstart=${(e: DragEvent) => this.handleDragStart(e, layer.id)}
        @dragover=${(e: DragEvent) => this.handleDragOver(e, layer.id)}
        @dragleave=${(e: DragEvent) => this.handleDragLeave(e)}
        @drop=${(e: DragEvent) => this.handleDrop(e, layer.id)}
        @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
      >
        <div class="layer-icons">
          <span
            class="visibility-icon ${!layer.visible ? 'hidden' : ''}"
            title="${layer.visible ? 'Hide layer' : 'Show layer'}"
            @click=${(e: Event) => this.handleVisibilityClick(e, layer.id)}
          >
            👁
          </span>
          <span
            class="lock-icon ${layer.locked ? 'locked' : ''}"
            title="${layer.locked ? 'Unlock layer' : 'Lock layer'}"
            @click=${(e: Event) => this.handleLockClick(e, layer.id)}
          >
            ${layer.locked ? '🔒' : '🔓'}
          </span>
          <span
            class="delete-icon"
            title="Delete layer"
            @click=${(e: Event) => this.handleDeleteClick(e, layer.id)}
          >
            🗑️
          </span>
        </div>
        ${isEditing
          ? html`
              <input
                type="text"
                class="layer-name-input"
                .value=${this.editingName}
                @input=${this.handleNameInput}
                @keydown=${(e: KeyboardEvent) => this.handleNameKeyDown(e, layer.id)}
                @blur=${() => this.handleNameBlur(layer.id)}
                @click=${(e: Event) => e.stopPropagation()}
              />
            `
          : html`
              <span
                class="layer-name"
                @dblclick=${(e: MouseEvent) => this.handleNameDoubleClick(e, layer.id)}
              >
                ${layer.name}
              </span>
            `}
      </div>
    `;
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    // Auto-focus input when entering edit mode
    if (changedProperties.has('editingLayerId') && this.editingLayerId) {
      const input = this.shadowRoot?.querySelector('.layer-name-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }

    // Focus dialog overlay when confirmation dialog opens (H2/M3 fix)
    if (changedProperties.has('pendingDeleteLayerId') && this.pendingDeleteLayerId) {
      const overlay = this.shadowRoot?.querySelector('.confirm-dialog-overlay') as HTMLElement;
      if (overlay) {
        overlay.focus();
      }
    }
  }

  render() {
    const layers = this.layers;

    // Clear editing state if layer was deleted externally
    if (this.editingLayerId && !layers.find(l => l.id === this.editingLayerId)) {
      this.editingLayerId = null;
      this.editingName = '';
    }

    // Clear pending delete if layer was deleted externally
    if (this.pendingDeleteLayerId && !layers.find(l => l.id === this.pendingDeleteLayerId)) {
      this.pendingDeleteLayerId = null;
    }

    // Render layers in reverse order (top layer first in UI)
    const reversedLayers = [...layers].reverse();

    // Get the layer name for confirmation dialog
    const pendingDeleteLayer = this.pendingDeleteLayerId
      ? layers.find(l => l.id === this.pendingDeleteLayerId)
      : null;

    return html`
      <div class="header">
        <span class="header-title">Tile Layers</span>
        <button
          class="add-layer-btn"
          title="Add Layer"
          @click=${this.handleAddLayer}
        >
          +
        </button>
      </div>

      <div class="layer-list" role="listbox" aria-label="Tile Layers">
        ${layers.length === 0
          ? html`<div class="empty-state">No layers</div>`
          : reversedLayers.map(layer => this.renderLayerItem(layer))}
      </div>

      ${this.pendingDeleteLayerId && pendingDeleteLayer
        ? html`
            <div
              class="confirm-dialog-overlay"
              tabindex="-1"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              @click=${this.cancelDelete}
              @keydown=${(e: KeyboardEvent) => this.handleDialogKeydown(e)}
            >
              <div class="confirm-dialog" @click=${(e: Event) => e.stopPropagation()}>
                <div class="confirm-dialog-title" id="confirm-dialog-title">Delete Layer?</div>
                <div class="confirm-dialog-message">
                  Delete layer "${pendingDeleteLayer.name}"? This layer contains tiles that will be lost.
                </div>
                <div class="confirm-dialog-buttons">
                  <button
                    class="confirm-dialog-btn confirm-dialog-btn-cancel"
                    @click=${this.cancelDelete}
                  >
                    Cancel
                  </button>
                  <button
                    class="confirm-dialog-btn confirm-dialog-btn-delete"
                    @click=${this.confirmDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          `
        : ''}

      ${this.toastMessage
        ? html`<div class="toast-message">${this.toastMessage}</div>`
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-tile-layers-panel': PFTileLayersPanel;
  }
}
