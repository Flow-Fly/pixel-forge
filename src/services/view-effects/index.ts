import { PassthroughViewEffect } from './passthrough';
import { registerViewEffect } from './registry';

registerViewEffect({
  id: 'passthrough',
  name: 'Passthrough',
  create: () => new PassthroughViewEffect(),
});

export { ViewEffectPipeline } from './pipeline';
export type { ViewEffectRenderOptions } from './pipeline';
export { getViewEffectDefinition, getViewEffectDefinitions, registerViewEffect } from './registry';
export type { ViewEffect, ViewEffectDefinition, ViewEffectFrame, ViewEffectParams } from './types';
