import { afterEach, describe, expect, it } from 'vitest';
import '../../../src/components/dialogs/pf-resize-dialog';
import type { PFResizeDialog } from '../../../src/components/dialogs/pf-resize-dialog';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
} from '../../../src/stores/project-context';

describe('pf-resize-dialog guided restrictions', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    restoreDefaultProjectContext();
  });

  it('explains and defends the fixed guided canvas size', async () => {
    const context = createProjectContext();
    context.guidedDrawing.start({
      version: 1,
      width: 1,
      height: 1,
      target: Uint8Array.from([1]),
      guideColorCount: 1,
      settings: {
        longSide: 1,
        paletteSource: 'generated',
        maxColors: 1,
        mapping: 'color',
        simplifyIsolatedPixels: false,
      },
      createdAt: 1,
    });
    setActiveProjectContext(context);

    const element = document.createElement('pf-resize-dialog') as PFResizeDialog;
    element.open = true;
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain(
      'Guided projects keep their canvas size fixed',
    );
    expect(element.shadowRoot?.querySelectorAll('input:disabled')).toHaveLength(2);
    expect(element.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.disabled)
      .toBe(true);

    const originalSize = [context.project.width.value, context.project.height.value];
    (element as unknown as { width: number; height: number; apply(): void }).width = 20;
    (element as unknown as { width: number; height: number; apply(): void }).height = 20;
    (element as unknown as { apply(): void }).apply();
    expect([context.project.width.value, context.project.height.value]).toEqual(originalSize);

    context.dispose();
  });

  it('keeps resize controls available in a normal project', async () => {
    const context = createProjectContext();
    setActiveProjectContext(context);
    const element = document.createElement('pf-resize-dialog') as PFResizeDialog;
    element.open = true;
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelectorAll('input:disabled')).toHaveLength(0);
    expect(element.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.disabled)
      .toBe(false);

    context.dispose();
  });
});
