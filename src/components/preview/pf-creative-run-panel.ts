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
      min-height: 0;
      container-type: inline-size;
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
      min-height: 0;
      padding: 12px;
    }

    .surface-content {
      display: grid;
      gap: 12px;
      min-width: 0;
      min-height: 0;
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

    .last-action {
      overflow-wrap: anywhere;
    }

    .toolbar {
      border: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
    }

    .toolbar legend {
      color: var(--creative-run-muted);
      font-size: 0.75rem;
      padding: 0;
      width: 100%;
    }

    .refine {
      border-top: 1px solid color-mix(in srgb, var(--creative-run-border) 70%, transparent);
      padding-top: 8px;
    }

    .refine summary {
      align-items: center;
      cursor: pointer;
      display: flex;
      font-size: 0.75rem;
      min-height: 44px;
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
      min-height: 44px;
      min-width: 44px;
      padding: 6px 10px;
      touch-action: manipulation;
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

    .timeline-disclosure {
      min-width: 0;
    }

    .timeline-disclosure > summary {
      align-items: center;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      min-height: 44px;
      padding: 4px 0;
    }

    .timeline-disclosure > summary:focus-visible {
      outline: 2px solid var(--creative-run-accent);
      outline-offset: 2px;
    }

    .timeline-count {
      color: var(--creative-run-muted);
      font-size: 0.6875rem;
      font-weight: 400;
      overflow-wrap: anywhere;
      text-align: end;
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

    .transaction-detail summary {
      align-items: center;
      cursor: pointer;
      display: flex;
      font-size: 0.75rem;
      font-weight: 600;
      min-height: 44px;
      overflow-wrap: anywhere;
    }

    .transaction-detail summary:focus-visible {
      outline: 2px solid var(--creative-run-accent);
      outline-offset: 2px;
    }

    .timeline-entry span {
      color: var(--creative-run-muted);
      font-size: 0.6875rem;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .timeline-action {
      justify-self: start;
      margin-top: 4px;
    }

    .recovery-summary {
      border: 1px solid var(--creative-run-border);
      display: grid;
      gap: 6px;
      padding: 8px;
    }

    .recovery-summary strong {
      color: var(--creative-run-accent);
      font-size: 0.8125rem;
    }

    .recovery-summary p {
      font-size: 0.75rem;
      line-height: 1.45;
    }

    dialog {
      background: var(--creative-run-panel);
      border: 1px solid var(--creative-run-border);
      border-radius: 8px;
      color: var(--creative-run-text);
      max-inline-size: min(28rem, calc(100vw - 2rem));
      padding: 16px;
    }

    dialog::backdrop {
      background: rgb(0 0 0 / 55%);
    }

    .dialog-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: end;
      margin-top: 12px;
    }

    .diagnostics {
      background: #101720;
      border: 1px solid var(--creative-run-border);
      font-size: 0.6875rem;
      line-height: 1.35;
      max-block-size: 180px;
      overflow: auto;
      padding: 8px;
      white-space: pre-wrap;
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

    @container (max-width: 560px) {
      .surface {
        border-radius: 0;
        border-inline: 0;
        padding: 10px;
      }

      .surface-content {
        gap: 10px;
      }

      .toolbar {
        gap: 8px;
      }

      .toolbar button {
        flex: 1 1 auto;
      }

      .timeline-list {
        max-block-size: min(32vh, 220px);
      }

      pf-agent-preview-surface {
        order: -1;
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
    this.syncConfirmationDialog();
  }

  protected render() {
    const controller = this.activeController;
    if (!controller) {
      return this.renderEmpty();
    }

    const state = controller.getState();
    const modalOpen = this.pendingConfirmation !== null;
    return html`
      <section
        class="surface"
        aria-labelledby="creative-run-title"
        data-run-id=${state.runId}
        data-target-id=${state.target.id}
        data-phase=${state.phase}
      >
        <div class="surface-content" ?inert=${modalOpen}>
          <div>
            <h2 id="creative-run-title">Creative Run</h2>
            <p class="muted">Run ${state.runId}, Brief revision ${state.brief.revision}</p>
          </div>
          ${this.renderBrief(state)}
          ${this.renderAuthority(state)}

          <fieldset class="toolbar">
            <legend>Creative Run controls</legend>
            ${this.renderControls(state)}
          </fieldset>
          ${this.renderRecoverySummary(state)}
          ${this.renderError(state)}
          ${this.renderTimeline(state)}

          ${this.previewObservation || this.previewError
            ? html`
                <pf-agent-preview-surface
                  .observation=${this.previewObservation}
                  .error=${this.previewError}
                ></pf-agent-preview-surface>
              `
            : nothing}
        </div>

        ${this.renderConfirmationDialog(state)}
      </section>
    `;
  }

  private renderEmpty() {
    return html`
      <section class="surface" aria-labelledby="creative-run-title">
        <h2 id="creative-run-title">Creative Run</h2>
        <p class="empty" role="status">No active Creative Run.</p>
      </section>
    `;
  }

  private renderBrief(state: CreativeRunState) {
    return html`
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
    `;
  }

  private renderAuthority(state: CreativeRunState) {
    return html`
      <section class="authority" aria-labelledby="creative-run-authority-title">
        <h3 id="creative-run-authority-title">Run authority</h3>
        <p class="status" role="status">${formatPhase(state.phase)}</p>
        <dl>
          <dt>Transactions</dt><dd>${state.transactionsUsed} used · ${state.remainingTransactions} remaining</dd>
          <dt>Run time</dt><dd>${state.elapsedSeconds}s elapsed · ${state.remainingDurationSeconds}s remaining</dd>
          <dt>Revision</dt><dd>${state.currentRevision} (last durable ${state.lastDurableRevision})</dd>
          <dt>Grant</dt><dd>${state.grant ? formatGrant(state) : 'Not available'}</dd>
          <dt>Last action</dt><dd class="last-action">${formatLastAction(state)}</dd>
        </dl>
      </section>
    `;
  }

  private renderRecoverySummary(state: CreativeRunState) {
    if (!state.recovery) return nothing;
    return html`
      <section class="recovery-summary" aria-labelledby="creative-run-recovery-title">
        <strong id="creative-run-recovery-title">Recovery safety</strong>
        <p>
          ${state.recovery.recoveryCopyId
            ? `A Recovery Copy is preserved (${state.recovery.recoveryCopyId}). The original project remains unchanged until a confirmed action completes.`
            : 'The original project and any later edits remain preserved. Recovery never reuses or deletes a project key.'}
        </p>
        ${state.recovery.interrupted
          ? html`<p role="status">This run was interrupted. A new session, fresh observation, and approval are required before writing.</p>`
          : nothing}
      </section>
    `;
  }

  private renderError(state: CreativeRunState) {
    return state.error
      ? html`<p class="error" role="alert">${state.error.code}. Next action: ${state.error.nextAction}.</p>`
      : nothing;
  }

  private renderTimeline(state: CreativeRunState) {
    return html`
      <section class="timeline" aria-labelledby="creative-run-timeline-title">
        <details class="timeline-disclosure" open>
          <summary id="creative-run-timeline-title">
            <span>Activity timeline</span>
            <span class="timeline-count">${timelineCountLabel(state)}</span>
          </summary>
          ${state.collapsedTimelineEntries > 0
            ? html`<p class="muted">${state.collapsedTimelineEntries} older entries collapsed.</p>`
            : nothing}
          <ol class="timeline-list">
            ${state.timeline.map((entry) => this.renderTimelineEntry(entry, state))}
          </ol>
        </details>
      </section>
    `;
  }

  private renderTimelineEntry(entry: CreativeRunState['timeline'][number], state: CreativeRunState) {
    if (entry.kind !== 'transaction') {
      return html`<li class="timeline-entry"><strong>${entryLabel(entry)}</strong><span>t=${entry.timestamp} · ${entryDetails(entry)}</span></li>`;
    }
    return html`
      <li class="timeline-entry">
        <details class="transaction-detail">
          <summary>${entryLabel(entry)}</summary>
          <span>t=${entry.timestamp} · ${entryDetails(entry)}</span>
          ${entry.operationId && state.recovery
            ? html`<button class="timeline-action" type="button" ?disabled=${this.actionBusy}
                @click=${() => this.requestRewind(entry.operationId!)}>
                Rewind after this transaction
              </button>`
            : nothing}
        </details>
      </li>
    `;
  }

  // fallow-ignore-next-line complexity -- Controls are conditionally rendered for each supervised lifecycle phase.
  private renderControls(state: CreativeRunState) {
    const controller = this.activeController;
    if (!controller) return nothing;
    const approveDisabled = state.approvedBriefRevision === state.brief.revision
      || state.phase === 'running'
      || state.phase === 'pausing'
      || state.phase === 'stopping'
      || this.actionBusy;
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
            <button type="button" ?disabled=${state.packagePreparedRevision !== null || this.actionBusy} @click=${() => void this.runAction(() => controller.accept())}>
              Accept / Prepare Package
            </button>
          `
        : nothing}
      ${state.recovery && (state.phase === 'paused' || state.phase === 'stopped')
        ? html`
            <button type="button" ?disabled=${this.actionBusy} @click=${() => this.requestCheckpointRewind()}>
              Rewind to Checkpoint…
            </button>
            <button type="button" ?disabled=${this.actionBusy} @click=${() => this.requestReject()}>
              Reject Run…
            </button>
            <button type="button" ?disabled=${this.actionBusy} @click=${() => void this.runAction(() => controller.createRecoveryCopy())}>
              Create Recovery Copy
            </button>
          `
        : nothing}
      ${state.recovery?.recoveryCopyId
        ? html`<button type="button" ?disabled=${this.actionBusy} @click=${() => void this.runAction(() => controller.openRecoveryCopy())}>
            Open Recovery Copy
          </button>`
        : nothing}
      ${state.recovery?.interrupted
        ? html`
            <button type="button" ?disabled=${this.actionBusy} @click=${() => void this.runAction(() => controller.resumeAfterInterruption())}>
              Resume with New Session…
            </button>
          `
        : nothing}
      ${state.recovery
        ? html`
            <button type="button" ?disabled=${this.actionBusy} @click=${() => { this.diagnosticsOpen = !this.diagnosticsOpen; }}>
              ${this.diagnosticsOpen ? 'Hide local diagnostics' : 'Inspect local diagnostics'}
            </button>
            ${this.diagnosticsOpen
              ? html`<pre class="diagnostics" aria-label="Local recovery diagnostics">${JSON.stringify(controller.getRecoveryDiagnostics(), null, 2)}</pre>`
              : nothing}
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

  private actionBusy = false;
  private diagnosticsOpen = false;
  private pendingConfirmation: { readonly kind: 'reject' | 'rewind'; readonly operationId?: string; readonly checkpoint?: boolean } | null = null;

  private requestReject(): void {
    this.pendingConfirmation = { kind: 'reject' };
    this.requestUpdate();
  }

  private requestRewind(operationId: string): void {
    this.pendingConfirmation = { kind: 'rewind', operationId };
    this.requestUpdate();
  }

  private requestCheckpointRewind(): void {
    this.pendingConfirmation = { kind: 'rewind', checkpoint: true };
    this.requestUpdate();
  }

  private renderConfirmationDialog(state: CreativeRunState) {
    const pending = this.pendingConfirmation;
    if (!pending) return nothing;
    const rewind = pending.kind === 'rewind';
    const checkpoint = pending.checkpoint === true;
    return html`
      <dialog aria-modal="true" aria-labelledby="creative-run-confirm-title" aria-describedby="creative-run-confirm-copy" @cancel=${this.handleDialogCancel}>
        <h3 id="creative-run-confirm-title">${rewind ? 'Confirm rewind' : 'Confirm reject'}</h3>
        <p id="creative-run-confirm-copy">
          ${rewind
            ? checkpoint
              ? 'All owned Creative Run transactions will be undone through the owned history boundary to the pre-run checkpoint. A fresh observation and approval will be required.'
              : 'Later Creative Run transactions will be undone through the owned history boundary. The selected transaction remains, and a fresh observation and approval will be required.'
            : 'The rejected result will be preserved under a fresh Recovery Copy before the original checkpoint is restored. Later edits stop this restore and remain untouched. A successful in-place reject resets conventional undo/redo history; both states remain recoverable.'}
        </p>
        <p class="muted">Project: ${state.target.name}. No copy is deleted or overwritten.</p>
        <div class="dialog-actions">
          <button type="button" autofocus ?disabled=${this.actionBusy} @click=${this.cancelConfirmation}>Cancel</button>
          <button type="button" ?disabled=${this.actionBusy} @click=${() => void this.confirmPendingAction()}>
            ${rewind ? 'Rewind' : 'Reject Run'}
          </button>
        </div>
      </dialog>
    `;
  }

  private cancelConfirmation = (): void => {
    if (this.actionBusy) return;
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>('dialog');
    if (dialog?.open) dialog.close();
    this.pendingConfirmation = null;
    this.requestUpdate();
  };

  private async confirmPendingAction(): Promise<void> {
    const pending = this.pendingConfirmation;
    const controller = this.activeController;
    if (!pending || !controller) return;
    if (pending.kind === 'rewind' && pending.operationId) {
      await this.runAction(() => controller.rewind({ operationId: pending.operationId }));
    } else if (pending.kind === 'rewind' && pending.checkpoint) {
      await this.runAction(() => controller.rewind({ checkpoint: true }));
    } else {
      await this.runAction(() => controller.reject(true));
    }
    this.cancelConfirmation();
  }

  private async runAction(action: () => Promise<unknown>): Promise<void> {
    if (this.actionBusy) return;
    this.actionBusy = true;
    this.requestUpdate();
    try {
      await action();
    } finally {
      this.actionBusy = false;
      this.requestUpdate();
    }
  }

  private refineBrief(controller: CreativeRunController): void {
    const goal = this.renderRoot.querySelector<HTMLTextAreaElement>('#creative-run-refine-goal')?.value;
    if (goal) controller.refineBrief({ goal });
  }

  private bindController(): void {
    const controller = this.activeController;
    if (this.observedController === controller) return;
    this.unbindController();
    if (!controller) return;
    this.observedController = controller;
    this.observedController.events.addEventListener('creative-run-state-changed', this.handleControllerChange);
  }

  private get activeController(): CreativeRunController | null {
    let current = this.controller;
    const visited = new Set<CreativeRunController>();
    while (current?.replacement && !visited.has(current)) {
      visited.add(current);
      current = current.replacement;
    }
    return current;
  }

  private syncConfirmationDialog(): void {
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>('dialog');
    if (!dialog || !this.pendingConfirmation) return;
    if (!dialog.open) dialog.showModal();
    this.renderRoot.querySelector<HTMLElement>('dialog [autofocus]')?.focus();
  }

  private readonly handleDialogCancel = (event: Event): void => {
    if (this.actionBusy) {
      event.preventDefault();
      return;
    }
    this.cancelConfirmation();
  };

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

function formatLastAction(state: CreativeRunState): string {
  const transaction = state.lastDurableResult;
  if (transaction) {
    return `${transaction.profile} transaction · revision ${transaction.fromRevision} → ${transaction.toRevision}`;
  }
  if (state.packagePreparedRevision !== null) {
    return `Package prepared · revision ${state.packagePreparedRevision}`;
  }
  if (state.phase === 'draft') return 'No committed action yet';
  if (state.phase === 'recovery-required') return 'Recovery required before another write';
  if (state.phase === 'accepted') return 'Run accepted';
  if (state.phase === 'rejected') return 'Run rejected';
  return 'No committed transaction yet';
}

function timelineCountLabel(state: CreativeRunState): string {
  const recentCount = state.timeline.length;
  if (state.collapsedTimelineEntries === 0) {
    return `${recentCount} ${recentCount === 1 ? 'entry' : 'entries'}`;
  }
  return `${recentCount} recent · ${state.collapsedTimelineEntries} older collapsed`;
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
    entry.ordinal !== undefined ? `ordinal ${entry.ordinal}` : undefined,
    entry.childCount !== undefined ? `${entry.childCount} children` : undefined,
    entry.fromRevision !== undefined && entry.toRevision !== undefined
      ? `revision ${entry.fromRevision} → ${entry.toRevision}`
      : undefined,
    entry.errorCode,
    entry.durationMs !== undefined ? coarseDuration(entry.durationMs) : undefined,
    entry.count !== undefined ? `${entry.count} older entries` : undefined,
  ];
  return values.filter((value): value is string => Boolean(value)).join(' · ') || 'Recorded locally';
}

function coarseDuration(durationMs: number): string {
  if (durationMs < 1000) return `~${Math.max(1, Math.round(durationMs / 100) * 100)}ms`;
  return `~${Math.max(1, Math.round(durationMs / 1000))}s`;
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-creative-run-panel': PFCreativeRunPanel;
  }
}
