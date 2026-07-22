import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/components/ui/pf-dialog';
import type { PFDialog } from '../../../src/components/ui/pf-dialog';

function createDialog() {
  const dialog = document.createElement('pf-dialog') as PFDialog;
  dialog.open = true;
  dialog.innerHTML = `
    <span slot="title">Test Dialog</span>
    <p>Dialog content</p>
    <button slot="actions" class="primary">Apply</button>
  `;
  document.body.append(dialog);
  return dialog;
}

async function settle(dialog: PFDialog) {
  await dialog.updateComplete;
  await Promise.resolve();
  await dialog.updateComplete;
}

function slotText(dialog: PFDialog, name?: string) {
  const selector = name ? `slot[name="${name}"]` : 'slot:not([name])';
  const slot = dialog.shadowRoot?.querySelector<HTMLSlotElement>(selector);
  return slot
    ?.assignedNodes({ flatten: true })
    .map((node) => node.textContent)
    .join(' ');
}

describe('pf-dialog', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('renders slotted title, content, and actions when open', async () => {
    const dialog = createDialog();
    await settle(dialog);

    expect(slotText(dialog, 'title')).toContain('Test Dialog');
    expect(slotText(dialog)).toContain('Dialog content');
    expect(slotText(dialog, 'actions')).toContain('Apply');
    const surface = dialog.shadowRoot?.querySelector('.dialog');
    expect(surface?.getAttribute('role')).toBe('dialog');
    expect(surface?.getAttribute('aria-modal')).toBe('true');
    expect(surface?.getAttribute('aria-labelledby')).toBe('dialog-title');
    expect(dialog.shadowRoot?.querySelector('.close-btn')?.getAttribute('aria-label')).toBe(
      'Close dialog'
    );
  });

  it('contains keyboard focus and restores it after closing', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.append(opener);
    opener.focus();
    const dialog = createDialog();
    await settle(dialog);

    const close = dialog.shadowRoot?.querySelector<HTMLButtonElement>('.close-btn');
    const apply = dialog.querySelector<HTMLButtonElement>('[slot="actions"]');
    expect(dialog.shadowRoot?.activeElement).toBe(close);

    apply?.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(dialog.shadowRoot?.activeElement).toBe(close);

    close?.click();
    await settle(dialog);
    expect(document.activeElement).toBe(opener);
  });

  it('restores focus to an opener inside nested shadow roots', async () => {
    const outer = document.createElement('div');
    const outerRoot = outer.attachShadow({ mode: 'open' });
    const inner = document.createElement('span');
    const innerRoot = inner.attachShadow({ mode: 'open' });
    const opener = document.createElement('button');
    opener.textContent = 'Open nested dialog';
    innerRoot.append(opener);
    outerRoot.append(inner);
    document.body.append(outer);
    opener.focus();

    const dialog = createDialog();
    await settle(dialog);
    dialog.close();
    await settle(dialog);

    expect(outerRoot.activeElement).toBe(inner);
    expect(innerRoot.activeElement).toBe(opener);
  });

  it('keeps focus on the dialog surface when pending controls disappear', async () => {
    const dialog = createDialog();
    await settle(dialog);
    dialog.querySelector<HTMLButtonElement>('[slot="actions"]')?.focus();

    dialog.showCloseButton = false;
    dialog.querySelector('[slot="actions"]')?.remove();
    await settle(dialog);

    const surface = dialog.shadowRoot?.querySelector<HTMLElement>('.dialog');
    expect(surface?.tabIndex).toBe(-1);
    expect(dialog.shadowRoot?.activeElement).toBe(surface);
  });

  it('marks the dialog as a vertical scroll surface', async () => {
    const dialog = createDialog();
    await settle(dialog);

    expect(dialog.shadowRoot?.querySelector('.dialog')?.getAttribute('data-scrollbar')).toBe(
      'vertical'
    );
  });

  it('emits pf-close from the header close button', async () => {
    const dialog = createDialog();
    const closeSpy = vi.fn();
    dialog.addEventListener('pf-close', closeSpy);
    await settle(dialog);

    dialog.shadowRoot?.querySelector<HTMLButtonElement>('.close-btn')?.click();
    await settle(dialog);

    expect(dialog.open).toBe(false);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('emits pf-close on Escape when escape closing is enabled', async () => {
    const dialog = createDialog();
    const closeSpy = vi.fn();
    dialog.addEventListener('pf-close', closeSpy);
    await settle(dialog);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(dialog);

    expect(dialog.open).toBe(false);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps open on Escape when escape closing is disabled', async () => {
    const dialog = createDialog();
    const closeSpy = vi.fn();
    dialog.closeOnEscape = false;
    dialog.addEventListener('pf-close', closeSpy);
    await settle(dialog);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(dialog);

    expect(dialog.open).toBe(true);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('emits pf-close on backdrop click when backdrop closing is enabled', async () => {
    const dialog = createDialog();
    const closeSpy = vi.fn();
    dialog.addEventListener('pf-close', closeSpy);
    await settle(dialog);

    const overlay = dialog.shadowRoot?.querySelector<HTMLElement>('.overlay');
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(dialog);

    expect(dialog.open).toBe(false);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not close when an action slot button is clicked', async () => {
    const dialog = createDialog();
    const actionSpy = vi.fn();
    const closeSpy = vi.fn();
    const action = dialog.querySelector<HTMLButtonElement>('[slot="actions"]');
    action?.addEventListener('click', actionSpy);
    dialog.addEventListener('pf-close', closeSpy);
    await settle(dialog);

    action?.click();
    await settle(dialog);

    expect(dialog.open).toBe(true);
    expect(actionSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
