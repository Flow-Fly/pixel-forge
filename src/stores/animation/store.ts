/**
 * Animation Store
 *
 * Central store for animation state management.
 * Delegates specialized operations to extracted modules.
 */

import { signal } from '../../core/signal';
import type { Frame, Cel, OnionSkinSettings, FrameTag } from '../../types/animation';
import type { TextCelData } from '../../types/text';
import { layerStore } from '../layers';
import { projectStore } from '../project';
import { createLayerCanvas } from '../../utils/canvas-factory';

// Import extracted modules
import type { PlaybackMode } from './types';
import { EMPTY_CEL_LINK_ID, getCelKey } from './types';
import * as indexBuffer from './index-buffer';
import * as paletteSync from './palette-sync';
import * as celSelection from './cel-selection';
import * as celLinking from './cel-linking';
import * as tagManager from './tag-manager';
import * as textCels from './text-cels';
import { createPlaybackEngine, type PlaybackEngine } from './playback';

class AnimationStore {
  // ===== Core State (Signals) =====
  frames = signal<Frame[]>([]);
  cels = signal<Map<string, Cel>>(new Map());
  currentFrameId = signal<string>('');
  isPlaying = signal<boolean>(false);
  fps = signal<number>(12);
  onionSkin = signal<OnionSkinSettings>({
    enabled: false,
    prevFrames: 1,
    nextFrames: 1,
    opacityStep: 0.5,
    tint: true
  });

  // Playback state
  playbackMode = signal<PlaybackMode>('all');
  activeTagId = signal<string | null>(null);
  tags = signal<FrameTag[]>([]);

  // UI state
  tagsExpanded = signal<boolean>(true);

  // Cel selection state
  selectedCelKeys = signal<Set<string>>(new Set());
  selectionAnchor = signal<{ layerId: string; frameId: string } | null>(null);

  // Tag resize preview state
  tagResizePreview = signal<{ tagId: string; previewStart: number; previewEnd: number } | null>(null);

  // ===== Private State =====
  private playbackEngine: PlaybackEngine;
  private sharedTransparentCanvas: HTMLCanvasElement | null = null;
  // Stored for future dispose() implementation
  private _cleanupPaletteListeners: (() => void) | null = null;

  constructor() {
    // Set up playback engine
    this.playbackEngine = createPlaybackEngine({
      getCurrentFrameId: () => this.currentFrameId.value,
      getFrames: () => this.frames.value,
      getTags: () => this.tags.value,
      goToFrame: (id) => this.goToFrame(id),
      getCurrentFrame: () => this.getCurrentFrame()
    });

    this.initialize();
    this.loadUIState();
    this.setupPaletteListeners();
  }

  // ===== Initialization =====

  private initialize() {
    const initialFrame: Frame = {
      id: crypto.randomUUID(),
      order: 0,
      duration: 100
    };
    this.frames.value = [initialFrame];
    this.initializeCelsForFrame(initialFrame.id);
    this.goToFrame(initialFrame.id);
  }

  private loadUIState() {
    const tagsExpanded = localStorage.getItem('pf-tags-expanded');
    if (tagsExpanded !== null) {
      this.tagsExpanded.value = tagsExpanded === 'true';
    }
  }

  private setupPaletteListeners() {
    this._cleanupPaletteListeners = paletteSync.setupPaletteListeners(
      () => this.cels.value,
      (newCels) => { this.cels.value = newCels; },
      () => this.rebuildAllCelCanvases()
    );
  }

  // ===== Shared Transparent Canvas =====

  private getSharedTransparentCanvas(width: number, height: number): HTMLCanvasElement {
    if (
      !this.sharedTransparentCanvas ||
      this.sharedTransparentCanvas.width !== width ||
      this.sharedTransparentCanvas.height !== height
    ) {
      const { canvas } = createLayerCanvas(width, height);
      this.sharedTransparentCanvas = canvas;
    }
    return this.sharedTransparentCanvas;
  }

  // ===== Cel Key Helper =====

  getCelKey(layerId: string, frameId: string): string {
    return getCelKey(layerId, frameId);
  }

  getCelCanvas(frameId: string, layerId: string): HTMLCanvasElement | undefined {
    const key = getCelKey(layerId, frameId);
    return this.cels.value.get(key)?.canvas;
  }

  // ===== Frame Management =====

  private initializeCelsForFrame(frameId: string) {
    const layers = layerStore.layers.value;
    const newCels = new Map(this.cels.value);
    const firstLayer = layers[0];
    const width = firstLayer?.canvas?.width ?? 64;
    const height = firstLayer?.canvas?.height ?? 64;
    const sharedCanvas = this.getSharedTransparentCanvas(width, height);

    layers.forEach(layer => {
      const key = getCelKey(layer.id, frameId);
      if (!newCels.has(key)) {
        newCels.set(key, {
          id: crypto.randomUUID(),
          layerId: layer.id,
          frameId,
          canvas: sharedCanvas,
          linkedCelId: EMPTY_CEL_LINK_ID,
          linkType: 'soft'
        });
      }
    });

    this.cels.value = newCels;
  }

  goToFrame(frameId: string) {
    this.currentFrameId.value = frameId;
    this.syncLayerCanvases();
  }

  syncLayerCanvases() {
    const frameId = this.currentFrameId.value;
    const layers = layerStore.layers.value;
    const cels = new Map(this.cels.value);
    let celsUpdated = false;

    layers.forEach(layer => {
      const key = getCelKey(layer.id, frameId);
      let cel = cels.get(key);

      if (!cel) {
        const { canvas, ctx } = createLayerCanvas(
          projectStore.width.value,
          projectStore.height.value
        );
        if (layer.canvas) {
          ctx.drawImage(layer.canvas, 0, 0);
        }

        cel = {
          id: crypto.randomUUID(),
          layerId: layer.id,
          frameId,
          canvas
        };
        cels.set(key, cel);
        celsUpdated = true;
      }

      if (cel && layer.canvas !== cel.canvas) {
        layerStore.updateLayer(layer.id, { canvas: cel.canvas });
      }
    });

    if (celsUpdated) {
      this.cels.value = cels;
    }
  }

  addFrame(duplicate: boolean = true, sourceFrameId?: string) {
    this.syncLayerCanvases();

    const frames = this.frames.value;
    const frameIdToUse = sourceFrameId ?? this.currentFrameId.value;
    const sourceFrameIndex = frames.findIndex(f => f.id === frameIdToUse);
    const insertIndex = sourceFrameIndex === -1 ? frames.length : sourceFrameIndex + 1;

    const newFrame: Frame = {
      id: crypto.randomUUID(),
      order: insertIndex,
      duration: 100
    };

    const newFrames = [
      ...frames.slice(0, insertIndex),
      newFrame,
      ...frames.slice(insertIndex)
    ];

    for (let i = insertIndex + 1; i < newFrames.length; i++) {
      newFrames[i] = { ...newFrames[i], order: i };
    }

    this.frames.value = newFrames;

    // Adjust tags for frame insertion
    this.tags.value = tagManager.adjustTagsForFrameInsert(this.tags.value, insertIndex);

    const layers = layerStore.layers.value;
    const cels = new Map(this.cels.value);
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    const sharedCanvas = this.getSharedTransparentCanvas(width, height);

    layers.forEach(layer => {
      const sourceKey = getCelKey(layer.id, frameIdToUse);
      const targetKey = getCelKey(layer.id, newFrame.id);
      const sourceCel = cels.get(sourceKey);

      // Determine if this layer should link to source:
      // - If duplicate=true: all layers link (explicit duplicate action)
      // - If duplicate=false: only continuous layers link
      const shouldLink = duplicate || layer.continuous;

      if (shouldLink && sourceCel && sourceFrameIndex !== -1) {
        // Create linked cel
        const linkedCelId = sourceCel.linkedCelId ?? crypto.randomUUID();
        // Continuous layers use hard links (edits propagate to all linked cels)
        // Non-continuous use soft links (edits break the link via copy-on-write)
        const linkTypeToUse = layer.continuous ? 'hard' : (sourceCel.linkType ?? 'soft');

        if (!sourceCel.linkedCelId) {
          cels.set(sourceKey, { ...sourceCel, linkedCelId, linkType: linkTypeToUse });
        }

        cels.set(targetKey, {
          id: crypto.randomUUID(),
          layerId: layer.id,
          frameId: newFrame.id,
          canvas: sourceCel.canvas,
          linkedCelId,
          linkType: linkTypeToUse,
          opacity: sourceCel.opacity,
          textCelData: sourceCel.textCelData
        });
      } else {
        // Create empty cel (non-continuous layer with new empty frame)
        cels.set(targetKey, {
          id: crypto.randomUUID(),
          layerId: layer.id,
          frameId: newFrame.id,
          canvas: sharedCanvas,
          linkedCelId: EMPTY_CEL_LINK_ID,
          linkType: 'soft'
        });
      }
    });

    this.cels.value = cels;

    this.goToFrame(newFrame.id);
  }

  deleteFrame(frameId: string) {
    const frames = this.frames.value;
    if (frames.length <= 1) return;

    const frameIndex = frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    const newFrames = frames.filter(f => f.id !== frameId);

    const cels = new Map(this.cels.value);
    const layers = layerStore.layers.value;
    layers.forEach(layer => {
      const key = getCelKey(layer.id, frameId);
      cels.delete(key);
    });
    this.cels.value = cels;

    this.frames.value = newFrames;

    // Adjust tags for frame deletion
    this.tags.value = tagManager.adjustTagsForFrameDelete(this.tags.value, frameIndex);

    if (this.currentFrameId.value === frameId) {
      const newIndex = Math.max(0, frameIndex - 1);
      this.goToFrame(newFrames[newIndex].id);
    }
  }

  // ===== Index Buffer (delegated) =====

  getCelIndexBuffer(layerId: string, frameId: string): Uint8Array | undefined {
    return indexBuffer.getCelIndexBuffer(this.cels.value, layerId, frameId);
  }

  ensureCelIndexBuffer(layerId: string, frameId: string): Uint8Array {
    const result = indexBuffer.ensureCelIndexBuffer(
      this.cels.value,
      layerId,
      frameId,
      () => this.syncLayerCanvases()
    );
    if (result.cels !== this.cels.value) {
      this.cels.value = result.cels;
    }
    return result.indexBuffer;
  }

  updateCelIndexBuffer(layerId: string, frameId: string, buffer: Uint8Array): void {
    this.cels.value = indexBuffer.updateCelIndexBuffer(this.cels.value, layerId, frameId, buffer);
  }

  rebuildAllCelCanvases(): void {
    indexBuffer.rebuildAllCelCanvases(this.cels.value);
  }

  rebuildAllIndexBuffers(): void {
    this.cels.value = indexBuffer.rebuildAllIndexBuffers(this.cels.value);
  }

  scanUsedColors(): Set<string> {
    return indexBuffer.scanUsedColors(this.cels.value);
  }

  scanUsedColorsFromCanvas(): Set<string> {
    return indexBuffer.scanUsedColorsFromCanvas(this.cels.value);
  }

  // ===== Frame Navigation =====

  nextFrame() {
    const frames = this.frames.value;
    const currentIndex = frames.findIndex(f => f.id === this.currentFrameId.value);
    if (currentIndex < frames.length - 1) {
      this.goToFrame(frames[currentIndex + 1].id);
    }
  }

  prevFrame() {
    const frames = this.frames.value;
    const currentIndex = frames.findIndex(f => f.id === this.currentFrameId.value);
    if (currentIndex > 0) {
      this.goToFrame(frames[currentIndex - 1].id);
    }
  }

  goToFirstFrame() {
    const frames = this.frames.value;
    if (frames.length > 0) {
      this.goToFrame(frames[0].id);
    }
  }

  goToLastFrame() {
    const frames = this.frames.value;
    if (frames.length > 0) {
      this.goToFrame(frames[frames.length - 1].id);
    }
  }

  // ===== Playback (delegated to engine) =====

  togglePlayback() {
    const nowPlaying = this.playbackEngine.toggle();
    this.isPlaying.value = nowPlaying;
  }

  startPlayback() {
    this.playbackEngine.start();
    this.isPlaying.value = true;
  }

  stopPlayback() {
    this.playbackEngine.stop();
    this.isPlaying.value = false;
  }

  getCurrentFrame(): Frame | undefined {
    return this.frames.value.find(f => f.id === this.currentFrameId.value);
  }

  advanceFrame() {
    this.playbackEngine.advanceFrame();
  }

  setPlaybackMode(mode: PlaybackMode, tagId?: string) {
    this.playbackMode.value = mode;
    this.playbackEngine.playbackMode = mode;
    if (mode === 'tag' && tagId) {
      this.activeTagId.value = tagId;
      this.playbackEngine.activeTagId = tagId;
    } else if (mode === 'all') {
      this.activeTagId.value = null;
      this.playbackEngine.activeTagId = null;
    }
  }

  setFrameDuration(frameId: string, duration: number) {
    const frames = this.frames.value;
    const frameIndex = frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    const newFrames = [...frames];
    newFrames[frameIndex] = { ...frames[frameIndex], duration };
    this.frames.value = newFrames;
  }

  reorderFrame(fromIndex: number, toIndex: number) {
    const frames = [...this.frames.value];
    if (fromIndex < 0 || fromIndex >= frames.length) return;
    if (toIndex < 0 || toIndex >= frames.length) return;
    if (fromIndex === toIndex) return;

    const [removed] = frames.splice(fromIndex, 1);
    frames.splice(toIndex, 0, removed);
    frames.forEach((frame, idx) => { frame.order = idx; });

    this.frames.value = frames;
  }

  // ===== Frame Tags (delegated) =====

  addFrameTag(name: string, color: string, startFrameIndex: number, endFrameIndex: number): string | null {
    const result = tagManager.addFrameTag(this.tags.value, name, color, startFrameIndex, endFrameIndex);
    this.tags.value = result.tags;
    return result.tagId;
  }

  updateFrameTag(tagId: string, updates: Partial<Omit<FrameTag, 'id'>>): boolean {
    const result = tagManager.updateFrameTag(this.tags.value, tagId, updates);
    this.tags.value = result.tags;
    return result.success;
  }

  toggleTagCollapsed(tagId: string) {
    this.tags.value = tagManager.toggleTagCollapsed(this.tags.value, tagId);
  }

  removeFrameTag(tagId: string) {
    this.tags.value = tagManager.removeFrameTag(this.tags.value, tagId);
    if (this.activeTagId.value === tagId) {
      this.activeTagId.value = null;
      this.playbackMode.value = 'all';
    }
  }

  getTagsForFrame(frameIndex: number): FrameTag[] {
    return tagManager.getTagsForFrame(this.tags.value, frameIndex);
  }

  // Legacy per-frame tag methods (kept for compatibility)
  addTag(frameId: string, name: string, color: string) {
    const frames = this.frames.value;
    const frameIndex = frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    const frame = frames[frameIndex];
    const newTag = { id: crypto.randomUUID(), name, color };
    const updatedFrame = { ...frame, tags: [...(frame.tags || []), newTag] };

    const newFrames = [...frames];
    newFrames[frameIndex] = updatedFrame;
    this.frames.value = newFrames;
  }

  removeTag(frameId: string, tagId: string) {
    const frames = this.frames.value;
    const frameIndex = frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    const frame = frames[frameIndex];
    if (!frame.tags) return;

    const updatedFrame = { ...frame, tags: frame.tags.filter(t => t.id !== tagId) };
    const newFrames = [...frames];
    newFrames[frameIndex] = updatedFrame;
    this.frames.value = newFrames;
  }

  // ===== UI State =====

  toggleTagsExpanded() {
    this.tagsExpanded.value = !this.tagsExpanded.value;
    localStorage.setItem('pf-tags-expanded', String(this.tagsExpanded.value));
  }

  setTagsExpanded(expanded: boolean) {
    this.tagsExpanded.value = expanded;
    localStorage.setItem('pf-tags-expanded', String(expanded));
  }

  setTagResizePreview(tagId: string | null, previewStart?: number, previewEnd?: number) {
    if (tagId === null) {
      this.tagResizePreview.value = null;
    } else {
      this.tagResizePreview.value = { tagId, previewStart: previewStart!, previewEnd: previewEnd! };
    }
  }

  // ===== Cel Selection (delegated) =====

  selectCel(layerId: string, frameId: string, additive: boolean = false) {
    const result = celSelection.selectCel(
      { selectedCelKeys: this.selectedCelKeys.value, selectionAnchor: this.selectionAnchor.value },
      layerId, frameId, additive
    );
    this.selectedCelKeys.value = result.selectedCelKeys;
  }

  deselectCel(layerId: string, frameId: string) {
    const result = celSelection.deselectCel(
      { selectedCelKeys: this.selectedCelKeys.value, selectionAnchor: this.selectionAnchor.value },
      layerId, frameId
    );
    this.selectedCelKeys.value = result.selectedCelKeys;
  }

  clearCelSelection() {
    this.selectedCelKeys.value = new Set();
  }

  setSelectionAnchor(layerId: string, frameId: string) {
    this.selectionAnchor.value = { layerId, frameId };
  }

  toggleCel(layerId: string, frameId: string) {
    const result = celSelection.toggleCel(
      { selectedCelKeys: this.selectedCelKeys.value, selectionAnchor: this.selectionAnchor.value },
      layerId, frameId
    );
    this.selectedCelKeys.value = result.selectedCelKeys;
  }

  selectCelRange(fromLayerId: string, fromFrameId: string, toLayerId: string, toFrameId: string) {
    this.selectedCelKeys.value = celSelection.selectCelRange(
      layerStore.layers.value,
      this.frames.value,
      fromLayerId, fromFrameId,
      toLayerId, toFrameId
    );
  }

  isCelSelected(layerId: string, frameId: string): boolean {
    return celSelection.isCelSelected(this.selectedCelKeys.value, layerId, frameId);
  }

  getSelectedCels(): Array<{ layerId: string; frameId: string }> {
    return celSelection.getSelectedCels(this.selectedCelKeys.value);
  }

  // ===== Cel Linking (delegated) =====

  linkCels(celKeys: string[], linkType: 'soft' | 'hard' = 'hard'): string | null {
    const result = celLinking.linkCels(this.cels.value, celKeys, linkType);
    this.cels.value = result.cels;
    return result.linkedCelId;
  }

  unlinkCels(celKeys: string[]) {
    this.cels.value = celLinking.unlinkCels(this.cels.value, celKeys);
  }

  getCelLinkGroup(linkedCelId: string): Array<{ key: string; cel: Cel }> {
    return celLinking.getCelLinkGroup(this.cels.value, linkedCelId);
  }

  ensureUnlinkedForEdit(layerId: string, frameId: string): boolean {
    const result = celLinking.ensureUnlinkedForEdit(
      this.cels.value,
      layerId, frameId,
      () => this.syncLayerCanvases()
    );
    if (result.cels !== this.cels.value) {
      this.cels.value = result.cels;
    }
    if (result.wasUnlinked) {
      this.syncLayerCanvases();
    }
    return result.wasUnlinked;
  }

  setCelOpacity(celKeys: string[], opacity: number) {
    this.cels.value = celLinking.setCelOpacity(this.cels.value, celKeys, opacity);
  }

  getLinkColor(linkedCelId: string): string {
    return celLinking.getLinkColor(linkedCelId);
  }

  // ===== Text Cels (delegated) =====

  getTextCelData(layerId: string, frameId: string): TextCelData | undefined {
    return textCels.getTextCelData(this.cels.value, layerId, frameId);
  }

  setTextCelData(layerId: string, frameId: string, data: TextCelData): void {
    this.cels.value = textCels.setTextCelData(this.cels.value, layerId, frameId, data);
  }

  updateTextCelData(layerId: string, frameId: string, updates: Partial<TextCelData>): void {
    this.cels.value = textCels.updateTextCelData(this.cels.value, layerId, frameId, updates);
  }

  clearTextCelData(layerId: string, frameId: string): void {
    this.cels.value = textCels.clearTextCelData(this.cels.value, layerId, frameId);
  }

  // ===== Lifecycle =====

  dispose() {
    this.stopPlayback();
    if (this._cleanupPaletteListeners) {
      this._cleanupPaletteListeners();
      this._cleanupPaletteListeners = null;
    }
  }
}

export const animationStore = new AnimationStore();
