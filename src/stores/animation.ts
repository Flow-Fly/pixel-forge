import { signal } from '../core/signal';
import { type Frame, type Cel, type OnionSkinSettings, type AnimationTag } from '../types/animation';
import { layerStore } from './layers';

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

  constructor() {
    this.initialize();
    this.setupSync();
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

  addFrame(duplicate: boolean = true) {
    // Ensure current frame state is captured (especially for new layers)
    this.syncLayerCanvases();

    const frames = this.frames.value;
    const currentFrameId = this.currentFrameId.value;
    const currentFrameIndex = frames.findIndex(f => f.id === currentFrameId);
    
    const newFrame: Frame = {
      id: crypto.randomUUID(),
      order: frames.length,
      duration: 100
    };
    
    this.frames.value = [...frames, newFrame];
    
    // Initialize cels for the new frame
    this.initializeCelsForFrame(newFrame.id);
    
    // If duplication is requested and we have a current frame, copy content
    if (duplicate && currentFrameIndex !== -1) {
      const layers = layerStore.layers.value;
      const cels = new Map(this.cels.value);
      
      layers.forEach(layer => {
        const sourceKey = this.getCelKey(layer.id, currentFrameId);
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
    this.isPlaying.value = !this.isPlaying.value;
  }
}

export const animationStore = new AnimationStore();
