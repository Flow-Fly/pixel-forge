import { describe, expect, it, vi } from 'vitest';
import { togglePlayback } from '../../src/services/playback-action';
import type { ProjectAnimationStore } from '../../src/stores/project-context';

function animation(initiallyPlaying: boolean) {
  const isPlaying = { value: initiallyPlaying };
  return {
    isPlaying,
    togglePlayback: vi.fn(() => {
      isPlaying.value = !isPlaying.value;
    }),
  } as unknown as ProjectAnimationStore;
}

describe('playback action', () => {
  it('records a real stopped-to-playing transition', () => {
    const record = vi.fn();
    const target = animation(false);

    togglePlayback(target, { record });

    expect(record).toHaveBeenCalledWith({ name: 'playback_started', dimensions: {} });
  });

  it('does not record a playing-to-stopped transition', () => {
    const record = vi.fn();

    togglePlayback(animation(true), { record });

    expect(record).not.toHaveBeenCalled();
  });
});
