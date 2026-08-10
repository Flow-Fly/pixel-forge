import { describe, expect, it } from 'vitest';

import type { Cel } from '../../src/types/animation';
import { setTextCelData, updateTextCelData } from '../../src/stores/animation/text-cels';

function createCels(): Map<string, Cel> {
  return new Map();
}

describe('text cel creation', () => {
  it('creates a full-opacity cel when setting missing text data', () => {
    const cels = setTextCelData(createCels(), 'layer-1', 'frame-1', {
      content: 'A',
      x: 2,
      y: 3,
    });

    expect(cels.get('layer-1:frame-1')?.opacity).toBe(100);
  });

  it('creates a full-opacity cel when updating missing text data', () => {
    const cels = updateTextCelData(createCels(), 'layer-1', 'frame-1', {
      content: 'B',
    });

    expect(cels.get('layer-1:frame-1')?.opacity).toBe(100);
  });
});
