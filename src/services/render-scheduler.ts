type RenderCallback = () => void;

/**
 * Scheduler for batching render calls into animation frames.
 * Multiple render requests within a single frame are coalesced.
 */
class RenderScheduler {
  private frameId: number | null = null;
  private callbacks: Set<RenderCallback> = new Set();

  /**
   * Schedule a render for the next animation frame.
   * Multiple calls before the frame are coalesced.
   */
  scheduleRender(callback: RenderCallback): void {
    this.callbacks.add(callback);

    if (this.frameId === null) {
      this.frameId = requestAnimationFrame(() => this.executeFrame());
    }
  }

  private executeFrame(): void {
    this.frameId = null;
    const toExecute = Array.from(this.callbacks);
    this.callbacks.clear();

    for (const callback of toExecute) {
      callback();
    }
  }

  /**
   * Force immediate render (for mouseup to ensure final state is captured).
   */
  flush(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
      this.executeFrame();
    }
  }

  /**
   * Check if there are pending renders.
   */
  hasPending(): boolean {
    return this.frameId !== null;
  }
}

export const renderScheduler = new RenderScheduler();
