/**
 * Animation playback engine.
 *
 * Handles the animation loop, timing, and frame advancement
 * with support for tag-based looping.
 */

import type { Frame, FrameTag } from '../../types/animation';
import type { PlaybackMode } from './types';

export interface PlaybackState {
  isPlaying: boolean;
  fps: number;
  playbackMode: PlaybackMode;
  activeTagId: string | null;
}

export interface PlaybackCallbacks {
  getCurrentFrameId: () => string;
  getFrames: () => Frame[];
  getTags: () => FrameTag[];
  goToFrame: (frameId: string) => void;
  getCurrentFrame: () => Frame | undefined;
}

/**
 * Creates a playback engine that manages animation timing.
 */
export function createPlaybackEngine(callbacks: PlaybackCallbacks) {
  let animationFrameId: number | null = null;
  let lastFrameTime = 0;
  let isPlaying = false;
  let playbackMode: PlaybackMode = 'all';
  let activeTagId: string | null = null;

  /**
   * Start the animation loop.
   */
  function start() {
    if (animationFrameId !== null) return;

    isPlaying = true;
    lastFrameTime = performance.now();

    const loop = (timestamp: number) => {
      if (!isPlaying) {
        animationFrameId = null;
        return;
      }

      const elapsed = timestamp - lastFrameTime;
      const currentFrame = callbacks.getCurrentFrame();
      const frameDuration = currentFrame?.duration ?? 100;

      if (elapsed >= frameDuration) {
        advanceFrame();
        lastFrameTime = timestamp;
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stop the animation loop.
   */
  function stop() {
    isPlaying = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  /**
   * Toggle playback on/off.
   */
  function toggle() {
    if (isPlaying) {
      stop();
    } else {
      start();
    }
    return isPlaying;
  }

  /**
   * Advance to the next frame, respecting tag boundaries.
   */
  function advanceFrame() {
    const frames = callbacks.getFrames();
    const currentId = callbacks.getCurrentFrameId();
    const currentIndex = frames.findIndex(f => f.id === currentId);

    let startIndex = 0;
    let endIndex = frames.length - 1;

    // If in tag loop mode, constrain to tag boundaries
    if (playbackMode === 'tag' && activeTagId) {
      const tag = callbacks.getTags().find(t => t.id === activeTagId);
      if (tag) {
        startIndex = Math.max(0, tag.startFrameIndex);
        endIndex = Math.min(frames.length - 1, tag.endFrameIndex);
      }
    }

    // Calculate next frame with wrapping
    let nextIndex = currentIndex + 1;
    if (nextIndex > endIndex) {
      nextIndex = startIndex;
    }

    if (frames[nextIndex]) {
      callbacks.goToFrame(frames[nextIndex].id);
    }
  }

  /**
   * Set playback mode and optionally the active tag.
   */
  function setMode(mode: PlaybackMode, tagId?: string) {
    playbackMode = mode;
    if (mode === 'tag' && tagId) {
      activeTagId = tagId;
    } else if (mode === 'all') {
      activeTagId = null;
    }
  }

  /**
   * Get current playback state.
   */
  function getState(): PlaybackState {
    return {
      isPlaying,
      fps: 12, // Default, actual FPS is managed by signals in main store
      playbackMode,
      activeTagId
    };
  }

  return {
    start,
    stop,
    toggle,
    advanceFrame,
    setMode,
    getState,
    get isPlaying() { return isPlaying; },
    set activeTagId(id: string | null) { activeTagId = id; },
    get activeTagId() { return activeTagId; },
    set playbackMode(mode: PlaybackMode) { playbackMode = mode; },
    get playbackMode() { return playbackMode; }
  };
}

export type PlaybackEngine = ReturnType<typeof createPlaybackEngine>;
