import { css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import {
  automationSessionController,
  ARTIST_MODE_MAX_TRANSACTIONS,
  type AutomationLocalArtistModeRun,
  type AutomationArtistModeEscalationRequest,
  type AutomationLocalTargetOption,
  type ArtistModeCategory,
  type ArtistModeRequestStatus,
  type AutomationSessionManager,
  type AutomationLocalSession,
  type AutomationSessionRequestStatus,
  type InspectObservationClass,
} from '../../editor/automation-session';
import '../ui/pf-dialog';

const OBSERVATION_LABELS: Readonly<Record<InspectObservationClass, string>> = {
  structure: 'Project structure',
  palette: 'Palette',
  timeline: 'Timeline and animation',
  raster: 'Exact raster grid',
  render: 'Rendered pixels',
  'save-state': 'Save state',
};

const ARTIST_CATEGORY_LABELS: Readonly<Record<ArtistModeCategory, string>> = {
  structure: 'Structure writes',
  palette: 'Palette writes',
  timeline: 'Timeline writes',
  raster: 'Raster writes',
};

/**
 * The only browser UI that can turn a pending public request into a local
 * Automation Session grant. Target choices intentionally come from the
 * browser-owned manager and are never copied into client-facing responses.
 */
@customElement('pf-automation-session-dialog')
export class PFAutomationSessionDialog extends BaseComponent {
  static styles = css`
    :host {
      display: contents;
    }

    .intro,
    .hint,
    .error {
      margin: 0;
      color: var(--pf-color-text-secondary, #b7bcc5);
      font-size: 12px;
      line-height: 1.45;
    }

    .intro strong {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sessions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .artist-runs {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .session-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .session {
      display: grid;
      gap: 4px;
      padding: 10px;
      border: 1px solid var(--pf-color-border, #333);
      border-radius: var(--pf-radius-sm, 4px);
    }

    .session-line {
      color: var(--pf-color-text-secondary, #b7bcc5);
      font-size: 12px;
      line-height: 1.35;
    }

    .session-line strong {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .session .revoke {
      justify-self: start;
      min-height: 34px;
    }

    .artist-run-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }

    .section-title {
      color: var(--pf-color-text-muted, #8f98a5);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    label,
    .check-label {
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 12px;
    }

    select {
      width: 100%;
      min-height: 40px;
      padding: 8px 10px;
      border: 1px solid var(--pf-color-border, #333);
      border-radius: var(--pf-radius-sm, 4px);
      background: var(--pf-color-bg-input, #1b2028);
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 13px;
    }

    input[type='number'] {
      width: 100%;
      min-height: 40px;
      box-sizing: border-box;
      padding: 8px 10px;
      border: 1px solid var(--pf-color-border, #333);
      border-radius: var(--pf-radius-sm, 4px);
      background: var(--pf-color-bg-input, #1b2028);
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 13px;
    }

    select:focus-visible,
    input:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--pf-color-accent, #4a9eff);
      outline-offset: 2px;
    }

    .choices {
      display: grid;
      gap: 6px;
    }

    .check-label {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 4px 8px;
      border: 1px solid var(--pf-color-border, #333);
      border-radius: var(--pf-radius-sm, 4px);
      cursor: pointer;
    }

    .check-label:has(input:checked) {
      border-color: var(--pf-color-accent, #4a9eff);
      background: var(--pf-color-primary-transparent, rgba(74, 158, 255, 0.12));
    }

    input[type='checkbox'] {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--pf-color-accent, #4a9eff);
    }

    .error {
      color: var(--pf-color-error, #f0aaa2);
    }

    .exclusions {
      margin: 0;
      padding-left: 18px;
      color: var(--pf-color-text-secondary, #b7bcc5);
      font-size: 12px;
      line-height: 1.45;
    }

    button {
      min-height: 40px;
      padding: 8px 14px;
      border-radius: var(--pf-radius-sm, 4px);
      cursor: pointer;
      font-size: 12px;
    }

    button.primary {
      border: 1px solid var(--pf-color-accent, #4a9eff);
      background: var(--pf-color-primary-transparent, rgba(74, 158, 255, 0.18));
      color: var(--pf-color-accent-hover, #dcecff);
    }

    button.secondary {
      border: 1px solid var(--pf-color-border, #333);
      background: transparent;
      color: var(--pf-color-text-main, #e0e0e0);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;
  @property({ attribute: false }) controller: AutomationSessionManager =
    automationSessionController;

  @state() private pending: AutomationSessionRequestStatus | null = null;
  @state() private pendingArtistMode: ArtistModeRequestStatus | null = null;
  @state() private pendingEscalation: AutomationArtistModeEscalationRequest | null = null;
  @state() private targets: readonly AutomationLocalTargetOption[] = [];
  @state() private sessions: readonly AutomationLocalSession[] = [];
  @state() private artistRuns: readonly AutomationLocalArtistModeRun[] = [];
  @state() private selectedTargetId = '';
  @state() private selectedClasses: readonly InspectObservationClass[] = [];
  @state() private selectedArtistCategories: readonly ArtistModeCategory[] = [];
  @state() private selectedTransactionLimit = 1;
  @state() private artistTarget: AutomationLocalTargetOption | null = null;
  @state() private errorMessage = '';
  private listeningController: AutomationSessionManager | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToController();
    window.addEventListener('show-automation-session-dialog', this.handleShow);
    this.refreshState(true);
  }

  disconnectedCallback() {
    this.unsubscribeFromController();
    window.removeEventListener('show-automation-session-dialog', this.handleShow);
    super.disconnectedCallback();
  }

  private subscribeToController() {
    if (this.listeningController === this.controller) return;
    this.unsubscribeFromController();
    this.listeningController = this.controller;
    this.controller.events.addEventListener(
      'automation-session-requested',
      this.handleSessionEvent
    );
    this.controller.events.addEventListener('automation-session-granted', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-session-denied', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-session-revoked', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-artist-mode-requested', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-artist-mode-granted', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-artist-mode-denied', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-artist-mode-progress', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-artist-mode-escalation-requested', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-artist-mode-escalation-granted', this.handleSessionEvent);
    this.controller.events.addEventListener('automation-artist-mode-escalation-denied', this.handleSessionEvent);
    this.controller.events.addEventListener(
      'automation-session-backgrounded',
      this.handleSessionEvent
    );
  }

  private unsubscribeFromController() {
    const controller = this.listeningController;
    if (!controller) return;
    controller.events.removeEventListener('automation-session-requested', this.handleSessionEvent);
    controller.events.removeEventListener('automation-session-granted', this.handleSessionEvent);
    controller.events.removeEventListener('automation-session-denied', this.handleSessionEvent);
    controller.events.removeEventListener('automation-session-revoked', this.handleSessionEvent);
    controller.events.removeEventListener('automation-artist-mode-requested', this.handleSessionEvent);
    controller.events.removeEventListener('automation-artist-mode-granted', this.handleSessionEvent);
    controller.events.removeEventListener('automation-artist-mode-denied', this.handleSessionEvent);
    controller.events.removeEventListener('automation-artist-mode-progress', this.handleSessionEvent);
    controller.events.removeEventListener('automation-artist-mode-escalation-requested', this.handleSessionEvent);
    controller.events.removeEventListener('automation-artist-mode-escalation-granted', this.handleSessionEvent);
    controller.events.removeEventListener('automation-artist-mode-escalation-denied', this.handleSessionEvent);
    controller.events.removeEventListener(
      'automation-session-backgrounded',
      this.handleSessionEvent
    );
    this.listeningController = null;
  }

  private handleShow = () => {
    this.refreshState(true);
    if (!this.pending && this.sessions.length === 0) {
      if (!this.pendingArtistMode && !this.pendingEscalation && this.artistRuns.length === 0) {
        this.errorMessage = 'There is no pending request or active local session.';
      }
    } else {
      this.errorMessage = '';
    }
  };

  private handleSessionEvent = (event: Event) => {
    const opensDialog =
      event.type === 'automation-session-requested' ||
      event.type === 'automation-session-granted' ||
      event.type === 'automation-artist-mode-requested' ||
      event.type === 'automation-artist-mode-escalation-requested';
    this.refreshState(opensDialog);
  };

  // fallow-ignore-next-line complexity -- One dialog surface prioritizes each pending local approval state.
  private refreshState(openIfAvailable = false) {
    const next = this.controller.listPendingRequests()[0] ?? null;
    const nextArtistMode = this.controller.listPendingArtistModeRequests()[0] ?? null;
    const nextEscalation = this.controller.listPendingArtistModeEscalations()[0] ?? null;
    this.sessions = this.controller.listLocalSessions();
    this.artistRuns = this.controller.listLocalArtistModeRuns();
    if (next) {
      this.showPending(next, openIfAvailable);
      return;
    }
    if (nextArtistMode) {
      this.showArtistModePending(nextArtistMode, openIfAvailable);
      return;
    }
    if (nextEscalation) {
      this.showEscalationPending(nextEscalation, openIfAvailable);
      return;
    }
    if (!next && !nextArtistMode && !nextEscalation) {
      this.clearPendingState(openIfAvailable);
    }
  }

  private clearPendingState(openIfAvailable: boolean) {
    this.pending = null;
    this.pendingArtistMode = null;
    this.pendingEscalation = null;
    this.targets = [];
    this.artistTarget = null;
    this.selectedTargetId = '';
    this.selectedClasses = [];
    this.selectedArtistCategories = [];
    this.selectedTransactionLimit = 1;
    if (this.sessions.length === 0 && this.artistRuns.length === 0) this.open = false;
    if (openIfAvailable && (this.sessions.length > 0 || this.artistRuns.length > 0)) this.open = true;
  }

  private showPending(next: AutomationSessionRequestStatus, openIfAvailable: boolean) {
    const changedRequest = this.pending?.requestId !== next.requestId;
    this.pending = next;
    const refreshChoices = changedRequest || openIfAvailable;
    if (refreshChoices) {
      this.targets = this.controller.captureLocalTargets(next.requestId);
      this.selectedTargetId = '';
      this.selectedClasses = [];
      this.errorMessage = '';
    }
    this.open = true;
  }

  private showArtistModePending(next: ArtistModeRequestStatus, openIfAvailable: boolean) {
    const changedRequest = this.pendingArtistMode?.requestId !== next.requestId;
    this.pendingArtistMode = next;
    this.pendingEscalation = null;
    this.pending = null;
    if (changedRequest || openIfAvailable) {
      this.artistTarget = this.controller.captureArtistModeTarget(next.requestId);
      this.selectedArtistCategories = [];
      this.selectedTransactionLimit = Math.min(next.requestedTransactionLimit, ARTIST_MODE_MAX_TRANSACTIONS);
      this.errorMessage = '';
    }
    this.open = true;
  }

  private showEscalationPending(
    next: AutomationArtistModeEscalationRequest,
    openIfAvailable: boolean,
  ) {
    const changedRequest = this.pendingEscalation?.requestId !== next.requestId;
    this.pendingEscalation = next;
    this.pending = null;
    this.pendingArtistMode = null;
    if (changedRequest || openIfAvailable) this.errorMessage = '';
    this.open = true;
  }

  private handleTargetChange(event: Event) {
    this.selectedTargetId = (event.target as HTMLSelectElement).value;
    this.errorMessage = '';
  }

  private handleClassChange(observationClass: InspectObservationClass, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedClasses = checked
      ? [...this.selectedClasses, observationClass]
      : this.selectedClasses.filter((item) => item !== observationClass);
    this.errorMessage = '';
  }

  private handleArtistCategoryChange(category: ArtistModeCategory, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedArtistCategories = checked
      ? [...this.selectedArtistCategories, category]
      : this.selectedArtistCategories.filter((item) => item !== category);
    this.errorMessage = '';
  }

  private handleTransactionLimitChange(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    this.selectedTransactionLimit = Number.isSafeInteger(value) ? value : 0;
    this.errorMessage = '';
  }

  private handleClose = () => {
    const requestId = this.pending?.requestId;
    if (requestId) this.controller.denyRequest(requestId);
    const artistRequestId = this.pendingArtistMode?.requestId;
    if (artistRequestId) this.controller.denyArtistMode(artistRequestId);
    const escalationRequestId = this.pendingEscalation?.requestId;
    if (escalationRequestId) this.controller.denyArtistModeEscalation(escalationRequestId);
    this.pending = null;
    this.open = false;
    this.errorMessage = '';
    this.refreshPendingSoon();
  };

  private approve = () => {
    const pending = this.pending;
    if (!pending || !this.selectedTargetId || this.selectedClasses.length === 0) return;

    const result = this.controller.approveRequest(
      pending.requestId,
      this.selectedTargetId,
      pending.observationClasses.filter((item) => this.selectedClasses.includes(item))
    );
    if (!result.ok) {
      this.errorMessage =
        'The access request could not be approved. Review the local choices and try again.';
      this.targets = this.controller.captureLocalTargets(pending.requestId);
      this.selectedTargetId = '';
      return;
    }

    this.pending = null;
    this.sessions = this.controller.listLocalSessions();
    this.open = true;
    this.errorMessage = '';
    this.refreshPendingSoon();
  };

  private approveArtistMode = () => {
    const pending = this.pendingArtistMode;
    if (!pending || this.selectedArtistCategories.length === 0) return;
    const result = this.controller.approveArtistMode(
      pending.requestId,
      this.selectedArtistCategories,
      this.selectedTransactionLimit,
    );
    if (!result.ok) {
      this.errorMessage = 'The Artist Mode grant could not be approved. Review the local choices and try again.';
      return;
    }
    this.pendingArtistMode = null;
    this.pendingEscalation = null;
    this.artistTarget = null;
    this.artistRuns = this.controller.listLocalArtistModeRuns();
    this.open = true;
    this.errorMessage = '';
    this.refreshPendingSoon();
  };

  private revokeSession = (sessionId: string) => {
    const result = this.controller.revokeSession(sessionId);
    if (!result.ok) {
      this.errorMessage = 'The local session could not be revoked.';
      return;
    }
    this.errorMessage = '';
    this.sessions = this.controller.listLocalSessions();
  };

  private pauseArtistRun = (run: AutomationLocalArtistModeRun) => {
    this.controller.pauseArtistMode(run.sessionId, run.runId);
    this.artistRuns = this.controller.listLocalArtistModeRuns();
  };

  private resumeArtistRun = (run: AutomationLocalArtistModeRun) => {
    this.controller.resumeArtistMode(run.sessionId, run.runId);
    this.artistRuns = this.controller.listLocalArtistModeRuns();
  };

  private completeArtistRun = (run: AutomationLocalArtistModeRun) => {
    this.controller.completeArtistMode(run.sessionId, run.runId);
    this.artistRuns = this.controller.listLocalArtistModeRuns();
  };

  private rejectArtistRun = (run: AutomationLocalArtistModeRun) => {
    this.controller.rejectArtistMode(run.sessionId, run.runId);
    this.artistRuns = this.controller.listLocalArtistModeRuns();
  };

  private approveEscalation = () => {
    const pending = this.pendingEscalation;
    if (!pending) return;
    const result = this.controller.approveArtistModeEscalation(pending.requestId);
    if (!result.ok) {
      this.errorMessage = 'The additional transaction request could not be approved.';
      return;
    }
    this.pendingEscalation = null;
    this.artistRuns = this.controller.listLocalArtistModeRuns();
    this.errorMessage = '';
    this.refreshPendingSoon();
  };

  private denyEscalation = () => {
    const pending = this.pendingEscalation;
    if (!pending) return;
    const result = this.controller.denyArtistModeEscalation(pending.requestId);
    if (!result.ok) {
      this.errorMessage = 'The additional transaction request could not be denied.';
      return;
    }
    this.pendingEscalation = null;
    this.artistRuns = this.controller.listLocalArtistModeRuns();
    this.errorMessage = '';
    this.refreshPendingSoon();
  };

  private refreshPendingSoon() {
    queueMicrotask(() => {
      if (this.isConnected) this.refreshState(false);
    });
  }

  private renderPending(pending: AutomationSessionRequestStatus) {
    return html`
      <p class="intro">
        <strong>${pending.client.name}</strong> is requesting a temporary, inspect-only session.
        This identity is self-declared and has not been verified.
      </p>

      <div class="section">
        <div class="section-title">Local target</div>
        <label for="automation-session-target">Choose one project for this session</label>
        <select
          id="automation-session-target"
          .value=${this.selectedTargetId}
          @change=${this.handleTargetChange}
        >
          <option value="">Choose a project…</option>
          ${this.targets.map((target) => html` <option value=${target.id}>${target.name}</option> `)}
        </select>
        ${
          this.targets.length === 0
            ? html`<p class="hint">No open local project is available.</p>`
            : nothing
        }
      </div>

      <div class="section">
        <div class="section-title">Requested observations</div>
        <p class="hint">
          Select the specific observations to share. Nothing is selected automatically. Intended
          lifetime: ${pending.lifetimeSeconds} seconds.
        </p>
        <div class="choices">
          ${pending.observationClasses.map((observationClass) => {
            const inputId = `automation-session-class-${observationClass}`;
            return html`
              <label class="check-label" for=${inputId}>
                <input
                  id=${inputId}
                  type="checkbox"
                  .checked=${this.selectedClasses.includes(observationClass)}
                  @change=${(event: Event) => this.handleClassChange(observationClass, event)}
                />
                <span>${OBSERVATION_LABELS[observationClass]}</span>
              </label>
            `;
          })}
        </div>
      </div>
    `;
  }

  private renderArtistModePending(pending: ArtistModeRequestStatus) {
    const target = this.artistTarget;
    return html`
      <p class="intro">
        <strong>${pending.client.name}</strong> is requesting one bounded Artist Mode run.
        This identity is self-declared and has not been verified.
      </p>

      <div class="section">
        <div class="section-title">Exact local project</div>
        <p class="hint">
          ${target ? html`<strong>${target.name}</strong>` : 'The selected local project is no longer available.'}
        </p>
        ${pending.runIntent ? html`<p class="hint">Run intent: ${pending.runIntent}</p>` : nothing}
      </div>

      <div class="section">
        <div class="section-title">Requested write authority</div>
        <p class="hint">
          Choose a subset. Nothing is selected automatically. Requested duration:
          ${pending.requestedDurationSeconds} seconds. Remaining session duration:
          ${pending.remainingSessionSeconds} seconds.
        </p>
        <div class="choices">
          ${pending.requestedWriteCategories.map((category) => {
            const inputId = `automation-artist-category-${category}`;
            return html`
              <label class="check-label" for=${inputId}>
                <input
                  id=${inputId}
                  type="checkbox"
                  .checked=${this.selectedArtistCategories.includes(category)}
                  @change=${(event: Event) => this.handleArtistCategoryChange(category, event)}
                />
                <span>${ARTIST_CATEGORY_LABELS[category]}</span>
              </label>
            `;
          })}
        </div>
      </div>

      <div class="section">
        <label for="automation-artist-transaction-limit">Committed transaction limit</label>
        <input
          id="automation-artist-transaction-limit"
          type="number"
          min="1"
          max=${ARTIST_MODE_MAX_TRANSACTIONS}
          .value=${String(this.selectedTransactionLimit)}
          @input=${this.handleTransactionLimitChange}
        />
        <p class="hint">
          Maximum Preview ceiling: ${ARTIST_MODE_MAX_TRANSACTIONS} transactions; maximum 2 child
          commands per transaction.
        </p>
      </div>

      <div class="section">
        <div class="section-title">Always excluded</div>
        <ul class="exclusions">
          <li>Delete, overwrite, or change another project</li>
          <li>Import, upload, download, share, or publish</li>
          <li>Clipboard, account, secret, settings, network, or repository actions</li>
          <li>Arbitrary commands, scripts, and old-history manipulation</li>
        </ul>
      </div>
    `;
  }

  private renderEscalationPending(pending: AutomationArtistModeEscalationRequest) {
    const run = this.artistRuns.find((candidate) => candidate.runId === pending.runId);
    return html`
      <p class="intro">
        <strong>${run?.client.name ?? 'Artist Mode'}</strong> is requesting a bounded budget
        escalation for one concrete action. No category or operation authority changes.
      </p>

      <div class="section">
        <div class="section-title">Exact local project</div>
        <p class="hint">
          ${run ? html`<strong>${run.targetName}</strong>` : 'The local project is no longer available.'}
        </p>
      </div>

      <div class="section">
        <div class="section-title">Blocked action</div>
        <p class="hint">${pending.blockedAction}</p>
        <p class="hint">Blocked proposal: ${pending.blockedOperationId}</p>
        <p class="hint">
          Add ${pending.additionalTransactions} transaction
          ${pending.additionalTransactions === 1 ? 'unit' : 'units'}; the Preview ceiling remains
          ${ARTIST_MODE_MAX_TRANSACTIONS}.
        </p>
      </div>
    `;
  }

  private renderSessions() {
    if (this.sessions.length === 0) return nothing;
    return html`
      <section class="sessions" aria-labelledby="automation-session-list-title">
        <div class="section-title" id="automation-session-list-title">Active local sessions</div>
        <ul class="session-list">
          ${this.sessions.map(
            (session) => html`
              <li class="session" data-session-id=${session.sessionId}>
                <div class="session-line">
                  <strong>${session.client.name}</strong> · ${session.targetName}
                </div>
                <div class="session-line">
                  Granted:
                  ${session.observationClasses
                    .map((observationClass) => OBSERVATION_LABELS[observationClass])
                    .join(', ')}
                </div>
                <div class="session-line">
                  Status: ${session.status} · Expires: ${session.expiresAt}
                </div>
                <button
                  class="secondary revoke"
                  type="button"
                  aria-label="Revoke ${session.client.name} session"
                  ?disabled=${session.status !== 'active'}
                  @click=${() => this.revokeSession(session.sessionId)}
                >
                  Revoke
                </button>
              </li>
            `
          )}
        </ul>
      </section>
    `;
  }

  private renderArtistRuns() {
    if (this.artistRuns.length === 0) return nothing;
    return html`
      <section class="artist-runs" aria-labelledby="automation-artist-run-list-title">
        <div class="section-title" id="automation-artist-run-list-title">Artist Mode runs</div>
        <ul class="session-list">
          ${this.artistRuns.map(
            (run) => html`
              <li class="session" data-run-id=${run.runId}>
                <div class="session-line"><strong>${run.client.name}</strong> · ${run.targetName}</div>
                <div class="session-line">Write turn: ${run.status === 'running' ? 'held' : 'released'}</div>
                <div class="session-line">
                  Budget: ${run.transactionsUsed}/${run.transactionLimit} committed · ${run.remainingTransactions} remaining
                </div>
                <div class="session-line">Status: ${run.status}</div>
                <div class="artist-run-actions">
                  ${run.status === 'running'
                    ? html`<button class="secondary" type="button" @click=${() => this.pauseArtistRun(run)}>Pause</button>`
                    : run.status === 'paused'
                      ? html`<button class="secondary" type="button" @click=${() => this.resumeArtistRun(run)}>Resume</button>`
                      : nothing}
                  ${run.status === 'running' || run.status === 'paused'
                    ? html`
                        <button class="secondary" type="button" @click=${() => this.completeArtistRun(run)}>Complete run</button>
                        <button class="secondary" type="button" @click=${() => this.rejectArtistRun(run)}>Reject result</button>
                      `
                    : nothing}
                  <button
                    class="secondary revoke"
                    type="button"
                    aria-label="Revoke ${run.client.name} Artist Mode run"
                    @click=${() => this.revokeSession(run.sessionId)}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            `
          )}
        </ul>
      </section>
    `;
  }

  private renderActions(pending: AutomationSessionRequestStatus | null) {
    if (this.pendingArtistMode) {
      const canApprove = Boolean(this.artistTarget && this.selectedArtistCategories.length > 0
        && this.selectedTransactionLimit >= 1
        && this.selectedTransactionLimit <= this.pendingArtistMode.requestedTransactionLimit
        && this.selectedTransactionLimit <= ARTIST_MODE_MAX_TRANSACTIONS);
      return html`
        <button class="secondary" type="button" @click=${this.handleClose}>Deny Artist Mode</button>
        <button class="primary" type="button" ?disabled=${!canApprove} @click=${this.approveArtistMode}>
          Approve Artist Mode
        </button>
      `;
    }
    if (this.pendingEscalation) {
      return html`
        <button class="secondary" type="button" @click=${this.denyEscalation}>Deny escalation</button>
        <button
          class="primary"
          type="button"
          ?disabled=${!this.artistRuns.some((run) => run.runId === this.pendingEscalation?.runId)}
          @click=${this.approveEscalation}
        >
          Approve additional transactions
        </button>
      `;
    }
    if (!pending) {
      return html`<button class="secondary" type="button" @click=${this.handleClose}>
        Close
      </button>`;
    }
    const canApprove = Boolean(this.selectedTargetId && this.selectedClasses.length > 0);
    return html`
      <button class="secondary" type="button" @click=${this.handleClose}>Deny</button>
      <button class="primary" type="button" ?disabled=${!canApprove} @click=${this.approve}>
        Approve selected access
      </button>
    `;
  }

  // fallow-ignore-next-line complexity -- The semantic dialog renders the pending grant and all local lifecycle views together.
  render() {
    const pending = this.pending;
    if (!pending && !this.pendingArtistMode && !this.pendingEscalation && this.sessions.length === 0 && this.artistRuns.length === 0) return nothing;

    return html`
      <pf-dialog ?open=${this.open} width="380px" @pf-close=${this.handleClose}>
        <span slot="title">${this.pendingArtistMode ? 'Allow Artist Mode' : this.pendingEscalation ? 'Approve budget escalation' : pending ? 'Allow Inspect-Only Access' : 'Local Automation Sessions'}</span>
        ${pending ? this.renderPending(pending) : nothing}
        ${this.pendingArtistMode ? this.renderArtistModePending(this.pendingArtistMode) : nothing}
        ${this.pendingEscalation ? this.renderEscalationPending(this.pendingEscalation) : nothing}
        ${this.renderSessions()} ${this.renderArtistRuns()}
        ${this.errorMessage ? html`<p class="error" role="alert">${this.errorMessage}</p>` : nothing}
        <div slot="actions">${this.renderActions(pending)}</div>
      </pf-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-automation-session-dialog': PFAutomationSessionDialog;
  }
}
