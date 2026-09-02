import { afterEach, describe, expect, it } from 'vitest';
import {
  createFixtureSession,
  type FixtureSession,
} from '../../src/editor/fixture-session';

const sessions: FixtureSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
});

describe('Automation Adapter Fixture Session', () => {
  it('proves the catalog, explicit target, render, resize, recovery, and persistence journey', async () => {
    const session = createFixtureSession();
    sessions.push(session);

    const journey = await session.run();

    expect(journey.negotiation.version).toBe('1.0');
    expect(journey.initial.observation.target).toEqual({ projectId: 'fixture-project' });
    expect(journey.initial.observation.revision).toBe(0);
    expect(journey.initial.observation.canvas).toEqual({ width: 4, height: 4 });
    expect(journey.initial.render).toMatchObject({
      width: 4,
      height: 4,
      format: 'rgba8',
      stride: 16,
    });
    expect(journey.resize.preview.preview.requiresConfirmation).toBe(false);
    expect(journey.resize.execution.revision).toBe(1);
    expect(journey.afterResize.observation.canvas).toEqual({ width: 6, height: 5 });
    expect(journey.afterResize.observation.history.undoCount).toBe(1);
    expect(journey.afterResize.observation.lastEvent?.domains).toEqual([
      'canvas-bounds',
      'raster-content',
    ]);
    expect(journey.afterResize.observation.saveSafety.status).toBe('dirty');
    expect(journey.afterUndo.observation.canvas).toEqual({ width: 4, height: 4 });
    expect(journey.afterRedo.observation.canvas).toEqual({ width: 6, height: 5 });
    expect(journey.save.saveSafety.status).toBe('saved');
    expect(journey.reload.observation.saveSafety.status).toBe('saved');
    expect(journey.exact).toEqual({ document: true, render: true });
  });
});
