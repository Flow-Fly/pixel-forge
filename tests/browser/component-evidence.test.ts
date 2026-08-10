import { html, LitElement } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

const fixtureTagName = 'pf-browser-evidence-fixture';

class BrowserEvidenceFixture extends LitElement {
  private activated = false;

  private handleActivate = () => {
    this.activated = true;
    this.requestUpdate();
  };

  render() {
    return html`
      <button type="button" @click=${this.handleActivate}>Activate fixture</button>
      <div role="status" aria-live="polite">${this.activated ? 'activated' : 'idle'}</div>
      <canvas
        data-testid="evidence-canvas"
        aria-label="Canvas evidence"
        width="2"
        height="2"
      ></canvas>
    `;
  }
}

if (!customElements.get(fixtureTagName)) {
  customElements.define(fixtureTagName, BrowserEvidenceFixture);
}

async function mountFixture() {
  const fixture = document.createElement(fixtureTagName);
  document.body.append(fixture);
  await (fixture as BrowserEvidenceFixture).updateComplete;
}

function resetFixtureState() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  document.body.replaceChildren();
}

function assertButtonFocused(button: HTMLElement) {
  const fixture = document.querySelector(fixtureTagName);
  expect(fixture?.shadowRoot?.activeElement).toBe(button);
}

describe('real browser component evidence', () => {
  afterEach(resetFixtureState);

  it('queries a visible Lit control through its open shadow root', async () => {
    await mountFixture();

    const button = page.getByRole('button', { name: 'Activate fixture' });

    await expect.element(button).toBeVisible();
    await expect.element(button).toHaveAccessibleName('Activate fixture');
  });

  it('activates the native button through provider-backed pointer input', async () => {
    await mountFixture();

    await userEvent.click(page.getByRole('button', { name: 'Activate fixture' }));

    await expect.element(page.getByRole('status')).toHaveTextContent('activated');
  });

  it('activates a fresh button with native Enter after Tab focus', async () => {
    await mountFixture();

    const button = page.getByRole('button', { name: 'Activate fixture' });
    await userEvent.tab();
    assertButtonFocused(button.element());

    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('status')).toHaveTextContent('activated');
  });

  it('activates another fresh button with native Space after Tab focus', async () => {
    await mountFixture();

    const button = page.getByRole('button', { name: 'Activate fixture' });
    await userEvent.tab();
    assertButtonFocused(button.element());

    await userEvent.keyboard('{Space}');

    await expect.element(page.getByRole('status')).toHaveTextContent('activated');
  });

  it('reads deterministic RGBA pixels from a real Canvas 2D context', async () => {
    await mountFixture();

    const canvas = page.getByTestId('evidence-canvas').element() as HTMLCanvasElement;
    const context = canvas.getContext('2d');

    expect(context).not.toBeNull();
    if (!context) {
      throw new Error('Chromium did not provide a 2D canvas context');
    }
    context.fillStyle = '#1a2b3c';
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = '#d4e5f6';
    context.fillRect(1, 1, 1, 1);

    expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([26, 43, 60, 255]);
    expect([...context.getImageData(1, 1, 1, 1).data]).toEqual([212, 229, 246, 255]);
  });
});
