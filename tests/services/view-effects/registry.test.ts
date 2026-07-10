import { describe, expect, it } from 'vitest';

import {
  getViewEffectDefinition,
  getViewEffectDefinitions,
  registerViewEffect,
  type ViewEffect,
} from '../../../src/services/view-effects';

describe('view-effect registry', () => {
  it('registers the passthrough effect by default', () => {
    expect(getViewEffectDefinition('passthrough')?.name).toBe('Passthrough');
  });

  it('can switch to a second registered effect at runtime', () => {
    const effect = { id: 'test-effect', name: 'Test Effect' } as ViewEffect;
    registerViewEffect({
      id: effect.id,
      name: effect.name,
      create: () => effect,
    });

    expect(getViewEffectDefinition('test-effect')?.create()).toBe(effect);
    expect(getViewEffectDefinitions().map((definition) => definition.id)).toContain('test-effect');
  });
});
