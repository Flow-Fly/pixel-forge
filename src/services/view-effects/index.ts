import { CrtViewEffect, CRT_EFFECT_ID } from './crt';
import { PassthroughViewEffect } from './passthrough';
import { registerViewEffect } from './registry';

registerViewEffect({
  id: 'passthrough',
  name: 'Passthrough',
  create: () => new PassthroughViewEffect(),
});

registerViewEffect({
  id: CRT_EFFECT_ID,
  name: 'CRT',
  create: () => new CrtViewEffect(),
});

export { ViewEffectPipeline } from './pipeline';
export type { ViewEffectRenderOptions } from './pipeline';
export { getViewEffectDefinition, getViewEffectDefinitions, registerViewEffect } from './registry';
export type { ViewEffect, ViewEffectDefinition, ViewEffectFrame, ViewEffectParams } from './types';
export {
  CRT_EFFECT_ID,
  CRT_PARAM_CONTROLS,
  CRT_PRESETS,
  CRT_PRESET_OPTIONS,
  getCrtParams,
  getCrtPresetId,
} from './crt';
export type { CrtParamKey, CrtParams, CrtPresetId } from './crt';
