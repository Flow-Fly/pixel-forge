import { signal } from "../core/signal";
import type { ReferenceImage, SerializedReferenceImage } from "../types/reference";

class ReferenceImageStore {
  images = signal<ReferenceImage[]>([]);
  activeImageId = signal<string | null>(null);
  enabled = signal<boolean>(true);

  private generateId(): string {
    return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async addImage(source: HTMLImageElement | File): Promise<string> {
    const id = this.generateId();

    let img: HTMLImageElement;
    if (source instanceof File) {
      img = await this.loadImageFromFile(source);
    } else {
      img = source;
    }

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const refImage: ReferenceImage = {
      id,
      canvas,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 0.5,
      visible: true,
      locked: false,
      aboveLayers: false,
    };

    this.images.value = [...this.images.value, refImage];
    this.activeImageId.value = id;
    return id;
  }

  private loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  removeImage(id: string): void {
    this.images.value = this.images.value.filter((img) => img.id !== id);
    if (this.activeImageId.value === id) {
      this.activeImageId.value = null;
    }
  }

  updateImage(id: string, updates: Partial<ReferenceImage>): void {
    this.images.value = this.images.value.map((img) =>
      img.id === id ? { ...img, ...updates } : img
    );
  }

  setActiveImage(id: string | null): void {
    this.activeImageId.value = id;
  }

  getActiveImage(): ReferenceImage | undefined {
    return this.images.value.find((img) => img.id === this.activeImageId.value);
  }

  moveImage(id: string, dx: number, dy: number): void {
    const img = this.images.value.find((i) => i.id === id);
    if (img && !img.locked) {
      this.updateImage(id, { x: img.x + dx, y: img.y + dy });
    }
  }

  toggleEnabled(): void {
    this.enabled.value = !this.enabled.value;
  }

  serialize(): SerializedReferenceImage[] {
    return this.images.value.map((img) => ({
      id: img.id,
      dataUrl: img.canvas.toDataURL("image/png"),
      x: img.x,
      y: img.y,
      scale: img.scale,
      rotation: img.rotation,
      opacity: img.opacity,
      visible: img.visible,
      locked: img.locked,
      aboveLayers: img.aboveLayers,
    }));
  }

  async deserialize(data: SerializedReferenceImage[]): Promise<void> {
    const images: ReferenceImage[] = [];

    for (const item of data) {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load reference image"));
        img.src = item.dataUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      images.push({
        id: item.id,
        canvas,
        x: item.x,
        y: item.y,
        scale: item.scale,
        rotation: item.rotation,
        opacity: item.opacity,
        visible: item.visible,
        locked: item.locked,
        aboveLayers: item.aboveLayers,
      });
    }

    this.images.value = images;
    this.activeImageId.value = null;
  }

  clear(): void {
    this.images.value = [];
    this.activeImageId.value = null;
  }
}

export const referenceImageStore = new ReferenceImageStore();
