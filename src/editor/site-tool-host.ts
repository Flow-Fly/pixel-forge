import { automationSessionController, type AutomationSessionManager, type InspectObservationClass, type ArtistModeCategory } from './automation-session';
import { editorCatalog } from './catalog';
import { CreativeRunController, type CreativeRunStep, type CreativeRunStepContext } from './creative-run';
import { CreativeRunRecoveryCoordinator } from './creative-run-recovery';
import { createProjectRecoveryTarget } from './creative-run-recovery-boundaries';
import { createAutomationAdapter } from './automation-adapter';
import { creativeRunRecoveryPersistence, projectRepository } from '../services/persistence/indexed-db';
import { autoSaveService } from '../services/auto-save';
import { workspaceStore } from '../stores/workspace';
import type { ProjectContext } from '../stores/project-context';
import type { EditorTransactionResult } from './transaction';
import type { AssetPackageResult } from './asset-package';
import { isRecord } from './contracts';
import { recordSiteContent, type SiteContentGrant } from './site-tool-egress';
import { encodeSiteResult, siteBase64, siteDigest } from './site-tool-wire';
import { compatibleSiteVersion, SITE_TOOL_GUIDE, SITE_TOOL_VERSION, SITE_TOOL_PROPOSAL_LIFETIME_MS, SITE_TOOL_RESULT_LIFETIME_MS, siteToolInputSchemas, siteToolResultSchemas, siteFailure, siteSuccess, validateSiteInput, type SiteToolName, type SiteToolResult, type SiteToolErrorCode } from './site-tool-contract';
import { matchesSiteSchema } from './site-tool-schema';

export interface SiteToolFacade {
  invoke(tool: SiteToolName, input: unknown, signal?: AbortSignal): Promise<SiteToolResult>;
}
interface SiteRequest {
  readonly requestId: string;
  readonly secret: string;
  readonly clientName: string;
  readonly purpose: string;
  readonly writeCategories: readonly ArtistModeCategory[];
  readonly transactionLimit: number;
  readonly lifetimeSeconds: number;
  sessionId?: string;
  context?: ProjectContext;
  controller?: CreativeRunController;
  grant?: SiteContentGrant;
  observedRevision?: number;
  waiting?: { readonly context: CreativeRunStepContext; readonly resolve: (step: CreativeRunStep | null) => void };
  pending?: PendingProposal;
  readonly proposals: Map<string, SiteToolResult>;
  readonly results: Map<string, StoredResult>;
}
interface PendingProposal {
  readonly operationId: string;
  readonly expectedRevision: number;
  readonly resolve: (result: SiteToolResult) => void;
  readonly promise: Promise<SiteToolResult>;
  readonly cleanup: () => void;
  dispatched: boolean;
}
interface StoredResult {
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly expiresAt: number;
  readonly revision: number;
  readonly categories: readonly InspectObservationClass[];
}

/** Trusted browser composition. Only `facade` is handed to transports. */
export class SiteToolHost {
  readonly facade: SiteToolFacade;
  private readonly requests = new Map<string, SiteRequest>();
  private disposed = false;
  readonly manager: AutomationSessionManager;
  private readonly showRun: (controller: CreativeRunController) => void;
  constructor(
    manager: AutomationSessionManager = automationSessionController,
    showRun: (controller: CreativeRunController) => void = () => {},
  ) {
    this.manager = manager;
    this.showRun = showRun;
    this.facade = Object.freeze({ invoke: (tool: SiteToolName, input: unknown, signal?: AbortSignal) => this.invoke(tool, input, signal) });
  }

  disclosure(requestId: string): { readonly clientName: string; readonly purpose: string } | null {
    const request = this.requests.get(requestId);
    return request ? { clientName: request.clientName, purpose: request.purpose } : null;
  }

  /** Called only by the local approval dialog after its explicit sharing checkbox. */
  async approve(requestId: string, targetId: string, categories: readonly InspectObservationClass[], mode: 'copy' | 'existing' | 'blank'): Promise<boolean> {
    const request = this.requests.get(requestId);
    if (!request || request.sessionId || this.disposed || document.visibilityState !== 'visible') return false;
    if ([...this.requests.values()].some((other) => other.controller && !['accepted', 'rejected', 'stopped', 'recovery-required'].includes(other.controller.getState().phase))) return false;
    let target = workspaceStore.items.value.find((item) => item.context.project.id.value === targetId)?.context;
    if (!target || target.isDisposed) return false;
    if (mode === 'copy') {
      const revision = target.project.revision.value;
      const snapshot = structuredClone(await target.project.saveProject({ rebuildIndexBuffers: false }));
      if (target.project.revision.value !== revision || target.isDisposed) return false;
      snapshot.name = `Copy of ${snapshot.name}`;
      const created = await workspaceStore.createProjectFromFile(snapshot, { activate: true, saveActiveContext: false });
      if (!created.ok) return false;
      target = created.item.context;
    } else if (mode === 'blank') {
      const created = await workspaceStore.createProject({ name: 'Agent artwork', width: 32, height: 32 }, { activate: true, saveActiveContext: false });
      if (!created.ok) return false;
      target = created.item.context;
    }
    if (this.disposed || document.visibilityState !== 'visible') return false;
    this.manager.captureLocalTargets(requestId);
    const granted = this.manager.approveRequest(requestId, target.project.id.value, categories);
    if (!granted.ok) return false;
    request.sessionId = granted.result.sessionId;
    request.context = target;
    const runId = crypto.randomUUID();
    request.grant = { runId, sessionId: granted.result.sessionId, targetId: target.project.id.value, categories: [...categories], expiresAt: granted.result.expiresAt };
    this.createRun(request, target, runId);
    return true;
  }

  private createRun(request: SiteRequest, target: ProjectContext, runId: string): void {
    const sessionId = request.sessionId!;
    const targetId = target.project.id.value;
    const brief = {
      targetId, targetName: target.project.name.value, goal: request.purpose, constraints: [],
      requestedWriteCategories: request.writeCategories, transactionLimit: request.transactionLimit,
      durationSeconds: request.lifetimeSeconds, contentEgress: 'approved-provider' as const,
    };
    const recovery = new CreativeRunRecoveryCoordinator({
      runId, sessionId, brief: { ...brief, runId, revision: 1 },
      target: createProjectRecoveryTarget(target, projectRepository), persistence: creativeRunRecoveryPersistence,
    });
    const adapter = createAutomationAdapter({ targetRegistry: (value) => value.projectId === targetId ? target : undefined, repository: projectRepository });
    adapter.negotiateCatalog({ version: editorCatalog.version });
    const controller = new CreativeRunController({
      sessionManager: this.manager, sessionId, runId, brief, recovery,
      getCurrentRevision: () => target.project.revision.value,
      stepSource: (context, signal) => this.nextStep(request, context, signal),
      executeTransaction: async (sid, rid, input) => {
        const pending = request.pending;
        if (!pending || !this.isAuthorized(request) || pending.expectedRevision !== target.project.revision.value) {
          return { ok: false, error: { code: 'cancelled', retryable: false } };
        }
        pending.dispatched = true;
        const result = await this.manager.executeArtistModeTransaction(sid, rid, input);
        if (result.ok) {
          const transaction = result.result as EditorTransactionResult;
          this.finishProposal(request, siteSuccess({ type: 'proposal.result', operationId: pending.operationId, outcome: 'committed', revision: transaction.revision }));
          return { ok: true, result: { ...transaction, target: { projectId: targetId }, provenance: { ...transaction.provenance, target: { projectId: targetId } } } };
        }
        this.finishProposal(request, siteSuccess({ type: 'proposal.result', operationId: pending.operationId, outcome: 'failed', code: result.error.code }));
        return result;
      },
      preparePackage: async (input) => {
        await autoSaveService.saveNow(target);
        const result = await adapter.request({ operation: 'project.asset-package.prepare', target: { projectId: targetId }, expectedRevision: input.expectedRevision,
          expectedSaveSafety: autoSaveService.getSaveSafetyObservation(target), expectedPackageDigest: input.expectedPackageDigest });
        if (!result.ok) return result;
        return { ok: true, result: result.result as AssetPackageResult };
      },
      openRecoveryCopy: async (copyId) => { await workspaceStore.openProject(copyId); },
    });
    request.controller = controller;
    controller.events.addEventListener('creative-run-state-changed', () => this.runChanged(request));
    this.manager.requestArtistMode({ sessionId, runId, runIntent: request.purpose, requestedWriteCategories: request.writeCategories,
      requestedTransactionLimit: request.transactionLimit, requestedDurationSeconds: request.lifetimeSeconds });
    this.showRun(controller);
  }

  private nextStep(request: SiteRequest, context: CreativeRunStepContext, signal: AbortSignal): Promise<CreativeRunStep | null> {
    return new Promise((resolve) => {
      const finish = (step: CreativeRunStep | null) => { signal.removeEventListener('abort', abort); request.waiting = undefined; resolve(step); };
      const abort = () => { this.cancelProposal(request); finish(null); };
      request.waiting = { context, resolve: finish };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  private runChanged(request: SiteRequest): void {
    const state = request.controller!.getState();
    if (state.phase !== 'running') request.observedRevision = undefined;
    if (state.phase !== 'running' && !request.pending?.dispatched) this.cancelProposal(request);
    if (['accepted', 'rejected', 'recovery-required'].includes(state.phase)) {
      request.grant = undefined;
      request.results.clear();
    }
  }

  private async invoke(tool: SiteToolName, input: unknown, signal?: AbortSignal): Promise<SiteToolResult> {
    if (!Object.hasOwn(siteToolInputSchemas, tool) || !validateSiteInput(tool, input)) return siteFailure('invalid_request', 'Use the published input schema.');
    if (signal?.aborted) return siteFailure('cancelled', 'Inspect the operation result before retrying.');
    try {
      const result = await this.dispatch(tool, input, signal);
      return matchesSiteSchema(result, siteToolResultSchemas[tool]) ? result : siteFailure('internal', 'Retry after rediscovery.');
    } catch { return siteFailure('internal', 'Review the local run state.'); }
  }

  private async dispatch(tool: SiteToolName, input: Record<string, unknown>, signal?: AbortSignal): Promise<SiteToolResult> {
    if (tool === 'discover') {
      const facade = input.facade as { minVersion: string; maxVersion: string };
      const catalog = input.catalog as { minVersion: string; maxVersion: string };
      if (!compatibleSiteVersion(SITE_TOOL_VERSION, facade.minVersion, facade.maxVersion) || !compatibleSiteVersion(editorCatalog.version, catalog.minVersion, catalog.maxVersion)) return siteFailure('incompatible', 'Rediscover with facade 1.0 and catalogue 1.0.');
      return siteSuccess({ type: 'site.discovery', facadeVersion: SITE_TOOL_VERSION, catalogVersion: editorCatalog.version, tools: Object.keys(siteToolInputSchemas), guide: SITE_TOOL_GUIDE, catalogJson: JSON.stringify(editorCatalog) });
    }
    if (this.disposed) return siteFailure('capability_denied', 'Request a new foreground session.');
    if (tool === 'request') return this.request(input);
    const request = this.requests.get(input.requestId as string);
    if (!request || request.secret !== input.requestSecret) return siteFailure('capability_denied', 'Use your own request credential.');
    if (tool === 'status') return this.status(request);
    if (tool === 'propose' && request.proposals.has(input.operationId as string)) return request.proposals.get(input.operationId as string)!;
    if (!this.isAuthorized(request)) return siteFailure('capability_denied', 'Review local consent or request a new session.');
    if (tool === 'control') return this.control(request, input.action as string);
    if (tool === 'observe') return this.observe(request, input, signal);
    if (tool === 'propose') return this.propose(request, input, signal);
    return this.retrieve(request, input, signal);
  }

  private request(input: Record<string, unknown>): SiteToolResult {
    if (input.facadeVersion !== SITE_TOOL_VERSION || input.catalogVersion !== editorCatalog.version) return siteFailure('incompatible', 'Rediscover supported versions.');
    if (this.requests.size >= 16) return siteFailure('limit_exceeded', 'Close this page before starting more sessions.');
    const result = this.manager.requestSession({ client: { name: input.clientName, identity: 'self-declared' }, compatibility: { minVersion: editorCatalog.version, maxVersion: editorCatalog.version }, observationClasses: input.observationClasses, lifetimeSeconds: input.lifetimeSeconds });
    if (!result.ok) return this.failure(result.error.code);
    const request: SiteRequest = { requestId: result.result.requestId, secret: crypto.randomUUID(), clientName: input.clientName as string, purpose: input.purpose as string,
      writeCategories: input.writeCategories as ArtistModeCategory[], transactionLimit: input.transactionLimit as number, lifetimeSeconds: input.lifetimeSeconds as number,
      proposals: new Map(), results: new Map() };
    this.requests.set(request.requestId, request);
    return siteSuccess({ type: 'session.requested', requestId: request.requestId, requestSecret: request.secret, status: 'pending' });
  }

  private status(request: SiteRequest): SiteToolResult {
    if (!request.sessionId) {
      const pending = this.manager.listPendingRequests().some((item) => item.requestId === request.requestId);
      return siteSuccess({ type: 'session.status', status: pending ? 'pending' : 'denied' });
    }
    const session = this.manager.listLocalSessions().find((item) => item.sessionId === request.sessionId);
    const status = session?.status ?? 'revoked';
    return siteSuccess({ type: 'session.status', status, sessionId: request.sessionId, phase: request.controller!.getState().phase });
  }

  private isAuthorized(request: SiteRequest, categories: readonly InspectObservationClass[] = []): boolean {
    if (this.disposed || document.visibilityState !== 'visible' || !request.grant || !request.context || request.context.isDisposed) return false;
    const grant = request.grant;
    const session = this.manager.listLocalSessions().find((item) => item.sessionId === grant.sessionId);
    const run = this.manager.listLocalArtistModeRuns().find((item) => item.runId === grant.runId);
    if (run && ['completed', 'rejected', 'revoked', 'expired', 'backgrounded'].includes(run.status)) return false;
    return session?.status === 'active' && Date.now() < grant.expiresAt && request.context.project.id.value === grant.targetId
      && categories.every((category) => grant.categories.includes(category))
      && !['accepted', 'rejected', 'recovery-required'].includes(request.controller!.getState().phase);
  }

  private async observe(request: SiteRequest, input: Record<string, unknown>, signal?: AbortSignal): Promise<SiteToolResult> {
    const category = input.observationClass as InspectObservationClass;
    if (!this.isAuthorized(request, [category])) return siteFailure('capability_denied', 'Ask the creator to approve this sharing category.');
    const { requestId: _id, requestSecret: _secret, observationClass: _category, ...payload } = input;
    const result = await this.manager.observe(request.sessionId!, category, payload);
    if (!result.ok) return this.failure(result.error.code);
    if (signal?.aborted) return siteFailure('cancelled', 'Observe again when ready.');
    const revision = request.context!.project.revision.value;
    if (isRecord(result.result) && result.result.revision !== undefined && result.result.revision !== revision) return siteFailure('revision_conflict', 'Observe the current revision.');
    request.observedRevision = revision;
    return this.storeResult(request, result.result, [category], revision, signal);
  }

  private propose(request: SiteRequest, input: Record<string, unknown>, signal?: AbortSignal): Promise<SiteToolResult> | SiteToolResult {
    const operationId = input.operationId as string;
    if (request.pending?.operationId === operationId) return request.pending.promise;
    if (request.pending || !request.waiting || request.controller!.getState().phase !== 'running') return siteFailure('invalid_state', 'Wait for the creator to start or resume the run.', true);
    const expectedRevision = input.expectedRevision as number;
    if (request.observedRevision !== expectedRevision || request.waiting.context.revision !== expectedRevision || request.context!.project.revision.value !== expectedRevision) return siteFailure('revision_conflict', 'Observe the current revision before proposing.', true);
    if (request.proposals.size >= 100) return siteFailure('limit_exceeded', 'Review the run budget.');
    let resolve!: (result: SiteToolResult) => void;
    const promise = new Promise<SiteToolResult>((done) => { resolve = done; });
    const abort = () => { request.controller!.pause(); this.cancelProposal(request); };
    const timer = window.setTimeout(abort, SITE_TOOL_PROPOSAL_LIFETIME_MS);
    request.pending = { operationId, expectedRevision, resolve, promise, dispatched: false, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else request.waiting.resolve(structuredClone(input.transaction) as unknown as CreativeRunStep);
    return promise;
  }

  private finishProposal(request: SiteRequest, result: SiteToolResult): void {
    const pending = request.pending;
    if (!pending) return;
    pending.cleanup();
    request.proposals.set(pending.operationId, result);
    request.pending = undefined;
    pending.resolve(result);
  }

  private cancelProposal(request: SiteRequest): void {
    if (request.pending && !request.pending.dispatched) this.finishProposal(request, siteSuccess({ type: 'proposal.result', operationId: request.pending.operationId, outcome: 'cancelled' }));
  }

  private async control(request: SiteRequest, action: string): Promise<SiteToolResult> {
    if (action === 'prepare-package') {
      const categories: InspectObservationClass[] = ['structure', 'palette', 'timeline', 'raster', 'render', 'save-state'];
      if (!this.isAuthorized(request, categories)) return siteFailure('capability_denied', 'Package sharing requires all content categories.');
      const prepared = await request.controller!.preparePackageForReview();
      if (!prepared.ok) return this.failure(prepared.error.code);
      return this.storeResult(request, prepared.result, categories, request.context!.project.revision.value);
    }
    if (action === 'revoke') { this.manager.revokeSession(request.sessionId!); request.grant = undefined; request.results.clear(); request.controller!.stop(); }
    else if (action === 'pause') request.controller!.pause();
    else request.controller!.stop();
    this.cancelProposal(request);
    return siteSuccess({ type: 'run.controlled', action, phase: request.controller!.getState().phase });
  }

  private async storeResult(request: SiteRequest, value: unknown, categories: readonly InspectObservationClass[], revision: number, signal?: AbortSignal): Promise<SiteToolResult> {
    const bytes = await encodeSiteResult(value);
    const digest = await siteDigest(bytes);
    if (signal?.aborted) return siteFailure('cancelled', 'Request the result again.');
    if (!this.isAuthorized(request, categories)) return siteFailure('capability_denied', 'Sharing consent ended.');
    for (const [key, result] of request.results) if (result.expiresAt <= Date.now()) request.results.delete(key);
    if (request.results.size >= 16 || [...request.results.values()].reduce((total, result) => total + result.bytes.byteLength, bytes.byteLength) > 64 * 1024 * 1024) return siteFailure('limit_exceeded', 'Wait for prior result handles to expire.');
    const handle = crypto.randomUUID();
    const expiresAt = Math.min(Date.now() + SITE_TOOL_RESULT_LIFETIME_MS, request.grant!.expiresAt);
    request.results.set(handle, { bytes, digest, expiresAt, revision, categories });
    return siteSuccess({ type: 'result.handle', handle, byteLength: bytes.byteLength, digest, expiresAt, encoding: 'pf-json/1', untrusted: true });
  }

  private async retrieve(request: SiteRequest, input: Record<string, unknown>, signal?: AbortSignal): Promise<SiteToolResult> {
    const stored = request.results.get(input.handle as string);
    if (!stored || stored.expiresAt <= Date.now()) return siteFailure('capability_denied', 'Observe again to obtain a fresh handle.');
    const offset = input.offset as number;
    if (offset > stored.bytes.byteLength) return siteFailure('invalid_request', 'Use an offset inside the result.');
    const bytes = stored.bytes.slice(offset, offset + (input.maxBytes as number));
    const chunkDigest = await siteDigest(bytes);
    if (signal?.aborted) return siteFailure('cancelled', 'Request the chunk again.');
    if (!this.isAuthorized(request, stored.categories) || stored.expiresAt <= Date.now()) return siteFailure('capability_denied', 'Sharing consent ended.');
    recordSiteContent({ version: 1, categories: stored.categories, revision: stored.revision, timestamp: Date.now(), byteLength: bytes.byteLength, digest: chunkDigest });
    return siteSuccess({ type: 'result.chunk', handle: input.handle, offset, byteLength: bytes.byteLength, totalBytes: stored.bytes.byteLength, digest: stored.digest, chunkDigest, encoding: 'base64', data: siteBase64(bytes), untrusted: true });
  }

  private failure(code: string): SiteToolResult {
    const allowed = ['invalid_request', 'capability_denied', 'revision_conflict', 'cancelled', 'limit_exceeded', 'invalid_state', 'unsupported'];
    return siteFailure(allowed.includes(code) ? code as SiteToolErrorCode : 'internal', 'Review the local run state and published guide.');
  }

  endAuthority(): void {
    for (const request of this.requests.values()) {
      if (request.sessionId) this.manager.revokeSession(request.sessionId);
      request.grant = undefined;
      request.results.clear();
      request.controller?.dispose();
      this.cancelProposal(request);
    }
  }
  dispose(): void { this.endAuthority(); this.disposed = true; }
}
