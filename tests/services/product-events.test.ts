import { describe, expect, it } from 'vitest';
import { parseProductEvent, type ProductEvent } from '../../src/services/product-events';

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
});
