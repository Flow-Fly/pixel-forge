import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { RenderObservation } from '../../editor/observations';
import {
  CreativeRunController,
  type CreativeRunPhase,
  type CreativeRunState,
} from '../../editor/creative-run';
import './pf-agent-preview-surface';

/**
 * Local supervision surface for one Creative Run. The controller is the only
 * source of lifecycle authority; this element only renders detached state and
 * dispatches the small set of human actions.
 */
@customElement('pf-creative-run-panel')
export class PFCreativeRunPanel extends LitElement {
  static styles = css`
    :host {
      --creative-run-border: var(--pf-color-border, #394453);
      --creative-run-muted: var(--pf-color-text-muted, #aeb9c8);
      --creative-run-text: var(--pf-color-text-main, #f1f4f8);
      --creative-run-panel: var(--pf-color-bg-panel, #151b24);
      --creative-run-accent: var(--pf-color-accent, #8bd3ff);
      color: var(--creative-run-text);
      display: block;
      min-width: 0;
      font-family: system-ui, sans-serif;
    }

    .surface {
      background: var(--creative-run-panel);
      border: 1px solid var(--creative-run-border);
      border-radius: 8px;
      box-sizing: border-box;
      display: grid;
      gap: 12px;
      min-width: 0;
      padding: 12px;
    }

    h2,
    h3,
    p,
    dl,
    ul {
      margin: 0;
    }

    h2 {
      font-size: 1rem;
      line-height: 1.35;
    }

    h3 {
      font-size: 0.8125rem;
      line-height: 1.35;
    }

    .muted,
    .empty,
    .error,
    dt,
    figcaption {
      color: var(--creative-run-muted);
      font-size: 0.75rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .brief,
    .authority,
    .timeline {
      border-top: 1px solid color-mix(in srgb, var(--creative-run-border) 70%, transparent);
      display: grid;
      gap: 8px;
      padding-top: 10px;
    }

    .brief-copy {
      display: grid;
      gap: 4px;
    }

    .brief-copy p {
      font-size: 0.8125rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    dl {
      display: grid;
      gap: 6px;
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    }

    dd {
      font-size: 0.75rem;
      line-height: 1.45;
      margin: 0;
      overflow-wrap: anywhere;
    }

    .status {
      color: var(--creative-run-accent);
      font-size: 0.875rem;
      font-weight: 650;
      text-transform: capitalize;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .refine {
      border-top: 1px solid color-mix(in srgb, var(--creative-run-border) 70%, transparent);
      padding-top: 8px;
    }

    .refine summary {
      cursor: pointer;
      font-size: 0.75rem;
      padding: 4px 0;
    }

    .refine-form {
      display: grid;
      gap: 6px;
      padding-top: 8px;
    }

    textarea {
      background: #101720;
      border: 1px solid var(--creative-run-border);
      border-radius: 4px;
      color: var(--creative-run-text);
      font: inherit;
      font-size: 0.75rem;
      min-height: 56px;
      padding: 6px;
      resize: vertical;
      width: 100%;
    }

    textarea:focus-visible {
      outline: 2px solid var(--creative-run-accent);
      outline-offset: 2px;
    }

    button {
      background: #202a37;
      border: 1px solid var(--creative-run-border);
      border-radius: 4px;
      color: var(--creative-run-text);
      cursor: pointer;
      font: inherit;
      font-size: 0.75rem;
      min-height: 36px;
      padding: 6px 10px;
    }

    button:hover:not(:disabled) {
      border-color: var(--creative-run-accent);
    }

    button:focus-visible {
      outline: 2px solid var(--creative-run-accent);
      outline-offset: 2px;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }

    .timeline-list {
      display: grid;
      gap: 6px;
      list-style: none;
      max-block-size: 220px;
      overflow: auto;
      padding: 0;
    }

    .timeline-entry {
      border-inline-start: 2px solid var(--creative-run-border);
      display: grid;
      gap: 2px;
      padding-inline-start: 8px;
    }

    .timeline-entry strong {
      font-size: 0.75rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .timeline-entry span {
      color: var(--creative-run-muted);
      font-size: 0.6875rem;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    pf-agent-preview-surface {
      margin-top: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    }
  `;

  @property({ attribute: false }) controller: CreativeRunController | null = null;
  @property({ attribute: false }) previewObservation: RenderObservation | null = null;
  @property({ type: String }) previewError = '';

  private observedController: CreativeRunController | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.bindController();
  }

  disconnectedCallback(): void {
    this.unbindController();
    super.disconnectedCallback();
  }

  protected updated(): void {
    this.bindController();
  }

  protected render() {
    const controller = this.controller;
    if (!controller) {
      return html`
        <section class="surface" aria-labelledby="creative-run-title">
          <h2 id="creative-run-title">Creative Run</h2>
          <p class="empty" role="status">No active Creative Run.</p>
        </section>
      `;
    }

    const state = controller.getState();
    return html`
      <section class="surface" aria-labelledby="creative-run-title">
        <div>
          <h2 id="creative-run-title">Creative Run</h2>
          <p class="muted">Run ${state.runId}, Brief revision ${state.brief.revision}</p>
        </div>

        <section class="brief" aria-labelledby="creative-run-brief-title">
          <h3 id="creative-run-brief-title">Approved Creative Brief</h3>
          <div class="brief-copy">
            <p><strong>Goal:</strong> ${state.brief.goal}</p>
            ${state.brief.constraints.length > 0
              ? html`<p><strong>Constraints:</strong> ${state.brief.constraints.join(' · ')}</p>`
              : nothing}
          </div>
          <dl>
            <dt>Approval</dt><dd>${state.approvedBriefRevision === state.brief.revision ? `Approved revision ${state.brief.revision}` : 'Creator approval required'}</dd>
            <dt>Project</dt><dd>${state.target.name}</dd>
            <dt>Requested authority</dt><dd>${state.brief.requestedWriteCategories.join(', ')}</dd>
            <dt>Content posture</dt><dd>${state.brief.contentEgress}</dd>
            <dt>Duration</dt><dd>${state.brief.durationSeconds}s</dd>
          </dl>
        </section>

        <section class="authority" aria-labelledby="creative-run-authority-title">
          <h3 id="creative-run-authority-title">Run authority</h3>
          <p class="status" role="status">${formatPhase(state.phase)}</p>
          <dl>
            <dt>Transactions</dt><dd>${state.transactionsUsed} used · ${state.remainingTransactions} remaining</dd>
            <dt>Revision</dt><dd>${state.currentRevision} (last durable ${state.lastDurableRevision})</dd>
            <dt>Grant</dt><dd>${state.grant ? formatGrant(state) : 'Not available'}</dd>
          </dl>
        </section>

        <div class="toolbar" aria-label="Creative Run controls">
          ${this.renderControls(state)}
        </div>

        ${state.error
          ? html`<p class="error" role="alert">${state.error.code}. Next action: ${state.error.nextAction}.</p>`
          : nothing}

        <section class="timeline" aria-labelledby="creative-run-timeline-title">
          <h3 id="creative-run-timeline-title">Activity</h3>
          ${state.collapsedTimelineEntries > 0
            ? html`<p class="muted">${state.collapsedTimelineEntries} older entries collapsed.</p>`
            : nothing}
          <ol class="timeline-list">
            ${state.timeline.map((entry) => html`
              <li class="timeline-entry">
                <strong>${entryLabel(entry)}</strong>
                <span>t=${entry.timestamp} · ${entryDetails(entry)}</span>
              </li>
            `)}
          </ol>
        </section>

        <pf-agent-preview-surface
          .observation=${this.previewObservation}
          .error=${this.previewError}
        ></pf-agent-preview-surface>
      </section>
    `;
  }

  // fallow-ignore-next-line complexity -- Controls are conditionally rendered for each supervised lifecycle phase.
  private renderControls(state: CreativeRunState) {
    const controller = this.controller;
    if (!controller) return nothing;
    const approveDisabled = state.approvedBriefRevision === state.brief.revision
      || state.phase === 'running'
      || state.phase === 'pausing'
      || state.phase === 'stopping';
    return html`
      <button type="button" ?disabled=${approveDisabled} @click=${() => controller.approveBrief(toApproval(state))}>
        Approve Brief
      </button>
      ${state.phase === 'ready'
        ? html`<button type="button" @click=${() => void controller.start()}>Start Run</button>`
        : nothing}
      ${state.phase === 'paused'
        ? html`<button type="button" @click=${() => void controller.resume()}>Resume Run</button>`
        : nothing}
      ${state.phase === 'running'
        ? html`<button type="button" @click=${() => controller.pause()}>Pause</button>`
        : nothing}
      ${isReviewable(state.phase)
        ? html`<button type="button" @click=${() => controller.stop()}>Stop</button>`
        : nothing}
      ${state.phase === 'paused' || state.phase === 'stopped'
        ? html`
            <button type="button" ?disabled=${state.packagePreparedRevision !== null} @click=${() => void controller.accept()}>
              Accept / Prepare Package
            </button>
          `
        : nothing}
      ${state.phase !== 'accepted' && state.phase !== 'rejected'
        ? html`
            <details class="refine">
              <summary>Refine Brief</summary>
              <div class="refine-form">
                <label for="creative-run-refine-goal">New goal</label>
                <textarea id="creative-run-refine-goal" .value=${state.brief.goal}></textarea>
                <button type="button" @click=${() => this.refineBrief(controller)}>
                  Apply Brief Revision
                </button>
              </div>
            </details>
          `
        : nothing}
    `;
  }

  private refineBrief(controller: CreativeRunController): void {
    const goal = this.renderRoot.querySelector<HTMLTextAreaElement>('#creative-run-refine-goal')?.value;
    if (goal) controller.refineBrief({ goal });
  }

  private bindController(): void {
    if (this.observedController === this.controller) return;
    this.unbindController();
    if (!this.controller) return;
    this.observedController = this.controller;
    this.observedController.events.addEventListener('creative-run-state-changed', this.handleControllerChange);
  }

  private unbindController(): void {
    this.observedController?.events.removeEventListener('creative-run-state-changed', this.handleControllerChange);
    this.observedController = null;
  }

  private readonly handleControllerChange = (): void => {
    this.requestUpdate();
  };
}

function toApproval(state: CreativeRunState) {
  return {
    briefRevision: state.brief.revision,
    targetId: state.brief.targetId,
    requestedWriteCategories: state.brief.requestedWriteCategories,
    transactionLimit: state.brief.transactionLimit,
    durationSeconds: state.brief.durationSeconds,
    contentEgress: state.brief.contentEgress,
  };
}

function formatPhase(phase: CreativeRunPhase): string {
  return phase.replaceAll('-', ' ');
}

function formatGrant(state: CreativeRunState): string {
  if (!state.grant) return 'Not available';
  return `${state.grant.status}, ${state.grant.categories.join(', ')}`;
}

function isReviewable(phase: CreativeRunPhase): boolean {
  return phase === 'running' || phase === 'ready' || phase === 'paused' || phase === 'stopped';
}

function entryLabel(entry: CreativeRunState['timeline'][number]): string {
  const phase = entry.phase ? `: ${entry.phase}` : '';
  return entry.outcome ? `${entry.kind}${phase} (${entry.outcome})` : `${entry.kind}${phase}`;
}

function entryDetails(entry: CreativeRunState['timeline'][number]): string {
  const values = [
    entry.profile,
    entry.operationId,
    entry.fromRevision !== undefined && entry.toRevision !== undefined
      ? `revision ${entry.fromRevision} → ${entry.toRevision}`
      : undefined,
    entry.errorCode,
    entry.count !== undefined ? `${entry.count} older entries` : undefined,
  ];
  return values.filter((value): value is string => Boolean(value)).join(' · ') || 'Recorded locally';
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-creative-run-panel': PFCreativeRunPanel;
  }
}
