import type { ViewEffectDefinition } from './types';

const definitions = new Map<string, ViewEffectDefinition>();

export function registerViewEffect(definition: ViewEffectDefinition): void {
  definitions.set(definition.id, definition);
}

export function getViewEffectDefinition(id: string): ViewEffectDefinition | undefined {
  return definitions.get(id);
}

export function getViewEffectDefinitions(): ViewEffectDefinition[] {
  return [...definitions.values()];
}
