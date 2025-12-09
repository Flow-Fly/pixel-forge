import { signal } from '../core/signal';
import { type Frame, type Cel, type OnionSkinSettings, type AnimationTag, type FrameTag } from '../types/animation';
import { layerStore } from './layers';

export type PlaybackMode = 'all' | 'tag';

class AnimationStore {
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

  // Playback engine state
  playbackMode = signal<PlaybackMode>('all');
  activeTagId = signal<string | null>(null);
  tags = signal<FrameTag[]>([]);

  // UI state
  tagsExpanded = signal<boolean>(true);

  // Cel selection state
  selectedCelKeys = signal<Set<string>>(new Set());
  selectionAnchor = signal<{ layerId: string; frameId: string } | null>(null);

  // Playback internals
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;

  constructor() {
    this.initialize();
    this.setupSync();
    this.loadUIState();
  }

  private loadUIState() {
    const tagsExpanded = localStorage.getItem('pf-tags-expanded');
    if (tagsExpanded !== null) {
      this.tagsExpanded.value = tagsExpanded === 'true';
    }
  }

  private initialize() {
    // Create initial frame
    const initialFrame: Frame = {
      id: crypto.randomUUID(),
      order: 0,
      duration: 100
    };
    this.frames.value = [initialFrame];
    
    // Initialize cels for existing layers
    this.initializeCelsForFrame(initialFrame.id);
    
    // Set current frame and sync
    this.goToFrame(initialFrame.id);
  }

  private initializeCelsForFrame(frameId: string) {
    const layers = layerStore.layers.value;
    const newCels = new Map(this.cels.value);

    layers.forEach(layer => {
      const key = this.getCelKey(layer.id, frameId);
      if (!newCels.has(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; // TODO: Get from project settings
        canvas.height = 64;

        // Apply optimized context settings for cel canvases
        const ctx = canvas.getContext('2d', {
          alpha: true,
          willReadFrequently: true // Cels are read frequently for compositing
        });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
        }

        newCels.set(key, {
          id: crypto.randomUUID(),
          layerId: layer.id,
          frameId,
          canvas
        });
      }
    });

    this.cels.value = newCels;
  }

  getCelKey(layerId: string, frameId: string): string {
    return `${layerId}:${frameId}`;
  }

  getCelCanvas(frameId: string, layerId: string): HTMLCanvasElement | undefined {
    const key = this.getCelKey(layerId, frameId);
    return this.cels.value.get(key)?.canvas;
  }

  addFrame(duplicate: boolean = true, sourceFrameId?: string) {
    // Ensure current frame state is captured (especially for new layers)
    this.syncLayerCanvases();

    const frames = this.frames.value;
    // Use provided sourceFrameId, or fall back to current frame
    const frameIdToUse = sourceFrameId ?? this.currentFrameId.value;
    const sourceFrameIndex = frames.findIndex(f => f.id === frameIdToUse);
    
    const newFrame: Frame = {
      id: crypto.randomUUID(),
      order: frames.length,
      duration: 100
    };
    
    this.frames.value = [...frames, newFrame];
    
    // Initialize cels for the new frame
    this.initializeCelsForFrame(newFrame.id);
    
    // If duplication is requested and we have a source frame, copy content
    if (duplicate && sourceFrameIndex !== -1) {
      const layers = layerStore.layers.value;
      const cels = new Map(this.cels.value);

      layers.forEach(layer => {
        const sourceKey = this.getCelKey(layer.id, frameIdToUse);
        const targetKey = this.getCelKey(layer.id, newFrame.id);
        
        const sourceCel = cels.get(sourceKey);
        const targetCel = cels.get(targetKey);
        
        if (sourceCel && targetCel) {
          const ctx = targetCel.canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(sourceCel.canvas, 0, 0);
          }
        }
      });
      
      // Update cels map just in case (though we modified objects in place if we got them from map)
      // Actually cels.get returns reference, so canvas draw is enough.
    }
    
    this.goToFrame(newFrame.id);
  }

  deleteFrame(frameId: string) {
    const frames = this.frames.value;
    if (frames.length <= 1) return; // Don't delete the last frame

    const frameIndex = frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    // Remove frame
    const newFrames = frames.filter(f => f.id !== frameId);
    
    // Cleanup cels
    const cels = new Map(this.cels.value);
    const layers = layerStore.layers.value;
    layers.forEach(layer => {
      const key = this.getCelKey(layer.id, frameId);
      cels.delete(key);
    });
    this.cels.value = cels;

    this.frames.value = newFrames;

    // If we deleted the current frame, switch to another one
    if (this.currentFrameId.value === frameId) {
      const newIndex = Math.max(0, frameIndex - 1);
      this.goToFrame(newFrames[newIndex].id);
    }
  }

  private setupSync() {
    // Sync layer canvas when frame changes
    // We use a computed or effect to watch currentFrameId
    // Since we are using signals, we can just subscribe to it or use an effect if available.
    // BaseComponent uses SignalWatcher, but stores are plain classes.
    // We can manually subscribe if the signal implementation supports it, or just hook into the setter.
    // @lit-labs/signals doesn't have a direct subscribe on the signal object itself in the same way as some other libraries,
    // but we can use an effect if we had a robust effect implementation.
    // For now, let's just intercept the setter of currentFrameId or use a reaction.
    
    // Actually, let's just wrap the currentFrameId update in a method that also syncs.
    // But currentFrameId is a signal, accessed directly.
    // We can use a computed to derive the active cels, but we need to push changes to LayerStore.
    
    // Let's use a polling/watcher approach or just modify how we set currentFrameId.
    // Ideally, we should have a `setCurrentFrame(id)` method.
    // But I exposed `currentFrameId` as a public signal.
    
    // Let's add a watcher in the constructor using `effect` if we can import it, or just use a method.
    // I'll add a method `goToFrame(id)` and use that instead of setting signal directly in UI.
    // And I'll update the UI components to use `goToFrame`.
  }

  goToFrame(frameId: string) {
    this.currentFrameId.value = frameId;
    this.syncLayerCanvases();
  }

  private syncLayerCanvases() {
    const frameId = this.currentFrameId.value;
    const layers = layerStore.layers.value;
    const cels = new Map(this.cels.value);
    let celsUpdated = false;

    layers.forEach(layer => {
      const key = this.getCelKey(layer.id, frameId);
      let cel = cels.get(key);
      
      // Lazy creation of cels for new layers
      if (!cel) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; // TODO: Get from project settings
        canvas.height = 64;

        // Apply optimized context settings
        const ctx = canvas.getContext('2d', {
          alpha: true,
          willReadFrequently: true
        });

        if (ctx) {
          ctx.imageSmoothingEnabled = false;

          // If the layer has content (e.g. newly added layer with drawing), preserve it
          if (layer.canvas) {
            ctx.drawImage(layer.canvas, 0, 0);
          }
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

      if (cel) {
        // Update layer canvas to point to cel canvas
        if (layer.canvas !== cel.canvas) {
          layerStore.updateLayer(layer.id, { canvas: cel.canvas });
        }
      }
    });

    if (celsUpdated) {
      this.cels.value = cels;
    }
  }

  
  addTag(frameId: string, name: string, color: string) {
    const frames = this.frames.value;
    const frameIndex = frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    const frame = frames[frameIndex];
    const newTag: AnimationTag = {
      id: crypto.randomUUID(),
      name,
      color
    };

    const updatedFrame = {
      ...frame,
      tags: [...(frame.tags || []), newTag]
    };

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

    const updatedFrame = {
      ...frame,
      tags: frame.tags.filter(t => t.id !== tagId)
    };

    const newFrames = [...frames];
    newFrames[frameIndex] = updatedFrame;
    this.frames.value = newFrames;
  }

  /**
   * Go to the next frame.
   */
  nextFrame() {
    const frames = this.frames.value;
    const currentIndex = frames.findIndex(f => f.id === this.currentFrameId.value);
    if (currentIndex < frames.length - 1) {
      this.goToFrame(frames[currentIndex + 1].id);
    }
  }

  /**
   * Go to the previous frame.
   */
  prevFrame() {
    const frames = this.frames.value;
    const currentIndex = frames.findIndex(f => f.id === this.currentFrameId.value);
    if (currentIndex > 0) {
      this.goToFrame(frames[currentIndex - 1].id);
    }
  }

  /**
   * Go to the first frame.
   */
  goToFirstFrame() {
    const frames = this.frames.value;
    if (frames.length > 0) {
      this.goToFrame(frames[0].id);
    }
  }

  /**
   * Go to the last frame.
   */
  goToLastFrame() {
    const frames = this.frames.value;
    if (frames.length > 0) {
      this.goToFrame(frames[frames.length - 1].id);
    }
  }

  /**
   * Toggle playback on/off.
   */
  togglePlayback() {
    if (this.isPlaying.value) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  /**
   * Start animation playback loop.
   */
  startPlayback() {
    if (this.animationFrameId !== null) return; // Already playing

    this.isPlaying.value = true;
    this.lastFrameTime = performance.now();

    const loop = (timestamp: number) => {
      if (!this.isPlaying.value) {
        this.animationFrameId = null;
        return;
      }

      const elapsed = timestamp - this.lastFrameTime;
      const currentFrame = this.getCurrentFrame();
      const frameDuration = currentFrame?.duration ?? 100;

      if (elapsed >= frameDuration) {
        this.advanceFrame();
        this.lastFrameTime = timestamp;
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stop animation playback.
   */
  stopPlayback() {
    this.isPlaying.value = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Get the current frame object.
   */
  getCurrentFrame(): Frame | undefined {
    return this.frames.value.find(f => f.id === this.currentFrameId.value);
  }

  /**
   * Advance to the next frame, respecting tag boundaries if in tag loop mode.
   */
  advanceFrame() {
    const frames = this.frames.value;
    const currentId = this.currentFrameId.value;
    const currentIndex = frames.findIndex(f => f.id === currentId);

    let startIndex = 0;
    let endIndex = frames.length - 1;

    // If in tag loop mode, constrain to tag boundaries
    if (this.playbackMode.value === 'tag' && this.activeTagId.value) {
      const tag = this.tags.value.find(t => t.id === this.activeTagId.value);
      if (tag) {
        startIndex = Math.max(0, tag.startFrameIndex);
        endIndex = Math.min(frames.length - 1, tag.endFrameIndex);
      }
    }

    // Calculate next frame with wrapping
    let nextIndex = currentIndex + 1;
    if (nextIndex > endIndex) {
      nextIndex = startIndex; // Wrap around
    }

    if (frames[nextIndex]) {
      this.goToFrame(frames[nextIndex].id);
    }
  }

  /**
   * Set playback mode and optionally the active tag.
   */
  setPlaybackMode(mode: PlaybackMode, tagId?: string) {
    this.playbackMode.value = mode;
    if (mode === 'tag' && tagId) {
      this.activeTagId.value = tagId;
    } else if (mode === 'all') {
      this.activeTagId.value = null;
    }
  }

  /**
   * Set the duration for a specific frame.
   */
  setFrameDuration(frameId: string, duration: number) {
    const frames = this.frames.value;
    const frameIndex = frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    const newFrames = [...frames];
    newFrames[frameIndex] = { ...frames[frameIndex], duration };
    this.frames.value = newFrames;
  }

  /**
   * Reorder a frame from one position to another.
   */
  reorderFrame(fromIndex: number, toIndex: number) {
    const frames = [...this.frames.value];
    if (fromIndex < 0 || fromIndex >= frames.length) return;
    if (toIndex < 0 || toIndex >= frames.length) return;
    if (fromIndex === toIndex) return;

    const [removed] = frames.splice(fromIndex, 1);
    frames.splice(toIndex, 0, removed);

    // Update order properties
    frames.forEach((frame, idx) => {
      frame.order = idx;
    });

    this.frames.value = frames;
  }

  // ===== Frame Tag Management =====

  /**
   * Check if a range overlaps with any existing tags.
   * Optionally exclude a tag by ID (for updates).
   */
  private hasOverlap(startIndex: number, endIndex: number, excludeTagId?: string): boolean {
    return this.tags.value.some(tag => {
      if (excludeTagId && tag.id === excludeTagId) return false;
      // Ranges overlap if one starts before the other ends
      return startIndex <= tag.endFrameIndex && endIndex >= tag.startFrameIndex;
    });
  }

  /**
   * Add a new frame tag spanning the given range.
   * Returns null if the range overlaps with an existing tag.
   */
  addFrameTag(name: string, color: string, startFrameIndex: number, endFrameIndex: number): string | null {
    // Validate no overlap
    if (this.hasOverlap(startFrameIndex, endFrameIndex)) {
      console.warn('Cannot create tag: range overlaps with existing tag');
      return null;
    }

    const newTag: FrameTag = {
      id: crypto.randomUUID(),
      name,
      color,
      startFrameIndex,
      endFrameIndex,
      collapsed: false
    };
    this.tags.value = [...this.tags.value, newTag];
    return newTag.id;
  }

  /**
   * Update an existing frame tag.
   * Returns false if the new range would overlap with another tag.
   */
  updateFrameTag(tagId: string, updates: Partial<Omit<FrameTag, 'id'>>): boolean {
    const tags = this.tags.value;
    const tagIndex = tags.findIndex(t => t.id === tagId);
    if (tagIndex === -1) return false;

    const currentTag = tags[tagIndex];
    const newStart = updates.startFrameIndex ?? currentTag.startFrameIndex;
    const newEnd = updates.endFrameIndex ?? currentTag.endFrameIndex;

    // Check for overlap with other tags (excluding self)
    if (updates.startFrameIndex !== undefined || updates.endFrameIndex !== undefined) {
      if (this.hasOverlap(newStart, newEnd, tagId)) {
        console.warn('Cannot update tag: new range overlaps with existing tag');
        return false;
      }
    }

    const newTags = [...tags];
    newTags[tagIndex] = { ...currentTag, ...updates };
    this.tags.value = newTags;
    return true;
  }

  /**
   * Toggle the collapsed state of a tag.
   */
  toggleTagCollapsed(tagId: string) {
    const tags = this.tags.value;
    const tagIndex = tags.findIndex(t => t.id === tagId);
    if (tagIndex === -1) return;

    const newTags = [...tags];
    newTags[tagIndex] = { ...tags[tagIndex], collapsed: !tags[tagIndex].collapsed };
    this.tags.value = newTags;
  }

  /**
   * Remove a frame tag.
   */
  removeFrameTag(tagId: string) {
    this.tags.value = this.tags.value.filter(t => t.id !== tagId);
    // Clear active tag if it was the removed one
    if (this.activeTagId.value === tagId) {
      this.activeTagId.value = null;
      this.playbackMode.value = 'all';
    }
  }

  /**
   * Get tags that include the given frame index.
   */
  getTagsForFrame(frameIndex: number): FrameTag[] {
    return this.tags.value.filter(
      t => frameIndex >= t.startFrameIndex && frameIndex <= t.endFrameIndex
    );
  }

  // ===== UI State =====

  /**
   * Toggle tags expanded/collapsed state.
   */
  toggleTagsExpanded() {
    this.tagsExpanded.value = !this.tagsExpanded.value;
    localStorage.setItem('pf-tags-expanded', String(this.tagsExpanded.value));
  }

  /**
   * Set tags expanded state directly.
   */
  setTagsExpanded(expanded: boolean) {
    this.tagsExpanded.value = expanded;
    localStorage.setItem('pf-tags-expanded', String(expanded));
  }

  // ===== Cel Selection =====

  /**
   * Select a cel. If additive is false, clears previous selection.
   */
  selectCel(layerId: string, frameId: string, additive: boolean = false) {
    const key = this.getCelKey(layerId, frameId);
    const newSelection = additive ? new Set(this.selectedCelKeys.value) : new Set<string>();

    if (additive && newSelection.has(key)) {
      // Toggle off if already selected
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }

    this.selectedCelKeys.value = newSelection;
  }

  /**
   * Deselect a specific cel.
   */
  deselectCel(layerId: string, frameId: string) {
    const key = this.getCelKey(layerId, frameId);
    const newSelection = new Set(this.selectedCelKeys.value);
    newSelection.delete(key);
    this.selectedCelKeys.value = newSelection;
  }

  /**
   * Clear all cel selection.
   */
  clearCelSelection() {
    this.selectedCelKeys.value = new Set();
  }

  /**
   * Set the selection anchor point.
   */
  setSelectionAnchor(layerId: string, frameId: string) {
    this.selectionAnchor.value = { layerId, frameId };
  }

  /**
   * Toggle a cel in/out of selection without affecting anchor.
   */
  toggleCel(layerId: string, frameId: string) {
    const key = this.getCelKey(layerId, frameId);
    const newSelection = new Set(this.selectedCelKeys.value);

    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }

    this.selectedCelKeys.value = newSelection;
  }

  /**
   * Select all cels in a rectangular range between two cells.
   */
  selectCelRange(
    fromLayerId: string,
    fromFrameId: string,
    toLayerId: string,
    toFrameId: string
  ) {
    const layers = layerStore.layers.value;
    const frames = this.frames.value;

    const fromLayerIndex = layers.findIndex(l => l.id === fromLayerId);
    const toLayerIndex = layers.findIndex(l => l.id === toLayerId);
    const fromFrameIndex = frames.findIndex(f => f.id === fromFrameId);
    const toFrameIndex = frames.findIndex(f => f.id === toFrameId);

    const minLayerIndex = Math.min(fromLayerIndex, toLayerIndex);
    const maxLayerIndex = Math.max(fromLayerIndex, toLayerIndex);
    const minFrameIndex = Math.min(fromFrameIndex, toFrameIndex);
    const maxFrameIndex = Math.max(fromFrameIndex, toFrameIndex);

    const newSelection = new Set<string>();

    for (let li = minLayerIndex; li <= maxLayerIndex; li++) {
      for (let fi = minFrameIndex; fi <= maxFrameIndex; fi++) {
        const layer = layers[li];
        const frame = frames[fi];
        if (layer && frame) {
          newSelection.add(this.getCelKey(layer.id, frame.id));
        }
      }
    }

    this.selectedCelKeys.value = newSelection;
  }

  /**
   * Check if a cel is selected.
   */
  isCelSelected(layerId: string, frameId: string): boolean {
    const key = this.getCelKey(layerId, frameId);
    return this.selectedCelKeys.value.has(key);
  }

  /**
   * Get all selected cels as an array of {layerId, frameId}.
   */
  getSelectedCels(): Array<{ layerId: string; frameId: string }> {
    return Array.from(this.selectedCelKeys.value).map(key => {
      const [layerId, frameId] = key.split(':');
      return { layerId, frameId };
    });
  }

  // ===== Cel Linking =====

  /**
   * Link multiple cels together. They will share the same canvas.
   * The first cel's canvas becomes the shared canvas.
   */
  linkCels(celKeys: string[]): string | null {
    if (celKeys.length < 2) return null;

    const cels = new Map(this.cels.value);
    const linkedCelId = crypto.randomUUID();

    // Get the first cel's canvas to use as shared canvas
    const firstCel = cels.get(celKeys[0]);
    if (!firstCel) return null;

    const sharedCanvas = firstCel.canvas;

    // Update all cels to share the same canvas and linkedCelId
    for (const key of celKeys) {
      const cel = cels.get(key);
      if (cel) {
        cels.set(key, {
          ...cel,
          canvas: sharedCanvas,
          linkedCelId
        });
      }
    }

    this.cels.value = cels;
    return linkedCelId;
  }

  /**
   * Unlink cels - each gets its own copy of the canvas.
   */
  unlinkCels(celKeys: string[]) {
    const cels = new Map(this.cels.value);

    for (const key of celKeys) {
      const cel = cels.get(key);
      if (cel && cel.linkedCelId) {
        // Create a copy of the canvas
        const newCanvas = document.createElement('canvas');
        newCanvas.width = cel.canvas.width;
        newCanvas.height = cel.canvas.height;
        const ctx = newCanvas.getContext('2d', {
          alpha: true,
          willReadFrequently: true
        });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(cel.canvas, 0, 0);
        }

        cels.set(key, {
          ...cel,
          canvas: newCanvas,
          linkedCelId: undefined
        });
      }
    }

    this.cels.value = cels;
  }

  /**
   * Get all cels in a link group.
   */
  getCelLinkGroup(linkedCelId: string): Array<{ key: string; cel: Cel }> {
    const result: Array<{ key: string; cel: Cel }> = [];
    for (const [key, cel] of this.cels.value) {
      if (cel.linkedCelId === linkedCelId) {
        result.push({ key, cel });
      }
    }
    return result;
  }

  /**
   * Set opacity for multiple cels.
   */
  setCelOpacity(celKeys: string[], opacity: number) {
    const cels = new Map(this.cels.value);
    const clampedOpacity = Math.max(0, Math.min(100, opacity));

    for (const key of celKeys) {
      const cel = cels.get(key);
      if (cel) {
        cels.set(key, {
          ...cel,
          opacity: clampedOpacity
        });
      }
    }

    this.cels.value = cels;
  }

  /**
   * Get the link color for a cel (for visual badge).
   * Returns a consistent color based on the linkedCelId.
   */
  getLinkColor(linkedCelId: string): string {
    const linkColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
    // Simple hash to get consistent color per linkedCelId
    let hash = 0;
    for (let i = 0; i < linkedCelId.length; i++) {
      hash = ((hash << 5) - hash) + linkedCelId.charCodeAt(i);
      hash = hash & hash;
    }
    return linkColors[Math.abs(hash) % linkColors.length];
  }
}

export const animationStore = new AnimationStore();
