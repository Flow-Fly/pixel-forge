import { afterEach, describe, expect, it } from 'vitest';
import '../../../src/components/ui/pf-panel';
import type { PFPanel } from '../../../src/components/ui/pf-panel';

async function settle(panel: PFPanel): Promise<void> {
  await panel.updateComplete;
  await Promise.resolve();
  await panel.updateComplete;
}

describe('pf-panel', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('associates the collapse toggle with content and hides collapsed descendants', async () => {
    const panel = document.createElement('pf-panel') as PFPanel;
    panel.header = 'Creative Run';
    panel.collapsible = true;
    const action = document.createElement('button');
    action.textContent = 'Run action';
    panel.append(action);
    document.body.append(panel);
    await settle(panel);

    const toggle = panel.shadowRoot?.querySelector<HTMLButtonElement>('.header-toggle');
    const content = panel.shadowRoot?.querySelector<HTMLElement>('.content');
    expect(toggle).not.toBeNull();
    expect(content).not.toBeNull();
    expect(toggle?.getAttribute('aria-controls')).toBe(content?.id);
    expect(content?.hasAttribute('hidden')).toBe(false);

    toggle?.click();
    await settle(panel);

    expect(panel.collapsed).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(content?.hasAttribute('hidden')).toBe(true);
    expect(content?.hasAttribute('inert')).toBe(true);
  });
});
