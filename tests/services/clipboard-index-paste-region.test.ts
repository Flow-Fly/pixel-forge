import { describe, expect, it } from 'vitest';

import { createClipboardIndexPasteRegionPlan } from '../../src/services/clipboard-index-paste-region';

describe('createClipboardIndexPasteRegionPlan', () => {
  it('copies the previous target region and overlays nonzero pasted indices', () => {
    const targetIndexBuffer = Uint8Array.from([
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16,
    ]);

    const plan = createClipboardIndexPasteRegionPlan({
      sourceIndexData: Uint8Array.from([21, 0, 0, 22]),
      targetIndexBuffer,
      targetWidth: 4,
      destinationBounds: { x: 1, y: 1, width: 2, height: 2 },
    });

    expect(Array.from(plan.previousIndexData)).toEqual([6, 7, 10, 11]);
    expect(Array.from(plan.nextIndexData)).toEqual([21, 7, 10, 22]);
    expect(Array.from(targetIndexBuffer)).toEqual([
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16,
    ]);
  });

  it('treats masked-out pixels like transparent pixels', () => {
    const plan = createClipboardIndexPasteRegionPlan({
      sourceIndexData: Uint8Array.from([3, 4, 5, 2]),
      targetIndexBuffer: Uint8Array.from([9, 8, 7, 6]),
      targetWidth: 2,
      destinationBounds: { x: 0, y: 0, width: 2, height: 2 },
      shape: 'freeform',
      mask: Uint8Array.from([255, 0, 0, 255]),
    });

    expect(Array.from(plan.previousIndexData)).toEqual([9, 8, 7, 6]);
    expect(Array.from(plan.nextIndexData)).toEqual([3, 8, 7, 2]);
  });

  it('respects ellipse selection shape when planning pasted indices', () => {
    const plan = createClipboardIndexPasteRegionPlan({
      sourceIndexData: Uint8Array.from([
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16,
      ]),
      targetIndexBuffer: new Uint8Array(16),
      targetWidth: 4,
      destinationBounds: { x: 0, y: 0, width: 4, height: 4 },
      shape: 'ellipse',
    });

    expect(Array.from(plan.nextIndexData)).toEqual([
      0, 2, 3, 0,
      5, 6, 7, 8,
      9, 10, 11, 12,
      0, 14, 15, 0,
    ]);
  });
});
