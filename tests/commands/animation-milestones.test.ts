import { describe, expect, it, vi } from 'vitest';
import { AddFrameCommand } from '../../src/commands/animation-commands';
import type { ProjectContext } from '../../src/stores/project-context';

describe('animation milestones', () => {
  it('records only a successful one-to-two frame transition', () => {
    const record = vi.fn();
    const frames = { value: [{ id: 'frame-1' }] };
    const animation = {
      frames,
      addFrame: vi.fn(() => {
        frames.value = [...frames.value, { id: 'frame-2' }];
      }),
      deleteFrame: vi.fn(),
    };
    const context = { animation } as unknown as ProjectContext;

    new AddFrameCommand(true, undefined, context, { record }).execute();

    expect(record).toHaveBeenCalledWith({ name: 'second_frame_created', dimensions: {} });
  });

  it('does not record later frame additions', () => {
    const record = vi.fn();
    const frames = { value: [{ id: 'frame-1' }, { id: 'frame-2' }] };
    const animation = {
      frames,
      addFrame: vi.fn(() => {
        frames.value = [...frames.value, { id: 'frame-3' }];
      }),
      deleteFrame: vi.fn(),
    };
    const context = { animation } as unknown as ProjectContext;

    new AddFrameCommand(true, undefined, context, { record }).execute();

    expect(record).not.toHaveBeenCalled();
  });
});
