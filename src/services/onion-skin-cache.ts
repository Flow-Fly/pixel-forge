/**
 * LRU cache for tinted onion skin bitmaps.
 * Eliminates per-frame canvas allocations during playback.
 */

interface OnionCacheEntry {
  bitmap: ImageBitmap;
  celId: string;
  tintColor: string;
  opacity: number;
}

class OnionSkinCache {
  private cache = new Map<string, OnionCacheEntry>();
  private pendingCreation = new Set<string>(); // Track in-flight async operations
  private maxEntries = 20;

  /**
   * Generate cache key from cel ID, tint color, and opacity.
   */
  private getKey(celId: string, tintColor: string, opacity: number): string {
    return `${celId}:${tintColor}:${opacity.toFixed(2)}`;
  }

  /**
   * Synchronously check if a cached bitmap exists.
   * Returns the bitmap if cached, null otherwise.
   * Use this for the fast path in render loops.
   */
  getSync(
    celId: string,
    tintColor: string,
    opacity: number
  ): ImageBitmap | null {
    const key = this.getKey(celId, tintColor, opacity);
    const cached = this.cache.get(key);

    if (cached) {
      // Move to end (most recently used) by re-inserting
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.bitmap;
    }

    return null;
  }

  /**
   * Asynchronously populate the cache for a cel.
   * Call this on cache miss to prepare for next render.
   * Safe to call multiple times - deduplicates in-flight requests.
   */
  async populate(
    celId: string,
    canvas: HTMLCanvasElement,
    tintColor: string,
    opacity: number
  ): Promise<void> {
    const key = this.getKey(celId, tintColor, opacity);

    // Already cached or creation in progress
    if (this.cache.has(key) || this.pendingCreation.has(key)) {
      return;
    }

    this.pendingCreation.add(key);

    try {
      const bitmap = await this.createTintedBitmap(canvas, tintColor);

      // LRU eviction - remove oldest entry if at capacity
      if (this.cache.size >= this.maxEntries) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
          const oldEntry = this.cache.get(oldestKey);
          oldEntry?.bitmap.close();
          this.cache.delete(oldestKey);
        }
      }

      this.cache.set(key, { bitmap, celId, tintColor, opacity });
    } finally {
      this.pendingCreation.delete(key);
    }
  }

  /**
   * Create a tinted ImageBitmap from a canvas.
   */
  private async createTintedBitmap(
    sourceCanvas: HTMLCanvasElement,
    tintColor: string
  ): Promise<ImageBitmap> {
    // Create temporary canvas for tinting
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sourceCanvas.width;
    tempCanvas.height = sourceCanvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;

    // Draw source and apply tint
    tempCtx.drawImage(sourceCanvas, 0, 0);
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.fillStyle = tintColor;
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Convert to ImageBitmap for efficient GPU rendering
    return createImageBitmap(tempCanvas);
  }

  /**
   * Invalidate all cache entries for a specific cel.
   * Call this when a cel's canvas is modified.
   */
  invalidateCel(celId: string) {
    for (const [key, entry] of this.cache) {
      if (entry.celId === celId) {
        entry.bitmap.close(); // Release resources
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear the entire cache.
   * Call this on project load/new.
   */
  clear() {
    for (const entry of this.cache.values()) {
      entry.bitmap.close();
    }
    this.cache.clear();
  }

  /**
   * Get current cache size (for debugging).
   */
  get size(): number {
    return this.cache.size;
  }
}

export const onionSkinCache = new OnionSkinCache();
