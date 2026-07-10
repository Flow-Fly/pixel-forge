import { afterEach, describe, expect, it, vi } from 'vitest';

import { ViewEffectPipeline } from '../../../src/services/view-effects';

describe('ViewEffectPipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables itself cleanly when WebGL2 is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const pipeline = new ViewEffectPipeline();
    const source = document.createElement('canvas');

    expect(pipeline.isSupported).toBe(false);
    expect(pipeline.render('passthrough', source)).toBe(false);
    expect(() => pipeline.dispose()).not.toThrow();
  });
});
