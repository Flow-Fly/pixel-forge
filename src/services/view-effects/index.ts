import { createCrtViewEffect, CRT_EFFECT_ID } from './crt';
import { createPassthroughViewEffect } from './passthrough';
import { registerViewEffect } from './registry';

registerViewEffect({
  id: 'passthrough',
  name: 'Passthrough',
  create: createPassthroughViewEffect,
});

registerViewEffect({
  id: CRT_EFFECT_ID,
  name: 'CRT',
  create: createCrtViewEffect,
});

export { ViewEffectPipeline } from './pipeline';
export { getViewEffectDefinition, getViewEffectDefinitions, registerViewEffect } from './registry';
export type { ViewEffect } from './types';
export {
  CRT_EFFECT_ID,
  CRT_PARAM_CONTROLS,
  CRT_PRESETS,
  CRT_PRESET_OPTIONS,
  getCrtParams,
  getCrtPresetId,
} from './crt';
export type { CrtParamKey, CrtPresetId } from './crt';
export {
  MIN_VIEW_EFFECT_EXPORT_SCALE,
  getViewEffectExportBaseName,
  renderViewEffectToCanvas,
} from './render-to-canvas';
