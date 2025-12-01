import { signal } from '../core/signal';
import { layerStore } from './layers';
import { animationStore } from './animation';
import type { ProjectFile } from '../types/project';

class ProjectStore {
  width = signal(64);
  height = signal(64);

  setSize(width: number, height: number) {
    this.width.value = width;
    this.height.value = height;
  }

  resizeCanvas(newWidth: number, newHeight: number) {
    this.width.value = newWidth;
    this.height.value = newHeight;
  }

  async saveProject(): Promise<ProjectFile> {
    const layers = layerStore.layers.value.map(layer => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      data: layer.canvas ? layer.canvas.toDataURL() : ''
    }));

    const frames = await Promise.all(animationStore.frames.value.map(async frame => {
      // Get cels for this frame by iterating layers
      const cels = await Promise.all(layerStore.layers.value.map(async layer => {
        const canvas = animationStore.getCelCanvas(frame.id, layer.id);
        return {
          layerId: layer.id,
          data: canvas ? canvas.toDataURL() : ''
        };
      }));

      return {
        id: frame.id,
        duration: frame.duration,
        cels: cels.filter(c => c.data !== '') // Only save cels with data? Or all? Let's save all for structure.
      };
    }));

    const currentFrameIndex = animationStore.frames.value.findIndex(f => f.id === animationStore.currentFrameId.value);

    return {
      version: '1.0.0',
      width: this.width.value,
      height: this.height.value,
      layers,
      frames,
      animation: {
        fps: animationStore.fps.value,
        currentFrameIndex: currentFrameIndex === -1 ? 0 : currentFrameIndex
      }
    };
  }

  async loadProject(file: ProjectFile) {
    // 1. Set dimensions
    this.setSize(file.width, file.height);

    // 2. Restore Layers
    while(layerStore.layers.value.length > 0) {
      layerStore.removeLayer(layerStore.layers.value[0].id);
    }

    for (const l of file.layers) {
      const layer = layerStore.addLayer(l.name);
      layer.id = l.id;
      layer.visible = l.visible;
      layer.opacity = l.opacity;
      await this.loadImageToCanvas(l.data, layer.canvas);
    }

    // 3. Restore Frames
    while(animationStore.frames.value.length > 0) {
       animationStore.deleteFrame(animationStore.frames.value[0].id);
    }

    // Add frames
    for (const f of file.frames) {
      // Add a new frame
      animationStore.addFrame(false); // false = don't duplicate content
      const newFrame = animationStore.frames.value[animationStore.frames.value.length - 1];
      newFrame.duration = f.duration;
      
      // Populate cels
      for (const c of f.cels) {
        const canvas = animationStore.getCelCanvas(newFrame.id, c.layerId);
        if (canvas) {
          await this.loadImageToCanvas(c.data, canvas);
        }
      }
    }
    
    // 4. Animation Settings
    animationStore.fps.value = file.animation.fps;
    
    const targetFrame = animationStore.frames.value[file.animation.currentFrameIndex];
    if (targetFrame) {
      animationStore.goToFrame(targetFrame.id);
    }
  }

  private loadImageToCanvas(dataUrl: string, canvas: HTMLCanvasElement): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(img, 0, 0);
        resolve();
      };
      img.src = dataUrl;
    });
  }
}

export const projectStore = new ProjectStore();
