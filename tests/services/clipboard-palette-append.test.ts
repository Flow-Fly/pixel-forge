import { afterEach, describe, expect, it } from 'vitest';

import { applyClipboardPaletteAppendPlan } from '../../src/services/clipboard-palette-append';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';

const contexts: ProjectContext[] = [];

function createPaletteContext(): ProjectContext {
  const context = createProjectContext();
  contexts.push(context);
  context.palette.setPalette(['#111111']);
  context.palette.clearAllNewFlags();
  return context;
}

describe('applyClipboardPaletteAppendPlan', () => {
  afterEach(() => {
    for (const context of contexts.splice(0)) {
      context.dispose();
    }
  });

  it('appends missing colors and marks them new', () => {
    const context = createPaletteContext();

    const result = applyClipboardPaletteAppendPlan(context.palette, ['#222222', '#333333']);

    expect(context.palette.mainColors.value).toEqual(['#111111', '#222222', '#333333']);
    expect(context.palette.isNewColor('#222222')).toBe(true);
    expect(context.palette.isNewColor('#333333')).toBe(true);
    expect(result).toEqual({
      targetColors: ['#111111', '#222222', '#333333'],
      appendedColors: ['#222222', '#333333'],
      appendedIndices: [2, 3],
    });
  });

  it('dedupes existing and repeated append colors by normalized hex', () => {
    const context = createPaletteContext();

    const result = applyClipboardPaletteAppendPlan(context.palette, ['#111', '#222', '#222222']);

    expect(context.palette.mainColors.value).toEqual(['#111111', '#222222']);
    expect(context.palette.isNewColor('#111111')).toBe(false);
    expect(context.palette.isNewColor('#222222')).toBe(true);
    expect(result.appendedColors).toEqual(['#222222']);
    expect(result.appendedIndices).toEqual([2]);
  });

  it('leaves palette colors and flags unchanged when nothing is appended', () => {
    const context = createPaletteContext();
    context.palette.newColorFlags.value = new Set(['#111111']);
    const beforeColors = [...context.palette.mainColors.value];
    const beforeFlags = new Set(context.palette.newColorFlags.value);

    const result = applyClipboardPaletteAppendPlan(context.palette, ['#111111']);

    expect(context.palette.mainColors.value).toEqual(beforeColors);
    expect(context.palette.newColorFlags.value).toEqual(beforeFlags);
    expect(result).toEqual({
      targetColors: beforeColors,
      appendedColors: [],
      appendedIndices: [],
    });
  });
});
