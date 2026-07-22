import { describe, expect, it } from 'vitest';
import { parseProductEvent, type ProductEvent } from '../../shared/src/product-events';

const approvedEvents: ProductEvent[] = [
  { name: 'editor_loaded', dimensions: { entryPoint: 'direct' } },
  { name: 'project_created', dimensions: { source: 'guided_drawing' } },
  { name: 'project_opened', dimensions: { source: 'session_restore' } },
  { name: 'first_drawing_action', dimensions: { tool: 'fill' } },
  { name: 'second_frame_created', dimensions: {} },
  { name: 'playback_started', dimensions: {} },
  { name: 'project_saved', dimensions: { destination: 'local_library' } },
  { name: 'export_completed', dimensions: { format: 'webp' } },
  { name: 'tutorial_started', dimensions: {} },
  { name: 'tutorial_completed', dimensions: {} },
  { name: 'tutorial_skipped', dimensions: {} },
];

describe('product events', () => {
  it('accepts the closed milestone taxonomy', () => {
    expect(approvedEvents.map(parseProductEvent)).toEqual(approvedEvents);
  });

  it.each([
    {
      name: 'unknown_event',
      dimensions: {},
    },
    {
      name: 'project_created',
      dimensions: { source: 'blank', filename: 'portrait.pf' },
    },
    {
      name: 'project_created',
      dimensions: { source: 'blank' },
      projectName: 'Portrait',
    },
    {
      name: 'project_created',
      dimensions: { source: 'unknown' },
    },
  ])('rejects unapproved payload %#', (payload) => {
    expect(parseProductEvent(payload)).toBeUndefined();
  });

  it('validates and retains the same dimension value', () => {
    let sourceReads = 0;
    const dimensions = Object.defineProperty({}, 'source', {
      enumerable: true,
      get: () => {
        sourceReads += 1;
        return sourceReads === 1 ? 'blank' : 'portrait.pf';
      },
    });

    expect(parseProductEvent({ name: 'project_created', dimensions })).toEqual({
      name: 'project_created',
      dimensions: { source: 'blank' },
    });
    expect(sourceReads).toBe(1);
  });

  it('validates and retains the same event name', () => {
    let nameReads = 0;
    const input = Object.defineProperties(
      {},
      {
        name: {
          enumerable: true,
          get: () => {
            nameReads += 1;
            return nameReads === 1 ? 'tutorial_started' : 'private-project-name';
          },
        },
        dimensions: {
          enumerable: true,
          value: {},
        },
      }
    );

    expect(parseProductEvent(input)).toEqual({
      name: 'tutorial_started',
      dimensions: {},
    });
    expect(nameReads).toBe(1);
  });

  it('rejects hidden and symbol-keyed dimensions', () => {
    const hiddenDimensions = Object.defineProperty({ source: 'blank' }, 'filename', {
      enumerable: false,
      value: 'portrait.pf',
    });
    const privateField = Symbol('private-field');
    const symbolDimensions = {
      source: 'blank',
      [privateField]: 'portrait.pf',
    };

    expect(
      parseProductEvent({ name: 'project_created', dimensions: hiddenDimensions })
    ).toBeUndefined();
    expect(
      parseProductEvent({ name: 'project_created', dimensions: symbolDimensions })
    ).toBeUndefined();
  });
});
