import { css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import {
  automationSessionController,
  type AutomationLocalTargetOption,
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
  @state() private targets: readonly AutomationLocalTargetOption[] = [];
  @state() private sessions: readonly AutomationLocalSession[] = [];
  @state() private selectedTargetId = '';
  @state() private selectedClasses: readonly InspectObservationClass[] = [];
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
    controller.events.removeEventListener(
      'automation-session-backgrounded',
      this.handleSessionEvent
    );
    this.listeningController = null;
  }

  private handleShow = () => {
    this.refreshState(true);
    if (!this.pending && this.sessions.length === 0) {
      this.errorMessage = 'There is no pending request or active local session.';
    } else {
      this.errorMessage = '';
    }
  };

  private handleSessionEvent = (event: Event) => {
    const opensDialog =
      event.type === 'automation-session-requested' || event.type === 'automation-session-granted';
    this.refreshState(opensDialog);
  };

  private refreshState(openIfAvailable = false) {
    const next = this.controller.listPendingRequests()[0] ?? null;
    this.sessions = this.controller.listLocalSessions();
    if (!next) {
      this.clearPendingState(openIfAvailable);
      return;
    }

    this.showPending(next, openIfAvailable);
  }

  private clearPendingState(openIfAvailable: boolean) {
    this.pending = null;
    this.targets = [];
    this.selectedTargetId = '';
    this.selectedClasses = [];
    if (this.sessions.length === 0) this.open = false;
    if (openIfAvailable && this.sessions.length > 0) this.open = true;
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

  private handleClose = () => {
    const requestId = this.pending?.requestId;
    if (requestId) this.controller.denyRequest(requestId);
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

  private revokeSession = (sessionId: string) => {
    const result = this.controller.revokeSession(sessionId);
    if (!result.ok) {
      this.errorMessage = 'The local session could not be revoked.';
      return;
    }
    this.errorMessage = '';
    this.sessions = this.controller.listLocalSessions();
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

  private renderActions(pending: AutomationSessionRequestStatus | null) {
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

  render() {
    const pending = this.pending;
    if (!pending && this.sessions.length === 0) return nothing;

    return html`
      <pf-dialog ?open=${this.open} width="380px" @pf-close=${this.handleClose}>
        <span slot="title">${pending ? 'Allow Inspect-Only Access' : 'Inspect-Only Sessions'}</span>
        ${pending ? this.renderPending(pending) : nothing} ${this.renderSessions()}
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
