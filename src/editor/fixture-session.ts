import {
  ProjectAlreadyExistsError,
  type ProjectRepository,
  type ProjectMeta,
  type WorkspaceState,
} from '../services/persistence/project-repository';
import { AutoSaveService, createAutoSaveService } from '../services/auto-save';
import {
  createProjectContext,
  defaultProjectContext,
  getActiveProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../stores/project-context';
import { decodeProjectFile, PROJECT_VERSION, type ProjectFile, type ProjectFileInput } from '../types/project';
import pako from 'pako';
import {
  AutomationAdapter,
  createAutomationAdapter,
  type AutomationFailure,
  type CatalogNegotiation,
  type CanvasResizeExecutionResult,
  type CanvasResizePreviewResult,
  type HistoryTransitionResult,
  type ProjectCreateResult,
  type ReloadResult,
  type SaveResult,
} from './automation-adapter';
import type { AssetPackageArtifact, AssetPackageResult } from './asset-package';
import { renderProject } from './observations';
import type { ProjectObservation, RenderObservation } from './observations';
import type { EditorTransactionResult } from './transaction';
import type { RasterObservation } from './symbol-grid';
import type { Cel, Frame } from '../types/animation';
import type { Layer } from '../types/layer';
import {
  reconstructAnimationGrids,
  type AnimationEvaluationBundle,
} from './animation-observation';
import { sameBytes } from './structure-support';

// fallow-ignore-next-line unused-export -- Stable fixture identity is part of conformance setup.
export const FIXTURE_PROJECT_ID = 'fixture-project';

/** Minimal deterministic repository used by Fixture Session tests. */
export class FixtureProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectFileInput>();
  private lastOpenedProjectId: string | null = null;
  private workspaceState: WorkspaceState | null = null;

  async list(): Promise<ProjectMeta[]> {
    return [...this.projects.entries()].map(([id, project]) => ({
      id,
      name: project.name ?? 'Untitled',
      width: project.width,
      height: project.height,
      lastModified: 0,
    }));
  }

  async load(id: string): Promise<ProjectFileInput | null> {
    const project = this.projects.get(id);
    return project ? cloneProject(project) : null;
  }

  async save(id: string, project: ProjectFile): Promise<void> {
    this.projects.set(id, cloneProject(project));
  }

  async create(id: string, project: ProjectFile): Promise<void> {
    if (this.projects.has(id)) throw new ProjectAlreadyExistsError(id);
    this.projects.set(id, cloneProject(project));
  }

  async delete(id: string): Promise<void> {
    this.projects.delete(id);
  }

  async getLastOpenedProjectId(): Promise<string | null> {
    return this.lastOpenedProjectId;
  }

  async setLastOpenedProjectId(id: string): Promise<void> {
    this.lastOpenedProjectId = id;
  }

  async getWorkspaceState(): Promise<WorkspaceState | null> {
    return this.workspaceState ? structuredClone(this.workspaceState) : null;
  }

  async setWorkspaceState(state: WorkspaceState): Promise<void> {
    this.workspaceState = structuredClone(state);
  }
}

export interface FixtureSessionOptions {
  readonly context?: ProjectContext;
  readonly repository?: ProjectRepository;
  readonly saveService?: AutoSaveService;
  readonly projectId?: string;
  readonly projectIdFactory?: () => string;
  readonly entityIdFactory?: () => string;
}

export interface FixtureBlankProjectResult {
  readonly creation: ProjectCreateResult;
  readonly observation: ProjectObservation;
}

export interface FixtureAssetPackageJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly save: SaveResult;
  readonly assetPackage: AssetPackageResult;
  readonly replay: AssetPackageResult;
  readonly persistedDocument: ProjectFile;
  readonly roundTrip: {
    readonly document: ProjectFile;
    readonly renderPixels: Uint8Array;
  };
  readonly reloaded: {
    readonly document: ProjectFile;
    readonly renderPixels: Uint8Array;
  };
  readonly exact: {
    readonly staticArtifacts: boolean;
    readonly manifest: boolean;
    readonly deterministic: boolean;
    readonly digests: boolean;
    readonly source: boolean;
    readonly render: boolean;
    readonly persistedSource: boolean;
    readonly reload: boolean;
    readonly reloadedRender: boolean;
    readonly isolation: boolean;
    readonly targetRebound: boolean;
    readonly activeTab: boolean;
    readonly target: boolean;
    readonly bytes: boolean;
  };
}

export interface FixtureAssetPackageJourneyOptions {
  readonly afterPackagePreparation?: (
    assetPackage: AssetPackageResult,
    request: Record<string, unknown>,
  ) => void | Promise<void>;
  readonly switchActiveTabDuringPreparation?: boolean;
}

interface PreparedAssetPackageJourney {
  readonly negotiation: CatalogNegotiation;
  readonly save: SaveResult;
  readonly packageRequest: Record<string, unknown>;
  readonly persistedDocument: ProjectFile;
  readonly inactiveContext: ProjectContext;
  readonly inactiveBefore: ProjectFile;
  readonly assetPackage: AssetPackageResult;
  readonly replay: AssetPackageResult;
  readonly activeTabSwitched: boolean;
}

interface AssetPackageSourceRoundTrip {
  readonly project: ProjectFile;
  readonly document: ProjectFile;
  readonly renders: readonly Uint8Array[];
}

interface AssetPackagePreparationCheckpoint {
  readonly assetPackage: AssetPackageResult;
  readonly activeTabSwitched: boolean;
}

export interface FixtureAnimatedAssetPackageJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly save: SaveResult;
  readonly assetPackage: AssetPackageResult;
  readonly replay: AssetPackageResult;
  readonly persistedDocument: ProjectFile;
  readonly sourceRoundTrip: {
    readonly document: ProjectFile;
    readonly renders: readonly Uint8Array[];
  };
  readonly reloaded: {
    readonly document: ProjectFile;
    readonly renders: readonly Uint8Array[];
  };
  readonly canonicalRenders: readonly Uint8Array[];
  readonly exact: {
    readonly sprite: boolean;
    readonly cells: boolean;
    readonly timing: boolean;
    readonly deterministic: boolean;
    readonly digests: boolean;
    readonly referenceExcluded: boolean;
    readonly persistedSource: boolean;
    readonly reload: boolean;
    readonly reloadedRender: boolean;
    readonly isolation: boolean;
    readonly targetRebound: boolean;
    readonly activeTab: boolean;
    readonly target: boolean;
    readonly bytes: boolean;
  };
}

interface FixtureDocumentState {
  readonly observation: ProjectObservation;
  readonly render: RenderObservation;
  readonly document: ProjectFile;
}

export interface FixtureJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly initial: {
    readonly observation: ProjectObservation;
    readonly render: RenderObservation;
  };
  readonly resize: {
    readonly preview: CanvasResizePreviewResult;
    readonly execution: CanvasResizeExecutionResult;
  };
  readonly afterResize: {
    readonly observation: ProjectObservation;
    readonly render: RenderObservation;
  };
  readonly afterUndo: {
    readonly transition: HistoryTransitionResult;
    readonly observation: ProjectObservation;
    readonly render: RenderObservation;
  };
  readonly afterRedo: {
    readonly transition: HistoryTransitionResult;
    readonly observation: ProjectObservation;
    readonly render: RenderObservation;
  };
  readonly save: SaveResult;
  readonly reload: ReloadResult;
  readonly exact: {
    readonly document: boolean;
    readonly render: boolean;
  };
}

export interface FixtureTransactionJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly initial: FixtureDocumentState;
  readonly transaction: EditorTransactionResult;
  readonly afterTransaction: FixtureDocumentState;
  readonly afterUndo: FixtureDocumentState & { readonly transition: HistoryTransitionResult };
  readonly afterRedo: FixtureDocumentState & { readonly transition: HistoryTransitionResult };
  readonly save: SaveResult;
  readonly reload: ReloadResult;
  readonly exact: {
    readonly document: boolean;
    readonly render: boolean;
  };
}

export interface FixtureRasterPatchJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly initial: FixtureRasterPatchState;
  readonly transaction: EditorTransactionResult;
  readonly afterTransaction: FixtureRasterPatchState;
  readonly afterUndo: FixtureRasterPatchState & { readonly transition: HistoryTransitionResult };
  readonly afterRedo: FixtureRasterPatchState & { readonly transition: HistoryTransitionResult };
  readonly save: SaveResult;
  readonly reopened: {
    readonly save: SaveResult;
    readonly reload: ReloadResult;
    readonly state: FixtureRasterPatchState;
  };
  readonly exact: {
    readonly document: boolean;
    readonly render: boolean;
    readonly digest: boolean;
    readonly source: boolean;
  };
}

export interface FixtureRasterPatchState {
  readonly layerObservation: RasterObservation;
  readonly compositeObservation: RasterObservation;
  readonly render: RenderObservation;
  readonly document: ProjectFile;
}

export interface FixtureStaticStructureJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly creation: FixtureBlankProjectResult;
  readonly initial: FixtureDocumentState;
  readonly transaction: EditorTransactionResult;
  readonly afterTransaction: FixtureDocumentState;
  readonly afterUndo: FixtureDocumentState & { readonly transition: HistoryTransitionResult };
  readonly afterRedo: FixtureDocumentState & { readonly transition: HistoryTransitionResult };
  readonly save: SaveResult;
  readonly reopened: {
    readonly save: SaveResult;
    readonly reload: ReloadResult;
    readonly observation: ProjectObservation;
    readonly render: RenderObservation;
    readonly document: ProjectFile;
  };
  readonly exact: {
    readonly document: boolean;
    readonly render: boolean;
    readonly structure: boolean;
  };
}

export interface FixtureStructureRefinementJourneyResult extends FixtureAnimationLifecycle {
  readonly negotiation: CatalogNegotiation;
  readonly initial: FixtureDocumentState & { readonly renders: readonly RenderObservation[] };
  readonly transaction: EditorTransactionResult;
  readonly afterTransaction: FixtureDocumentState & { readonly renders: readonly RenderObservation[] };
  readonly exact: {
    readonly document: boolean;
    readonly render: boolean;
    readonly structure: boolean;
  };
}

export interface FixtureAnimationJourneyResult extends FixtureAnimationLifecycle {
  readonly negotiation: CatalogNegotiation;
  readonly initial: FixtureDocumentState & { readonly renders: readonly RenderObservation[] };
  readonly operations: {
    readonly create: EditorTransactionResult;
    readonly duplicate: EditorTransactionResult;
    readonly duration: EditorTransactionResult;
    readonly reorder: EditorTransactionResult;
    readonly link: EditorTransactionResult;
    readonly unlink: EditorTransactionResult;
    readonly firstTag: EditorTransactionResult;
    readonly secondTag: EditorTransactionResult;
  };
  readonly checkpoints: {
    readonly afterCreate: FixtureAnimationCheckpoint;
    readonly afterDuplicate: FixtureAnimationCheckpoint;
    readonly afterDuration: FixtureAnimationCheckpoint;
    readonly afterReorder: FixtureAnimationCheckpoint;
    readonly afterLink: FixtureAnimationCheckpoint;
    readonly afterUnlink: FixtureAnimationCheckpoint;
  };
  readonly afterOperations: FixtureDocumentState & { readonly renders: readonly RenderObservation[] };
  readonly exact: {
    readonly document: boolean;
    readonly render: boolean;
    readonly structure: boolean;
  };
}

export interface FixtureRenderObservationJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly composite: RenderObservation;
  readonly canonicalCrop: Uint8Array;
  readonly primaryAfterInactive: RenderObservation;
  readonly layer: RenderObservation;
  readonly solidBackground: RenderObservation;
  readonly expectedDigest: RenderObservation;
  readonly digestMismatch: AutomationFailure;
  readonly inactiveTarget: RenderObservation;
  readonly exact: {
    readonly source: boolean;
    readonly background: boolean;
    readonly digest: boolean;
    readonly document: boolean;
  };
}

export interface FixtureAnimationObservationJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly bundle: AnimationEvaluationBundle;
  readonly stable: AnimationEvaluationBundle;
  readonly tagRange: AnimationEvaluationBundle;
  readonly afterTiming: AnimationEvaluationBundle;
  readonly timingTransaction: EditorTransactionResult;
  readonly digestMismatch: AutomationFailure;
  readonly inactive: AnimationEvaluationBundle;
  readonly exact: {
    readonly reconstruction: boolean;
    readonly contactSheet: boolean;
    readonly digest: boolean;
    readonly document: boolean;
    readonly inactiveTarget: boolean;
  };
}

export interface FixtureAnimationCheckpoint {
  readonly observation: ProjectObservation;
  readonly renders: readonly RenderObservation[];
}

interface FixtureJourneyStart {
  readonly negotiation: CatalogNegotiation;
  readonly initial: FixtureDocumentState;
}

interface FixtureHistoryReplay {
  readonly afterUndo: {
    readonly transition: HistoryTransitionResult;
    readonly observation: ProjectObservation;
    readonly render: RenderObservation;
    readonly document: ProjectFile;
  };
  readonly afterRedo: {
    readonly transition: HistoryTransitionResult;
    readonly observation: ProjectObservation;
    readonly render: RenderObservation;
    readonly document: ProjectFile;
  };
  readonly save: SaveResult;
  readonly reload: ReloadResult;
  readonly reloadedRender: RenderObservation;
  readonly reloadedDocument: ProjectFile;
}

interface FixtureAnimationLifecycle {
  readonly afterUndo: FixtureDocumentState & {
    readonly renders: readonly RenderObservation[];
    readonly transition: HistoryTransitionResult;
  };
  readonly afterRedo: FixtureDocumentState & {
    readonly renders: readonly RenderObservation[];
    readonly transition: HistoryTransitionResult;
  };
  readonly save: SaveResult;
  readonly reopened: {
    readonly save: SaveResult;
    readonly reload: ReloadResult;
    readonly observation: ProjectObservation;
    readonly renders: readonly RenderObservation[];
    readonly document: ProjectFile;
  };
}

/**
 * Deterministic conformance harness for the first adapter tracer bullet.
 * It replaces only the project repository and leaves editor algorithms,
 * validation, history, rendering, save safety, and Canvas Size untouched.
 */
export class FixtureSession {
  readonly target: { readonly projectId: string };
  readonly adapter: AutomationAdapter;
  readonly repository: ProjectRepository;

  private readonly context: ProjectContext;
  private readonly targetContexts = new Map<string, ProjectContext>();
  private readonly saveService: AutoSaveService;
  private readonly ownsContext: boolean;
  private initialized = false;

  constructor(options: FixtureSessionOptions = {}) {
    this.context = options.context ?? createProjectContext();
    this.ownsContext = options.context === undefined;
    this.repository = options.repository ?? new FixtureProjectRepository();
    this.saveService = options.saveService ?? createAutoSaveService({ repository: this.repository });
    const projectId = options.projectId ?? FIXTURE_PROJECT_ID;
    this.target = { projectId };
    this.targetContexts.set(projectId, this.context);
    let transactionSequence = 0;
    let tagSequence = 0;
    let entitySequence = 0;
    const entityIdFactory = options.entityIdFactory
      ?? (() => `fixture-entity-${++entitySequence}`);
    this.adapter = createAutomationAdapter({
      targetRegistry: this.targetContexts,
      saveService: this.saveService,
      repository: this.repository,
      transactionIdFactory: () => `fixture-transaction-${++transactionSequence}`,
      transactionTagIdFactory: () => `fixture-tag-${++tagSequence}`,
      projectIdFactory: options.projectIdFactory,
      entityIdFactory,
    });
  }

  /** Exposes the fixture's isolated context to conformance tests only. */
  get projectContext(): ProjectContext {
    return this.context;
  }

  /**
   * Bind a host-owned context for a target created through the public adapter.
   *
   * The golden journey uses this only to wire browser authority and recovery;
   * client operations continue through the target-free public seams.
   */
  getTargetContext(target: { readonly projectId: string }): ProjectContext {
    const context = this.targetContexts.get(target.projectId);
    if (!context || context.isDisposed || context.project.id.value !== target.projectId) {
      throw new Error(`Fixture target is not bound: ${target.projectId}`);
    }
    return context;
  }

  /** Create one isolated Preview-sized target without changing the fixture tab. */
  async createBlankProject(
    name: string,
    width: number,
    height: number,
  ): Promise<FixtureBlankProjectResult> {
    await this.initialize();
    const negotiation = this.adapter.negotiateCatalog({ version: '1.0' });
    if (!negotiation.ok) throw new Error(`Fixture catalog negotiation failed: ${negotiation.error.code}`);
    const creation = await requestSuccess<ProjectCreateResult>(this.adapter, {
      operation: 'project.create',
      kind: 'blank',
      name,
      width,
      height,
    });
    const observation = await requestSuccess<ProjectObservation>(this.adapter, {
      operation: 'project.observe',
      target: creation.target,
      expectedRevision: creation.revision,
    });
    return { creation, observation };
  }

  /** Exercise static package preparation, replay, and editable source round-trip. */
  // fallow-ignore-next-line complexity -- The fixture keeps source round-trip, replay, and digest evidence in one public journey.
  async runAssetPackage(
    options: FixtureAssetPackageJourneyOptions = {},
  ): Promise<FixtureAssetPackageJourneyResult> {
    const {
      negotiation,
      save,
      packageRequest,
      persistedDocument,
      inactiveContext,
      inactiveBefore,
      assetPackage,
      replay,
      activeTabSwitched,
    } = await this.prepareAssetPackageJourney(undefined, options);
    const source = assetPackage.artifacts.find((artifact) => artifact.role === 'source');
    const manifest = assetPackage.artifacts.find((artifact) => artifact.role === 'manifest');
    const initialFrame = this.context.animation.frames.value[0];
    if (!source || !manifest || !initialFrame) throw new Error('Static package fixture is incomplete.');

    const completed = await this.completeAssetPackageJourney(
      packageRequest,
      source,
      inactiveContext,
      'fixture-round-trip',
      save.revision,
    );
    const { inactiveAfter, sourceRoundTrip, rebound, reload, reloadedDocument } = completed;
    const reloadedPixels = renderProjectPixels(this.context, initialFrame.id);

    const sourceArtifact = assetPackage.artifacts.find((artifact) => artifact.role === 'source');
    const previewArtifact = assetPackage.artifacts.find((artifact) => artifact.role === 'preview');
    const manifestArtifact = assetPackage.artifacts.find((artifact) => artifact.role === 'manifest');
    const replayBytes = new Map(replay.artifacts.map((artifact) => [artifact.role, artifact.bytes]));
    const deterministic = assetPackage.artifacts.every((artifact) => (
      sameBytes(artifact.bytes, replayBytes.get(artifact.role) ?? new Uint8Array(0))
      && artifact.digest === replay.artifacts.find((candidate) => candidate.role === artifact.role)?.digest
    ));
    const digests = await independentlyVerifyAssetPackage(assetPackage);
    return {
      negotiation,
      save,
      assetPackage,
      replay,
      persistedDocument,
      roundTrip: {
        document: sourceRoundTrip.document,
        renderPixels: sourceRoundTrip.renders[0] ?? new Uint8Array(0),
      },
      reloaded: { document: reloadedDocument, renderPixels: reloadedPixels },
      exact: {
        staticArtifacts: assetPackage.artifacts.map((artifact) => artifact.role).join(',') === 'source,preview,manifest'
          && !assetPackage.manifest.spriteSheet,
        manifest: manifestArtifact?.byteLength === new TextEncoder().encode(JSON.stringify(assetPackage.manifest)).byteLength
          && assetPackage.manifest.artifacts.length === 2
          && !JSON.stringify(assetPackage.manifest).includes('manifestDigest'),
        deterministic,
        digests,
        source: !!sourceArtifact && sourceArtifact.byteLength === sourceArtifact.bytes.byteLength
          && sameProjectFile(sourceRoundTrip.document, sourceRoundTrip.project),
        render: !!previewArtifact && sameBytes(
          sourceRoundTrip.renders[0] ?? new Uint8Array(0),
          reloadedPixels,
        ),
        ...exactAssetPackageReload(save, reload, persistedDocument, sourceRoundTrip, reloadedDocument),
        reloadedRender: !!previewArtifact
          && sameBytes(reloadedPixels, sourceRoundTrip.renders[0] ?? new Uint8Array(0)),
        isolation: sameProjectFile(inactiveBefore, inactiveAfter),
        targetRebound: rebound,
        ...assetPackageIdentityEvidence(assetPackage, this.target, activeTabSwitched),
      },
    };
  }

  /** Exercise animated package preparation and row-major sprite evidence. */
  // fallow-ignore-next-line complexity -- The fixture keeps animated source, sprite, reload, and isolation evidence together.
  async runAnimatedAssetPackage(
    options: FixtureAssetPackageJourneyOptions = {},
  ): Promise<FixtureAnimatedAssetPackageJourneyResult> {
    const {
      negotiation,
      save,
      packageRequest,
      persistedDocument,
      inactiveContext,
      inactiveBefore,
      assetPackage,
      replay,
      activeTabSwitched,
    } = await this.prepareAssetPackageJourney(
      () => prepareAnimationObservationFixture(this.context),
      options,
    );
    const sprite = assetPackage.artifacts.find((artifact) => artifact.role === 'sprite-sheet');
    const replayBytes = new Map(replay.artifacts.map((artifact) => [artifact.role, artifact.bytes]));
    const deterministic = assetPackage.artifacts.every((artifact) => (
      sameBytes(artifact.bytes, replayBytes.get(artifact.role) ?? new Uint8Array(0))
    ));
    const digests = await independentlyVerifyAssetPackage(assetPackage);
    const frames = this.context.animation.frames.value;
    const cells = assetPackage.manifest.spriteSheet?.cells ?? [];
    const canonicalRenders = frames.map((frame) => renderProjectPixels(this.context, frame.id));
    const source = assetPackage.artifacts.find((artifact) => artifact.role === 'source');
    if (!source) throw new Error('Animated package fixture has no source artifact.');
    const completed = await this.completeAssetPackageJourney(
      packageRequest,
      source,
      inactiveContext,
      'animated-package-round-trip',
      save.revision,
    );
    const { inactiveAfter, sourceRoundTrip, rebound, reload, reloadedDocument } = completed;
    const reloadedFrames = this.context.animation.frames.value;
    const reloadedRenders = reloadedFrames.map((frame) => renderProjectPixels(this.context, frame.id));
    return {
      negotiation,
      save,
      assetPackage,
      replay,
      persistedDocument,
      sourceRoundTrip: {
        document: sourceRoundTrip.document,
        renders: sourceRoundTrip.renders,
      },
      reloaded: { document: reloadedDocument, renders: reloadedRenders },
      canonicalRenders,
      exact: {
        sprite: !!sprite
          && !!assetPackage.manifest.spriteSheet
          && assetPackage.manifest.spriteSheet.cells.length === frames.length
          && assetPackage.manifest.spriteSheet.columns === 3
          && assetPackage.manifest.spriteSheet.rows === 1,
        cells: cells.every((cell, index) => cell.index === index && cell.frameId === frames[index]?.id
          && cell.frameNumber === index + 1 && cell.x === index * this.context.project.width.value
          && cell.y === 0),
        timing: assetPackage.manifest.frames.every((frame, index) => frame.id === frames[index]?.id
          && frame.duration === frames[index]?.duration && frame.number === index + 1),
        deterministic,
        digests,
        referenceExcluded: assetPackage.manifest.frames.every((frame) => frame.renderDigest.length === 64),
        ...exactAssetPackageReload(save, reload, persistedDocument, sourceRoundTrip, reloadedDocument),
        reloadedRender: reloadedRenders.length === sourceRoundTrip.renders.length
          && reloadedRenders.every((render, index) => sameBytes(render, sourceRoundTrip.renders[index] ?? new Uint8Array(0))
            && sameBytes(render, canonicalRenders[index] ?? new Uint8Array(0))),
        isolation: sameProjectFile(inactiveBefore, inactiveAfter),
        targetRebound: rebound,
        ...assetPackageIdentityEvidence(assetPackage, this.target, activeTabSwitched),
      },
    };
  }

  /**
   * Exercise the explicit render observation boundary against real Canvas
   * pixels while keeping the existing frame-only requests untouched.
   */
  // fallow-ignore-next-line complexity -- The fixture intentionally exercises every public observation checkpoint in one journey.
  async runRenderObservation(): Promise<FixtureRenderObservationJourneyResult> {
    await this.initialize();
    prepareRenderObservationFixture(this.context);
    const negotiation = await requestSuccess<CatalogNegotiation>(this.adapter, {
      operation: 'catalog.negotiate',
      version: '1.0',
    });
    const observation = await this.observeTarget(this.adapter, this.context.project.revision.value);
    const frame = observation.frames.find((candidate) => candidate.id === observation.currentFrameId);
    const layer = observation.layers.find((candidate) => candidate.id === 'fixture-overlay')
      ?? observation.layers.find((candidate) => candidate.type !== 'reference');
    const cel = frame?.cels.find((candidate) => candidate.layerId === layer?.id);
    if (!frame || !layer || !cel) throw new Error('Fixture render observation source is incomplete.');

    const documentBefore = await this.serializeDocument();
    const crop = { x: 0, y: 0, width: 2, height: 2 };
    const compositeRequest = {
      operation: 'project.render.observe',
      target: this.target,
      expectedRevision: observation.revision,
      source: { kind: 'composite' as const, frameId: frame.id },
      region: crop,
      background: { kind: 'transparent' as const },
      scale: 4,
      expectedDigest: null,
    };
    const composite = await requestSuccess<RenderObservation>(this.adapter, compositeRequest);
    const canonical = renderProject(this.context, this.target, frame.id);
    if ('ok' in canonical) throw new Error(`Fixture canonical render failed: ${canonical.error.code}`);
    const canonicalCrop = cropRenderPixels(canonical.pixels, canonical.width, crop);
    const layerResult = await requestSuccess<RenderObservation>(this.adapter, {
      ...compositeRequest,
      source: { kind: 'layer', layerId: layer.id, frameId: frame.id, celId: cel.id },
    });
    const solidBackground = await requestSuccess<RenderObservation>(this.adapter, {
      ...compositeRequest,
      background: { kind: 'solid', color: '#0000ff' },
      scale: 1,
    });
    const expectedDigest = await requestSuccess<RenderObservation>(this.adapter, {
      ...compositeRequest,
      expectedDigest: composite.digest,
    });
    const digestMismatch = await requestFailure(this.adapter, {
      ...compositeRequest,
      expectedDigest: '0'.repeat(64),
    });

    const inactiveContext = await this.createInactiveFixtureContext('fixture-inactive');
    seedFixturePixel(inactiveContext);
    seedInactiveFixturePixel(inactiveContext);
    this.targetContexts.set('fixture-inactive', inactiveContext);
    const inactiveTarget = await requestSuccess<RenderObservation>(this.adapter, {
      ...compositeRequest,
      target: { projectId: 'fixture-inactive' },
      expectedRevision: inactiveContext.project.revision.value,
    });
    const primaryAfterInactive = await requestSuccess<RenderObservation>(this.adapter, compositeRequest);
    const documentAfter = await this.serializeDocument();

    return {
      negotiation,
      composite,
      canonicalCrop,
      primaryAfterInactive,
      layer: layerResult,
      solidBackground,
      expectedDigest,
      digestMismatch,
      inactiveTarget,
      exact: {
        source: composite.sourceKind === 'composite'
          && layerResult.sourceKind === 'layer'
          && layerResult.source.kind === 'layer'
          && layerResult.source.layerId === layer.id
          && layerResult.source.celId === cel.id,
        background: solidBackground.background.kind === 'solid'
          && solidBackground.pixels[3] === 255
          && composite.background.kind === 'transparent'
          && composite.pixels[7] === 0,
        digest: composite.digest === expectedDigest.digest
          && sameBytes(composite.pixels, expectedDigest.pixels)
          && digestMismatch.error.code === 'revision_conflict'
          && digestMismatch.error.retryable,
        document: sameProjectFile(documentBefore, documentAfter)
          && observation.revision === this.context.project.revision.value
          && sameBytes(composite.pixels, primaryAfterInactive.pixels),
      },
    };
  }

  async run(): Promise<FixtureJourneyResult> {
    await this.initialize();
    const start = await this.beginJourney();

    const resizeRequest = {
      target: this.target,
      expectedRevision: start.initial.observation.revision,
      width: 6,
      height: 5,
      offset: { x: 1, y: 1 },
    };
    const resizePreview = await requestSuccess<CanvasResizePreviewResult>(this.adapter, {
      operation: 'project.canvas.resize',
      action: 'preview',
      ...resizeRequest,
    });
    const resizeExecution = await requestSuccess<CanvasResizeExecutionResult>(this.adapter, {
      operation: 'project.canvas.resize',
      ...resizeRequest,
      preview: resizePreview.preview,
      confirmed: true,
    });
    await settleEffects();

    const afterResizeObservation = await requestSuccess<ProjectObservation>(this.adapter, {
      operation: 'project.observe',
      target: this.target,
      expectedRevision: resizeExecution.revision,
    });
    const afterResizeRender = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target: this.target,
      expectedRevision: afterResizeObservation.revision,
      frameId: afterResizeObservation.currentFrameId,
    });
    const resizedDocument = await this.serializeDocument();
    const history = await this.completeHistoryJourney(
      afterResizeObservation,
    );

    return {
      negotiation: start.negotiation,
      initial: {
        observation: start.initial.observation,
        render: start.initial.render,
      },
      resize: { preview: resizePreview, execution: resizeExecution },
      afterResize: { observation: afterResizeObservation, render: afterResizeRender },
      afterUndo: {
        transition: history.afterUndo.transition,
        observation: history.afterUndo.observation,
        render: history.afterUndo.render,
      },
      afterRedo: {
        transition: history.afterRedo.transition,
        observation: history.afterRedo.observation,
        render: history.afterRedo.render,
      },
      save: history.save,
      reload: history.reload,
      exact: {
        document: sameProjectFile(start.initial.document, history.afterUndo.document)
          && sameProjectFile(resizedDocument, history.afterRedo.document)
          && sameProjectFile(history.afterRedo.document, history.reloadedDocument),
        render: sameRender(start.initial.render, history.afterUndo.render)
          && sameRender(afterResizeRender, history.afterRedo.render)
          && sameRender(history.afterRedo.render, history.reloadedRender),
      },
    };
  }

  async runTransaction(): Promise<FixtureTransactionJourneyResult> {
    await this.initialize();
    const start = await this.beginJourney();
    const layer = start.initial.observation.layers[0];
    if (!layer) throw new Error('Fixture project did not load a layer.');

    const transaction = await requestSuccess<EditorTransactionResult>(this.adapter, {
      operation: 'project.transaction.execute',
      target: this.target,
      expectedRevision: start.initial.observation.revision,
      provenance: {
        clientId: 'fixture-client',
        sessionId: 'fixture-session',
        runId: 'fixture-run',
        operationId: 'fixture-transaction',
      },
      children: [
        {
          command: 'project.layer.state',
          input: {
            kind: 'layer.visibility',
            layerId: layer.id,
            visible: false,
          },
        },
        {
          command: 'project.animation.frame-tag',
          input: {
            kind: 'tag.create',
            name: 'Fixture Tag',
            color: '#123456',
            startFrameIndex: 0,
            endFrameIndex: 0,
          },
        },
      ],
    });
    await settleEffects();

    const afterTransactionObservation = await requestSuccess<ProjectObservation>(this.adapter, {
      operation: 'project.observe',
      target: this.target,
      expectedRevision: transaction.revision,
    });
    const afterTransactionRender = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target: this.target,
      expectedRevision: afterTransactionObservation.revision,
      frameId: afterTransactionObservation.currentFrameId,
    });
    const afterTransactionDocument = await this.serializeDocument();
    const history = await this.completeHistoryJourney(
      afterTransactionObservation,
    );

    return {
      negotiation: start.negotiation,
      initial: start.initial,
      transaction,
      afterTransaction: {
        observation: afterTransactionObservation,
        render: afterTransactionRender,
        document: afterTransactionDocument,
      },
      afterUndo: history.afterUndo,
      afterRedo: history.afterRedo,
      save: history.save,
      reload: history.reload,
      exact: {
        document: sameProjectFile(start.initial.document, history.afterUndo.document)
          && sameProjectFile(afterTransactionDocument, history.afterRedo.document)
          && sameProjectFile(history.afterRedo.document, history.reloadedDocument),
        render: sameRender(start.initial.render, history.afterUndo.render)
          && sameRender(afterTransactionRender, history.afterRedo.render)
          && sameRender(history.afterRedo.render, history.reloadedRender),
      },
    };
  }

  /**
   * Prove one bounded layer/composite Symbol Grid and its exact raster patch
   * through undo, redo, save, close/reopen, and reload.
   */
  async runRasterPatch(): Promise<FixtureRasterPatchJourneyResult> {
    const start = await this.beginFixtureRun();
    const { negotiation, initialRevision } = start;
    const initial = await this.captureRasterPatchState(this.context, this.adapter, initialRevision);
    const layerSource = initial.layerObservation.source;
    if (layerSource.kind !== 'layer') throw new Error('Fixture Symbol Grid layer source is incomplete.');
    const red = initial.layerObservation.legend.find((entry) => entry.paletteEntryId === 'fixture-palette-red');
    if (!red) throw new Error('Fixture Symbol Grid did not expose its red palette entry.');

    const transaction = await requestSuccess<EditorTransactionResult>(this.adapter, {
      operation: 'project.transaction.execute',
      profile: 'raster-patch',
      target: this.target,
      expectedRevision: initialRevision,
      provenance: {
        clientId: 'fixture-raster-client',
        sessionId: 'fixture-raster-session',
        runId: 'fixture-raster-run',
        operationId: 'fixture-raster-patch',
      },
      children: [{
        command: 'project.raster.patch',
        input: {
          kind: 'raster.patch',
          layerId: layerSource.layerId,
          frameId: layerSource.frameId,
          celId: layerSource.celId,
          region: initial.layerObservation.region,
          digest: initial.layerObservation.digest,
          legend: [
            { symbol: red.symbol, paletteEntryId: red.paletteEntryId },
            { symbol: 'g', color: '#00ff00ff' },
          ],
          patches: [
            { x: 0, y: 0, width: 1, height: 1, rows: [red.symbol] },
            { x: 2, y: 2, width: 1, height: 1, rows: ['g'] },
          ],
        },
      }],
    });
    await settleEffects();
    const afterTransaction = await this.captureRasterPatchState(
      this.context,
      this.adapter,
      transaction.revision,
    );

    const undoTransition = await requestSuccess<HistoryTransitionResult>(this.adapter, {
      operation: 'project.history.undo',
      target: this.target,
      expectedRevision: transaction.revision,
    });
    const afterUndo = {
      ...(await this.captureRasterPatchState(this.context, this.adapter, undoTransition.revision)),
      transition: undoTransition,
    };
    const redoTransition = await requestSuccess<HistoryTransitionResult>(this.adapter, {
      operation: 'project.history.redo',
      target: this.target,
      expectedRevision: undoTransition.revision,
    });
    const afterRedo = {
      ...(await this.captureRasterPatchState(this.context, this.adapter, redoTransition.revision)),
      transition: redoTransition,
    };
    const save = await requestSuccess<SaveResult>(this.adapter, {
      operation: 'project.save',
      target: this.target,
      expectedRevision: afterRedo.layerObservation.revision,
    });
    const reopenedContext = await this.reopenFixtureContext(
      this.context,
      this.target,
      afterRedo.layerObservation.revision,
      'raster patch',
    );
    const reopenedSave = await requestSuccess<SaveResult>(reopenedContext.adapter, {
      operation: 'project.save',
      target: this.target,
      expectedRevision: afterRedo.layerObservation.revision,
    });
    const reopenedReload = await requestSuccess<ReloadResult>(reopenedContext.adapter, {
      operation: 'project.reload',
      target: this.target,
      expectedRevision: afterRedo.layerObservation.revision,
    });
    const reopenedState = await this.captureRasterPatchState(
      reopenedContext.context,
      reopenedContext.adapter,
      reopenedReload.revision,
    );

    return {
      negotiation,
      initial,
      transaction,
      afterTransaction,
      afterUndo,
      afterRedo,
      save,
      reopened: { save: reopenedSave, reload: reopenedReload, state: reopenedState },
      exact: {
        document: sameProjectFile(afterTransaction.document, afterRedo.document)
          && sameProjectFile(afterRedo.document, reopenedState.document),
        render: sameRender(afterTransaction.render, afterRedo.render)
          && sameRender(afterRedo.render, reopenedState.render),
        digest: afterRedo.layerObservation.digest === reopenedState.layerObservation.digest,
        source: afterRedo.compositeObservation.sourceKind === 'composite'
          && !afterRedo.compositeObservation.editable
          && afterRedo.compositeObservation.digest === reopenedState.compositeObservation.digest,
      },
    };
  }

  /**
   * Prove the static profile across its complete persisted lifecycle. The
   * created target is closed before a fresh context loads it from the fixture
   * repository and then exercises the adapter reload proof.
   */
  async runStaticStructure(): Promise<FixtureStaticStructureJourneyResult> {
    await this.initialize();
    const negotiation = await requestSuccess<CatalogNegotiation>(this.adapter, {
      operation: 'catalog.negotiate',
      version: '1.0',
    });
    const creation = await this.createBlankProject('Static structure fixture', 16, 16);
    const target = creation.creation.target;
    const createdContext = this.targetContexts.get(target.projectId);
    if (!createdContext) throw new Error('Fixture project creation did not register its target.');

    const initialObservation = creation.observation;
    const initialRender = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target,
      expectedRevision: initialObservation.revision,
      frameId: initialObservation.currentFrameId,
    });
    const initialDocument = structuredClone(
      await createdContext.project.saveProject({ rebuildIndexBuffers: false }),
    );
    const transaction = await requestSuccess<EditorTransactionResult>(this.adapter,
      makeStaticStructureRequest(target, initialObservation),
    );
    await settleEffects();

    const afterTransactionObservation = await requestSuccess<ProjectObservation>(this.adapter, {
      operation: 'project.observe',
      target,
      expectedRevision: transaction.revision,
    });
    const afterTransactionRender = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target,
      expectedRevision: afterTransactionObservation.revision,
      frameId: afterTransactionObservation.currentFrameId,
    });
    const afterTransactionDocument = structuredClone(
      await createdContext.project.saveProject({ rebuildIndexBuffers: false }),
    );

    const afterUndo = await replayStaticHistory(this.adapter, target, afterTransactionObservation, createdContext);
    const save = await requestSuccess<SaveResult>(this.adapter, {
      operation: 'project.save',
      target,
      expectedRevision: afterUndo.afterRedo.observation.revision,
    });

    const reopened = await this.reopenFixtureContext(
      createdContext,
      target,
      afterUndo.afterRedo.observation.revision,
      'created',
    );
    const reopenedContext = reopened.context;
    const reopenedAdapter = reopened.adapter;
    const reopenedSave = await requestSuccess<SaveResult>(reopenedAdapter, {
      operation: 'project.save',
      target,
      expectedRevision: afterUndo.afterRedo.observation.revision,
    });
    const reopenedReload = await requestSuccess<ReloadResult>(reopenedAdapter, {
      operation: 'project.reload',
      target,
      expectedRevision: afterUndo.afterRedo.observation.revision,
    });
    const reopenedObservation = reopenedReload.observation;
    const reopenedRender = await requestSuccess<RenderObservation>(reopenedAdapter, {
      operation: 'project.render.observe',
      target,
      expectedRevision: reopenedObservation.revision,
      frameId: reopenedObservation.currentFrameId,
    });
    const reopenedDocument = structuredClone(
      await reopenedContext.project.saveProject({ rebuildIndexBuffers: false }),
    );

    return {
      negotiation,
      creation,
      initial: {
        observation: initialObservation,
        render: initialRender,
        document: initialDocument,
      },
      transaction,
      afterTransaction: {
        observation: afterTransactionObservation,
        render: afterTransactionRender,
        document: afterTransactionDocument,
      },
      afterUndo: afterUndo.afterUndo,
      afterRedo: afterUndo.afterRedo,
      save,
      reopened: {
        save: reopenedSave,
        reload: reopenedReload,
        observation: reopenedObservation,
        render: reopenedRender,
        document: reopenedDocument,
      },
      exact: {
        document: (() => {
          const initialMatchesUndo = sameProjectFile(initialDocument, afterUndo.afterUndo.document);
          const transactionMatchesRedo = sameProjectFile(afterTransactionDocument, afterUndo.afterRedo.document);
          const redoMatchesReopened = sameProjectFileIgnoringEmptyIndices(afterUndo.afterRedo.document, reopenedDocument);
          return initialMatchesUndo && transactionMatchesRedo && redoMatchesReopened;
        })(),
        render: sameRender(initialRender, afterUndo.afterUndo.render)
          && sameRender(afterTransactionRender, afterUndo.afterRedo.render)
          && sameRender(afterUndo.afterRedo.render, reopenedRender),
        structure: sameStructure(afterUndo.afterRedo.observation, reopenedObservation),
      },
    };
  }

  /**
   * Prove the lossless structure-refinement profile with one complete final
   * declaration and one exact adjacent merge through every public lifecycle.
   */
  async runStructureRefinement(): Promise<FixtureStructureRefinementJourneyResult> {
    await this.initialize();
    const negotiation = await requestSuccess<CatalogNegotiation>(this.adapter, {
      operation: 'catalog.negotiate',
      version: '1.0',
    });
    prepareStructureRefinementFixture(this.context);
    const initial = await this.captureAnimationState(this.context, this.adapter, 0);
    const transaction = await requestSuccess<EditorTransactionResult>(this.adapter, {
      operation: 'project.transaction.execute',
      profile: 'structure-refinement',
      target: this.target,
      expectedRevision: initial.observation.revision,
      provenance: {
        clientId: 'fixture-refinement-client',
        sessionId: 'fixture-refinement-session',
        runId: 'fixture-refinement-run',
        operationId: 'fixture-structure-refinement',
      },
      children: [{
        command: 'project.layer.structure.refine',
        input: {
          kind: 'structure.refine',
          layers: [
            { id: 'fixture-refinement-group', name: 'Grouped', type: 'group', parentId: null },
            { id: 'fixture-refinement-target', name: 'Merged target', type: 'image', parentId: 'fixture-refinement-group' },
            { id: 'fixture-refinement-bottom', name: 'Bottom renamed', type: 'image', parentId: null },
          ],
          mergePairs: [{
            sourceLayerId: 'fixture-refinement-source',
            targetLayerId: 'fixture-refinement-target',
          }],
        },
      }],
    });
    await settleEffects();
    const afterTransaction = await this.captureAnimationState(this.context, this.adapter, transaction.revision);

    const lifecycle = await this.completeAnimationLifecycle(
      this.context,
      this.adapter,
      this.target,
      transaction.revision,
      'refinement',
    );

    return {
      negotiation,
      initial,
      transaction,
      afterTransaction,
      afterUndo: lifecycle.afterUndo,
      afterRedo: lifecycle.afterRedo,
      save: lifecycle.save,
      reopened: lifecycle.reopened,
      exact: {
        document: sameProjectFile(initial.document, lifecycle.afterUndo.document)
          && sameProjectFile(afterTransaction.document, lifecycle.afterRedo.document)
          && sameProjectFile(lifecycle.afterRedo.document, lifecycle.reopened.document),
        render: sameRenders(initial.renders, lifecycle.afterUndo.renders)
          && sameRenders(afterTransaction.renders, lifecycle.afterRedo.renders)
          && sameRenders(lifecycle.afterRedo.renders, lifecycle.reopened.renders),
        structure: sameStructure(lifecycle.afterRedo.observation, lifecycle.reopened.observation),
      },
    };
  }

  /**
   * Prove one-child animation commands through history and persistence. Every
   * frame render is captured independently so reload cannot hide a damaged
   * non-current frame.
   */
  // fallow-ignore-next-line complexity -- The deterministic fixture intentionally proves the complete public animation lifecycle.
  async runAnimation(): Promise<FixtureAnimationJourneyResult> {
    const start = await this.beginFixtureRun();
    const { negotiation, initialRevision } = start;
    const initial = await this.captureAnimationState(this.context, this.adapter, initialRevision);
    const firstFrame = initial.observation.frames[0];
    const layer = initial.observation.layers.find((candidate) => candidate.type !== 'reference');
    if (!firstFrame || !layer) throw new Error('Fixture project has no supported animation layer.');

    const create = await requestAnimationTransaction(this.adapter, this.target, initial.observation, {
      command: 'project.animation.frame',
      input: { kind: 'frame.create', position: 'end', duration: 180 },
      operationId: 'fixture-animation-create',
    });
    const afterCreate = await this.captureAnimationCheckpoint(this.adapter, create.revision);
    const createdFrame = afterCreate.observation.frames.find((frame) => frame.id !== firstFrame.id);
    if (!createdFrame) throw new Error('Animation frame creation did not produce a frame.');

    const duplicate = await requestAnimationTransaction(this.adapter, this.target, afterCreate.observation, {
      command: 'project.animation.frame',
      input: {
        kind: 'frame.duplicate',
        sourceFrameId: firstFrame.id,
        position: 'after',
        anchorFrameId: createdFrame.id,
      },
      operationId: 'fixture-animation-duplicate',
    });
    const afterDuplicate = await this.captureAnimationCheckpoint(this.adapter, duplicate.revision);
    const duplicateFrame = afterDuplicate.observation.frames.find((frame) =>
      frame.id !== firstFrame.id && frame.id !== createdFrame.id);
    if (!duplicateFrame) throw new Error('Animation duplication did not produce a frame.');

    const duration = await requestAnimationTransaction(this.adapter, this.target, afterDuplicate.observation, {
      command: 'project.animation.frame',
      input: { kind: 'frame.duration', frameId: duplicateFrame.id, duration: 420 },
      operationId: 'fixture-animation-duration',
    });
    const afterDuration = await this.captureAnimationCheckpoint(this.adapter, duration.revision);
    const reorder = await requestAnimationTransaction(this.adapter, this.target, afterDuration.observation, {
      command: 'project.animation.frame',
      input: { kind: 'frame.reorder', frameId: duplicateFrame.id, position: 'start' },
      operationId: 'fixture-animation-reorder',
    });
    const afterReorder = await this.captureAnimationCheckpoint(this.adapter, reorder.revision);

    const linkMembers = [firstFrame.id, duplicateFrame.id].map((frameId) => {
      const frame = afterReorder.observation.frames.find((candidate) => candidate.id === frameId);
      const cel = frame?.cels.find((candidate) => candidate.layerId === layer.id);
      if (!cel) throw new Error('Fixture animation cel observation is incomplete.');
      return { key: cel.key, celId: cel.id, layerId: cel.layerId, frameId: cel.frameId };
    });
    const link = await requestAnimationTransaction(this.adapter, this.target, afterReorder.observation, {
      command: 'project.animation.cel.link',
      input: { kind: 'cel.link', layerId: layer.id, members: linkMembers },
      operationId: 'fixture-animation-link',
    });
    const afterLink = await this.captureAnimationCheckpoint(this.adapter, link.revision);
    const linkedCel = afterLink.observation.frames.find((frame) => frame.id === firstFrame.id)?.cels
      .find((cel) => cel.layerId === layer.id);
    if (!linkedCel?.linkedCelId) throw new Error('Fixture animation link did not produce a hard link.');
    const unlink = await requestAnimationTransaction(this.adapter, this.target, afterLink.observation, {
      command: 'project.animation.cel.unlink',
      input: {
        kind: 'cel.unlink',
        layerId: layer.id,
        frameId: linkedCel.frameId,
        celId: linkedCel.id,
        linkedCelId: linkedCel.linkedCelId,
        linkGroup: afterLink.observation.frames.flatMap((frame) => frame.cels)
          .filter((cel) => cel.linkedCelId === linkedCel.linkedCelId)
          .map((cel) => ({
            key: cel.key,
            celId: cel.id,
            layerId: cel.layerId,
            frameId: cel.frameId,
            linkedCelId: cel.linkedCelId!,
            linkType: 'hard' as const,
          })),
      },
      operationId: 'fixture-animation-unlink',
    });
    const afterUnlink = await this.captureAnimationCheckpoint(this.adapter, unlink.revision);
    const firstTag = await requestAnimationTransaction(this.adapter, this.target, afterUnlink.observation, {
      command: 'project.animation.frame-tag',
      input: { kind: 'tag.create', name: 'Fixture Intro', color: '#123456', startFrameIndex: 0, endFrameIndex: 0 },
      operationId: 'fixture-animation-tag-intro',
    });
    const afterFirstTag = await this.observeTarget(this.adapter, firstTag.revision);
    const secondTag = await requestAnimationTransaction(this.adapter, this.target, afterFirstTag, {
      command: 'project.animation.frame-tag',
      input: { kind: 'tag.create', name: 'Fixture Motion', color: '#654321', startFrameIndex: 1, endFrameIndex: 2 },
      operationId: 'fixture-animation-tag-motion',
    });
    const afterOperations = await this.captureAnimationState(this.context, this.adapter, secondTag.revision);

    const lifecycle = await this.completeAnimationLifecycle(
      this.context,
      this.adapter,
      this.target,
      secondTag.revision,
      'animation',
    );

    return {
      negotiation,
      initial,
      operations: { create, duplicate, duration, reorder, link, unlink, firstTag, secondTag },
      checkpoints: {
        afterCreate,
        afterDuplicate,
        afterDuration,
        afterReorder,
        afterLink,
        afterUnlink,
      },
      afterOperations,
      afterUndo: lifecycle.afterUndo,
      afterRedo: lifecycle.afterRedo,
      save: lifecycle.save,
      reopened: lifecycle.reopened,
      exact: {
        document: sameProjectFile(afterOperations.document, lifecycle.afterRedo.document)
          && sameProjectFile(lifecycle.afterRedo.document, lifecycle.reopened.document),
        render: sameRenders(afterOperations.renders, lifecycle.afterRedo.renders)
          && sameRenders(lifecycle.afterRedo.renders, lifecycle.reopened.renders),
        structure: sameAnimationStructure(lifecycle.afterRedo.observation, lifecycle.reopened.observation),
      },
    };
  }

  /**
   * Exercise the complete detached animation evaluation bundle journey with
   * three visibly distinct frames, timing, a tag, and a visible reference.
   */
  // fallow-ignore-next-line complexity -- The fixture intentionally keeps the public bundle evidence together.
  async runAnimationObservation(): Promise<FixtureAnimationObservationJourneyResult> {
    await this.initialize();
    prepareAnimationObservationFixture(this.context);
    const negotiation = await requestSuccess<CatalogNegotiation>(this.adapter, {
      operation: 'catalog.negotiate',
      version: '1.0',
    });
    const initial = await this.observeTarget(this.adapter, this.context.project.revision.value);
    const frameIds = initial.frames.map((frame) => frame.id);
    const [firstFrameId, secondFrameId, thirdFrameId] = frameIds;
    if (!firstFrameId || !secondFrameId || !thirdFrameId) {
      throw new Error('Animation observation fixture did not create three frames.');
    }
    const documentBefore = await this.serializeDocument();
    const request = {
      operation: 'project.animation.observe',
      target: this.target,
      expectedRevision: initial.revision,
      range: 'all' as const,
      background: { kind: 'transparent' as const },
      scale: 4,
      keyframes: [firstFrameId, thirdFrameId],
      expectedDigest: null,
    };
    const bundle = await requestSuccess<AnimationEvaluationBundle>(this.adapter, request);
    const stable = await requestSuccess<AnimationEvaluationBundle>(this.adapter, {
      ...request,
      expectedDigest: bundle.digest,
    });
    const tagRange = await requestSuccess<AnimationEvaluationBundle>(this.adapter, {
      ...request,
      range: { tagId: 'fixture-animation-preview-tag' },
      keyframes: [secondFrameId, thirdFrameId],
    });
    const digestMismatch = await requestFailure(this.adapter, {
      ...request,
      expectedDigest: '0'.repeat(64),
    });
    const inactiveContext = await this.createInactiveFixtureContext('fixture-inactive-animation');
    prepareAnimationObservationFixture(inactiveContext);
    prepareInactiveAnimationObservationFixture(inactiveContext);
    this.targetContexts.set('fixture-inactive-animation', inactiveContext);
    const inactive = await requestSuccess<AnimationEvaluationBundle>(this.adapter, {
      ...request,
      target: { projectId: 'fixture-inactive-animation' },
      expectedRevision: inactiveContext.project.revision.value,
    });
    const documentAfterObservation = await this.serializeDocument();

    const timingTransaction = await requestAnimationTransaction(this.adapter, this.target, initial, {
      command: 'project.animation.frame',
      input: { kind: 'frame.duration', frameId: secondFrameId, duration: 375 },
      operationId: 'fixture-animation-preview-duration',
    });
    const afterTiming = await requestSuccess<AnimationEvaluationBundle>(this.adapter, {
      ...request,
      expectedRevision: timingTransaction.revision,
    });
    const reconstructed = reconstructAnimationGrids(bundle);
    const reconstruction = reconstructed.length === bundle.frames.length
      && reconstructed.every((grid, index) => JSON.stringify(grid) === JSON.stringify(bundle.frames[index]?.grid));
    const contactSheet = bundle.contactSheet.cells.every((cell) => {
      const frame = bundle.frames[cell.index];
      if (!frame) return false;
      const bytes = new Uint8Array(cell.width * cell.height * 4);
      for (let row = 0; row < cell.height; row++) {
        const sourceStart = (cell.y + row) * bundle.contactSheet.stride + cell.x * 4;
        bytes.set(bundle.contactSheet.pixels.subarray(sourceStart, sourceStart + cell.width * 4), row * cell.width * 4);
      }
      return sameBytes(bytes, frame.render.pixels);
    });

    return {
      negotiation,
      bundle,
      stable,
      tagRange,
      afterTiming,
      timingTransaction,
      digestMismatch,
      inactive,
      exact: {
        reconstruction,
        contactSheet,
        digest: stable.digest === bundle.digest
          && afterTiming.digest !== bundle.digest
          && afterTiming.frames[1]?.duration === 375
          && digestMismatch.error.code === 'revision_conflict'
          && digestMismatch.error.retryable,
        document: sameProjectFile(documentBefore, documentAfterObservation),
        inactiveTarget: inactive.target.projectId === 'fixture-inactive-animation'
          && bundle.target.projectId === this.target.projectId
          && inactive.revision === bundle.revision
          && inactive.frames.map((frame) => frame.duration).join(',') === '140,220,300'
          && inactive.frames[0]?.render.pixels[60] === 0
          && inactive.frames[0]?.render.pixels[61] === 0
          && inactive.frames[0]?.render.pixels[62] === 255
          && inactive.frames[0]?.render.pixels[63] === 255
          && inactive.contactSheet.cells[0]?.label === 'Frame 1 · 140 ms',
      },
    };
  }

  private async observeTarget(
    adapter: AutomationAdapter,
    revision: number,
    target: { readonly projectId: string } = this.target,
  ): Promise<ProjectObservation> {
    return requestSuccess<ProjectObservation>(adapter, {
      operation: 'project.observe', target, expectedRevision: revision,
    });
  }

  private async createInactiveFixtureContext(projectId: string): Promise<ProjectContext> {
    const context = createProjectContext();
    await this.saveService.runWithoutSaving(async () => {
      await context.project.loadProject(createFixtureProject());
      context.project.id.value = projectId;
    }, context);
    return context;
  }

  private async captureAnimationCheckpoint(
    adapter: AutomationAdapter,
    revision: number,
    target: { readonly projectId: string } = this.target,
  ): Promise<FixtureAnimationCheckpoint> {
    const observation = await this.observeTarget(adapter, revision, target);
    const renders = await Promise.all(observation.frames.map((frame) => requestSuccess<RenderObservation>(adapter, {
      operation: 'project.render.observe', target,
      expectedRevision: revision, frameId: frame.id,
    })));
    return { observation, renders };
  }

  private async captureAnimationState(
    context: ProjectContext,
    adapter: AutomationAdapter,
    revision: number,
    transition?: HistoryTransitionResult,
    target: { readonly projectId: string } = this.target,
  ): Promise<FixtureDocumentState & { readonly renders: readonly RenderObservation[] }> {
    const checkpoint = await this.captureAnimationCheckpoint(adapter, revision, target);
    const { observation, renders } = checkpoint;
    return {
      observation: transition ? { ...observation, lastEvent: transition.event } : observation,
      render: renders[0] ?? await requestSuccess<RenderObservation>(adapter, {
        operation: 'project.render.observe', target,
        expectedRevision: revision, frameId: observation.currentFrameId,
      }),
      renders,
      document: structuredClone(await context.project.saveProject({ rebuildIndexBuffers: false })),
    };
  }

  private async captureRasterPatchState(
    context: ProjectContext,
    adapter: AutomationAdapter,
    revision: number,
    target: { readonly projectId: string } = this.target,
  ): Promise<FixtureRasterPatchState> {
    const observation = await this.observeTarget(adapter, revision, target);
    const layer = observation.layers.find((candidate) => candidate.type === 'image');
    if (!layer) throw new Error('Fixture project has no image layer.');
    const frameId = observation.currentFrameId;
    const layerObservation = await requestSuccess<RasterObservation>(adapter, {
      operation: 'project.raster.observe',
      target,
      expectedRevision: revision,
      source: { kind: 'layer', layerId: layer.id, frameId },
      region: { x: 0, y: 0, width: observation.canvas.width, height: observation.canvas.height },
    });
    const compositeObservation = await requestSuccess<RasterObservation>(adapter, {
      operation: 'project.raster.observe',
      target,
      expectedRevision: revision,
      source: { kind: 'composite', frameId },
      region: { x: 0, y: 0, width: observation.canvas.width, height: observation.canvas.height },
    });
    const render = await requestSuccess<RenderObservation>(adapter, {
      operation: 'project.render.observe',
      target,
      expectedRevision: revision,
      frameId,
    });
    return {
      layerObservation,
      compositeObservation,
      render,
      document: structuredClone(await context.project.saveProject({ rebuildIndexBuffers: false })),
    };
  }

  private async completeAnimationLifecycle(
    context: ProjectContext,
    adapter: AutomationAdapter,
    target: { readonly projectId: string },
    revision: number,
    label: string,
  ): Promise<FixtureAnimationLifecycle> {
    const undoTransition = await requestSuccess<HistoryTransitionResult>(adapter, {
      operation: 'project.history.undo', target, expectedRevision: revision,
    });
    const afterUndo = await this.captureAnimationState(
      context,
      adapter,
      undoTransition.revision,
      undoTransition,
      target,
    );
    const redoTransition = await requestSuccess<HistoryTransitionResult>(adapter, {
      operation: 'project.history.redo', target, expectedRevision: undoTransition.revision,
    });
    const afterRedo = await this.captureAnimationState(
      context,
      adapter,
      redoTransition.revision,
      redoTransition,
      target,
    );
    const save = await requestSuccess<SaveResult>(adapter, {
      operation: 'project.save', target, expectedRevision: afterRedo.observation.revision,
    });
    const reopened = await this.reopenFixtureContext(
      context,
      target,
      afterRedo.observation.revision,
      label,
    );
    const reopenedSave = await requestSuccess<SaveResult>(reopened.adapter, {
      operation: 'project.save', target, expectedRevision: afterRedo.observation.revision,
    });
    const reopenedReload = await requestSuccess<ReloadResult>(reopened.adapter, {
      operation: 'project.reload', target, expectedRevision: afterRedo.observation.revision,
    });
    const reopenedState = await this.captureAnimationState(
      reopened.context,
      reopened.adapter,
      reopenedReload.revision,
      undefined,
      target,
    );
    return {
      afterUndo: { ...afterUndo, transition: undoTransition },
      afterRedo: { ...afterRedo, transition: redoTransition },
      save,
      reopened: {
        save: reopenedSave,
        reload: reopenedReload,
        observation: reopenedState.observation,
        renders: reopenedState.renders,
        document: reopenedState.document,
      },
    };
  }

  private async reopenFixtureContext(
    context: ProjectContext,
    target: { readonly projectId: string },
    revision: number,
    label: string,
  ): Promise<{ readonly context: ProjectContext; readonly adapter: AutomationAdapter }> {
    this.saveService.stop(context);
    context.dispose();
    this.targetContexts.delete(target.projectId);
    const reopenedContext = createProjectContext();
    const persisted = await this.repository.load(target.projectId);
    if (!persisted) throw new Error(`Fixture repository lost the ${label} project.`);
    await this.saveService.runWithoutSaving(async () => {
      await reopenedContext.project.loadProject(persisted, false, { preserveRevision: revision });
      reopenedContext.project.id.value = target.projectId;
    }, reopenedContext);
    this.targetContexts.set(target.projectId, reopenedContext);
    const reopenedAdapter = createAutomationAdapter({
      targetRegistry: new Map([[target.projectId, reopenedContext]]),
      repository: this.repository,
      saveService: this.saveService,
    });
    if (!reopenedAdapter.negotiateCatalog({ version: '1.0' }).ok) {
      throw new Error(`Fixture ${label} reopen negotiation failed.`);
    }
    return { context: reopenedContext, adapter: reopenedAdapter };
  }

  private async beginJourney(): Promise<FixtureJourneyStart> {
    const negotiation = await requestSuccess<CatalogNegotiation>(this.adapter, {
      operation: 'catalog.negotiate',
      version: '1.0',
    });
    const initialRevision = (await requestSuccess<{
      readonly type: 'project.target';
      readonly revision: number;
    }>(this.adapter, {
      operation: 'project.target',
      target: this.target,
    })).revision;
    const observation = await requestSuccess<ProjectObservation>(this.adapter, {
      operation: 'project.observe',
      target: this.target,
      expectedRevision: initialRevision,
    });
    const render = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target: this.target,
      expectedRevision: observation.revision,
      frameId: observation.currentFrameId,
    });
    return {
      negotiation,
      initial: {
        observation,
        render,
        document: await this.serializeDocument(),
      },
    };
  }

  private async beginFixtureRun(): Promise<{
    readonly negotiation: CatalogNegotiation;
    readonly initialRevision: number;
  }> {
    await this.initialize();
    const negotiation = await requestSuccess<CatalogNegotiation>(this.adapter, {
      operation: 'catalog.negotiate',
      version: '1.0',
    });
    const initialRevision = (await requestSuccess<{
      readonly type: 'project.target';
      readonly revision: number;
    }>(this.adapter, { operation: 'project.target', target: this.target })).revision;
    return { negotiation, initialRevision };
  }

  private async completeHistoryJourney(
    afterObservation: ProjectObservation,
  ): Promise<FixtureHistoryReplay> {
    const undoTransition = await requestSuccess<HistoryTransitionResult>(this.adapter, {
      operation: 'project.history.undo',
      target: this.target,
      expectedRevision: afterObservation.revision,
    });
    const afterUndoObservation = await requestSuccess<ProjectObservation>(this.adapter, {
      operation: 'project.observe',
      target: this.target,
      expectedRevision: undoTransition.revision,
    });
    const afterUndoRender = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target: this.target,
      expectedRevision: afterUndoObservation.revision,
      frameId: afterUndoObservation.currentFrameId,
    });
    const afterUndoDocument = await this.serializeDocument();

    const redoTransition = await requestSuccess<HistoryTransitionResult>(this.adapter, {
      operation: 'project.history.redo',
      target: this.target,
      expectedRevision: afterUndoObservation.revision,
    });
    const afterRedoObservation = await requestSuccess<ProjectObservation>(this.adapter, {
      operation: 'project.observe',
      target: this.target,
      expectedRevision: redoTransition.revision,
    });
    const afterRedoRender = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target: this.target,
      expectedRevision: afterRedoObservation.revision,
      frameId: afterRedoObservation.currentFrameId,
    });
    const afterRedoDocument = await this.serializeDocument();

    const save = await requestSuccess<SaveResult>(this.adapter, {
      operation: 'project.save',
      target: this.target,
      expectedRevision: afterRedoObservation.revision,
    });
    const reload = await requestSuccess<ReloadResult>(this.adapter, {
      operation: 'project.reload',
      target: this.target,
      expectedRevision: afterRedoObservation.revision,
    });
    const reloadedRender = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target: this.target,
      expectedRevision: reload.revision,
      frameId: reload.observation.currentFrameId,
    });
    const reloadedDocument = await this.serializeDocument();

    return {
      afterUndo: {
        transition: undoTransition,
        observation: afterUndoObservation,
        render: afterUndoRender,
        document: afterUndoDocument,
      },
      afterRedo: {
        transition: redoTransition,
        observation: afterRedoObservation,
        render: afterRedoRender,
        document: afterRedoDocument,
      },
      save,
      reload,
      reloadedRender,
      reloadedDocument,
    };
  }

  dispose(): void {
    for (const context of this.targetContexts.values()) {
      this.saveService.stop(context);
      if (context === this.context ? this.ownsContext : true) context.dispose();
    }
    this.targetContexts.clear();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    const project = createFixtureProject();
    await this.saveService.runWithoutSaving(async () => {
      await this.context.project.loadProject(project);
      this.context.project.id.value = this.target.projectId;
    }, this.context);
    seedFixturePixel(this.context);
    this.initialized = true;
  }

  private async saveAssetPackageRevision(
    prepare?: () => void,
  ): Promise<{
    readonly negotiation: CatalogNegotiation;
    readonly save: SaveResult;
    readonly packageRequest: Record<string, unknown>;
    readonly persistedDocument: ProjectFile;
  }> {
    await this.initialize();
    prepare?.();
    const negotiation = this.adapter.negotiateCatalog({ version: '1.0' });
    if (!negotiation.ok) throw new Error(`Fixture catalog negotiation failed: ${negotiation.error.code}`);
    const initial = await this.observeTarget(this.adapter, this.context.project.revision.value);
    const save = await requestSuccess<SaveResult>(this.adapter, {
      operation: 'project.save',
      target: this.target,
      expectedRevision: initial.revision,
    });
    const persistedInput = await this.repository.load(this.target.projectId);
    if (!persistedInput) throw new Error('Asset package fixture did not persist its project.');
    const persistedDocument = decodeProjectFile(persistedInput);
    return {
      negotiation: negotiation.result,
      save,
      persistedDocument,
      packageRequest: {
        operation: 'project.asset-package.prepare',
        target: this.target,
        expectedRevision: save.revision,
        expectedSaveSafety: save.saveSafety,
        expectedPackageDigest: null,
      },
    };
  }

  private async prepareAssetPackageJourney(
    prepare: (() => void) | undefined,
    options: FixtureAssetPackageJourneyOptions,
  ): Promise<PreparedAssetPackageJourney> {
    const { negotiation, save, packageRequest, persistedDocument } = await this.saveAssetPackageRevision(prepare);
    const inactiveContext = await this.createInactiveFixtureContext(`${this.target.projectId}-inactive`);
    seedInactiveFixturePixel(inactiveContext);
    this.targetContexts.set(`${this.target.projectId}-inactive`, inactiveContext);
    const inactiveBefore = await snapshotProject(inactiveContext);
    const packagePreparation = options.switchActiveTabDuringPreparation
      ? await this.prepareAssetPackageDuringActiveTabSwitch(
        packageRequest,
        inactiveContext,
        options.afterPackagePreparation,
      )
      : {
        assetPackage: await requestSuccess<AssetPackageResult>(this.adapter, packageRequest),
        activeTabSwitched: false,
      };
    const { assetPackage, activeTabSwitched } = packagePreparation;
    if (!options.switchActiveTabDuringPreparation) {
      await options.afterPackagePreparation?.(assetPackage, packageRequest);
    }
    const replay = await requestSuccess<AssetPackageResult>(this.adapter, {
      ...packageRequest,
      expectedPackageDigest: assetPackage.packageDigest,
    });
    return {
      negotiation,
      save,
      packageRequest,
      persistedDocument,
      inactiveContext,
      inactiveBefore,
      assetPackage,
      replay,
      activeTabSwitched,
    };
  }

  private async prepareAssetPackageDuringActiveTabSwitch(
    packageRequest: Record<string, unknown>,
    inactiveContext: ProjectContext,
    afterPackagePreparation: FixtureAssetPackageJourneyOptions['afterPackagePreparation'],
  ): Promise<AssetPackagePreparationCheckpoint> {
    const previousActiveContext = getActiveProjectContext();
    const originalSaveProject = this.context.project.saveProject.bind(this.context.project);
    let activeTabSwitched = false;
    this.context.project.saveProject = async (...args: Parameters<typeof originalSaveProject>) => {
      const saved = await originalSaveProject(...args);
      setActiveProjectContext(inactiveContext);
      activeTabSwitched = getActiveProjectContext() === inactiveContext;
      return saved;
    };
    setActiveProjectContext(this.context);
    try {
      const assetPackage = await requestSuccess<AssetPackageResult>(this.adapter, packageRequest);
      await afterPackagePreparation?.(assetPackage, packageRequest);
      return { assetPackage, activeTabSwitched };
    } finally {
      this.context.project.saveProject = originalSaveProject;
      setActiveProjectContext(previousActiveContext.isDisposed ? defaultProjectContext : previousActiveContext);
    }
  }

  private async completeAssetPackageJourney(
    packageRequest: Record<string, unknown>,
    source: AssetPackageArtifact,
    inactiveContext: ProjectContext,
    roundTripProjectId = 'fixture-round-trip',
    expectedRevision: number,
  ): Promise<{
    readonly sourceRoundTrip: AssetPackageSourceRoundTrip;
    readonly inactiveAfter: ProjectFile;
    readonly rebound: boolean;
    readonly reload: ReloadResult;
    readonly reloadedDocument: ProjectFile;
  }> {
    const sourceRoundTrip = await this.reopenAssetPackageSource(source, roundTripProjectId);
    const inactiveAfter = await snapshotProject(inactiveContext);
    const rebound = await this.reboundAssetPackage(packageRequest);
    const reload = await requestSuccess<ReloadResult>(this.adapter, {
      operation: 'project.reload',
      target: this.target,
      expectedRevision,
    });
    const reloadedDocument = await this.serializeDocument();
    return { sourceRoundTrip, inactiveAfter, rebound, reload, reloadedDocument };
  }

  private async reopenAssetPackageSource(
    source: AssetPackageArtifact,
    projectId: string,
  ): Promise<AssetPackageSourceRoundTrip> {
    const sourceInput = JSON.parse(pako.inflate(source.bytes, { to: 'string' })) as ProjectFileInput;
    const project = decodeProjectFile(sourceInput);
    const context = createProjectContext();
    try {
      await this.saveService.runWithoutSaving(async () => {
        await context.project.loadProject(project);
        context.project.id.value = projectId;
      }, context);
      const document = await snapshotProject(context);
      const renders = context.animation.frames.value.map((frame) => renderProjectPixels(context, frame.id));
      return { project, document, renders };
    } finally {
      this.saveService.stop(context);
      context.dispose();
    }
  }

  private async reboundAssetPackage(request: Record<string, unknown>): Promise<boolean> {
    const reboundContext = await this.createInactiveFixtureContext(`${this.target.projectId}-rebound`);
    reboundContext.project.id.value = this.target.projectId;
    reboundContext.project.name.value = 'Rebound Package Project';
    seedInactiveFixturePixel(reboundContext);
    const originalBefore = await snapshotProject(this.context);
    const reboundBefore = await snapshotProject(reboundContext);
    const originalSaveProject = this.context.project.saveProject.bind(this.context.project);
    this.context.project.saveProject = async (...args: Parameters<typeof originalSaveProject>) => {
      const saved = await originalSaveProject(...args);
      this.targetContexts.set(this.target.projectId, reboundContext);
      return saved;
    };
    let failure: AutomationFailure;
    try {
      failure = await requestFailure(this.adapter, request);
    } finally {
      this.context.project.saveProject = originalSaveProject;
      this.targetContexts.set(this.target.projectId, this.context);
    }
    const originalAfter = await snapshotProject(this.context);
    const reboundAfter = await snapshotProject(reboundContext);
    this.saveService.stop(reboundContext);
    reboundContext.dispose();
    return failure.error.code === 'target_not_found'
      && sameProjectFile(originalBefore, originalAfter)
      && sameProjectFile(reboundBefore, reboundAfter);
  }

  private async serializeDocument(): Promise<ProjectFile> {
    return structuredClone(await this.context.project.saveProject());
  }
}

export function createFixtureSession(options: FixtureSessionOptions = {}): FixtureSession {
  return new FixtureSession(options);
}

function createFixtureProject(): ProjectFile {
  const layerId = 'fixture-layer';
  const frameId = 'fixture-frame';
  return {
    version: PROJECT_VERSION,
    name: 'Fixture Project',
    width: 4,
    height: 4,
    palette: ['#000000', '#ff0000', '#00ff00'],
    paletteEntries: [
      { id: 'fixture-palette-transparent', color: '#000000' },
      { id: 'fixture-palette-red', color: '#ff0000' },
      { id: 'fixture-palette-green', color: '#00ff00' },
    ],
    layers: [{
      id: layerId,
      name: 'Artwork',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      continuous: false,
      parentId: null,
      data: new Uint8Array(0),
    }],
    frames: [{
      id: frameId,
      duration: 100,
      cels: [{
        id: 'fixture-cel',
        layerId,
        data: new Uint8Array(0),
        opacity: 100,
      }],
    }],
    animation: { fps: 12, currentFrameIndex: 0 },
    tags: [],
  };
}

// fallow-ignore-next-line complexity -- This browser fixture keeps the layer, blend, and reference cases together.
// fallow-ignore-next-line code-duplication -- Canvas setup intentionally follows the existing deterministic fixture shape.
function prepareRenderObservationFixture(context: ProjectContext): void {
  if (context.layers.layers.value.some((layer) => layer.id === 'fixture-overlay')) return;

  const frame = context.animation.frames.value[0];
  const baseLayer = context.layers.layers.value[0];
  if (!frame || !baseLayer) throw new Error('Render observation fixture has no base layer.');

  // fallow-ignore-next-line code-duplication -- This setup mirrors the established canvas-backed fixture contract.
  const canvas = document.createElement('canvas');
  canvas.width = context.project.width.value;
  canvas.height = context.project.height.value;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Render observation fixture could not create an overlay canvas.');
  drawing.fillStyle = '#0000ff';
  drawing.fillRect(0, 0, 1, 1);
  drawing.fillRect(1, 1, 1, 1);

  const overlayLayer: Layer = {
    id: 'fixture-overlay',
    name: 'Overlay',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 128,
    blendMode: 'multiply',
    parentId: null,
    continuous: false,
    canvas,
  };
  const referenceLayer: Layer = {
    id: 'fixture-reference',
    name: 'Visible Reference',
    type: 'reference',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    referenceData: {
      bytes: new Uint8Array([255, 0, 255, 255]),
      mimeType: 'image/png',
      x: 0,
      y: 0,
      scale: 1,
      position: 'above',
    },
  };
  const overlayCel: Cel = {
    id: 'fixture-overlay-cel',
    layerId: overlayLayer.id,
    frameId: frame.id,
    canvas,
    indexBuffer: new Uint8Array(canvas.width * canvas.height),
    opacity: 100,
  };

  context.layers.layers.value = [baseLayer, overlayLayer, referenceLayer];
  const cels = new Map(context.animation.cels.value);
  cels.set(context.animation.getCelKey(overlayLayer.id, frame.id), overlayCel);
  context.animation.cels.value = cels;
  context.animation.syncLayerCanvases();
}

function prepareInactiveAnimationObservationFixture(context: ProjectContext): void {
  const frames = context.animation.frames.value;
  const firstFrame = frames[0];
  const imageLayer = context.layers.layers.value.find((layer) => layer.type === 'image');
  if (!firstFrame || !imageLayer) throw new Error('Inactive animation fixture is incomplete.');
  const firstCel = context.animation.cels.value.get(context.animation.getCelKey(imageLayer.id, firstFrame.id));
  if (!firstCel) throw new Error('Inactive animation fixture has no first cel.');
  const drawing = firstCel.canvas.getContext('2d');
  if (!drawing) throw new Error('Inactive animation fixture could not create a canvas context.');
  drawing.fillStyle = '#0000ff';
  drawing.fillRect(3, 3, 1, 1);
  context.animation.frames.value = frames.map((frame, index) => ({
    ...frame,
    duration: [140, 220, 300][index] ?? frame.duration,
  }));
}

// fallow-ignore-next-line complexity -- This fixture deliberately describes the three exact raster states used by the public bundle journey.
function prepareAnimationObservationFixture(context: ProjectContext): void {
  const baseLayer = context.layers.layers.value.find((layer) => layer.type === 'image');
  if (!baseLayer) throw new Error('Animation observation fixture has no image layer.');
  const width = context.project.width.value;
  const height = context.project.height.value;
  const frames: Frame[] = [
    { id: 'fixture-animation-preview-frame-1', order: 0, duration: 100 },
    { id: 'fixture-animation-preview-frame-2', order: 1, duration: 180 },
    { id: 'fixture-animation-preview-frame-3', order: 2, duration: 260 },
  ];
  const cels = new Map<string, Cel>();
  const pixels = [
    [{ x: 0, y: 0, color: '#ff0000', index: 2 }],
    [
      { x: 0, y: 0, color: '#00ff00', index: 3 },
      { x: 1, y: 0, color: '#ff0000', index: 2 },
    ],
    [
      { x: 0, y: 0, color: '#ff0000', index: 2 },
      { x: 2, y: 0, color: '#00ff00', index: 3 },
    ],
  ];
  frames.forEach((frame, frameIndex) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('Animation observation fixture could not create a canvas.');
    const indexBuffer = new Uint8Array(width * height);
    for (const pixel of pixels[frameIndex] ?? []) {
      drawing.fillStyle = pixel.color;
      drawing.fillRect(pixel.x, pixel.y, 1, 1);
      indexBuffer[pixel.y * width + pixel.x] = pixel.index;
    }
    cels.set(context.animation.getCelKey(baseLayer.id, frame.id), {
      id: `fixture-animation-preview-cel-${frameIndex + 1}`,
      layerId: baseLayer.id,
      frameId: frame.id,
      canvas,
      indexBuffer,
      opacity: 100,
    });
    if (frameIndex === 0) baseLayer.canvas = canvas;
  });
  const referenceLayer: Layer = {
    id: 'fixture-animation-preview-reference',
    name: 'Visible Preview Reference',
    type: 'reference',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    referenceData: {
      bytes: new Uint8Array([255, 0, 255, 255]),
      mimeType: 'image/png',
      x: 0,
      y: 0,
      scale: 1,
      position: 'above',
    },
  };
  context.layers.layers.value = [baseLayer, referenceLayer];
  context.animation.frames.value = frames;
  context.animation.cels.value = cels;
  context.animation.tags.value = [{
    id: 'fixture-animation-preview-tag',
    name: 'Preview Motion',
    color: '#123456',
    startFrameIndex: 1,
    endFrameIndex: 2,
    collapsed: false,
  }];
  context.animation.currentFrameId.value = frames[0]!.id;
  context.animation.syncLayerCanvases();
}

function seedFixturePixel(context: ProjectContext): void {
  const layer = context.layers.layers.value[0];
  const frame = context.animation.frames.value[0];
  if (!layer || !frame) throw new Error('Fixture project did not load its artwork.');

  const cel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frame.id));
  if (!cel) throw new Error('Fixture project did not load its cel.');

  const drawing = cel.canvas.getContext('2d');
  if (!drawing) throw new Error('Fixture project could not create a drawing context.');
  drawing.fillStyle = '#ff0000';
  drawing.fillRect(1, 1, 1, 1);

  const indexBuffer = new Uint8Array(cel.canvas.width * cel.canvas.height);
  indexBuffer[cel.canvas.width + 1] = 2;
  context.animation.updateCelIndexBuffer(layer.id, frame.id, indexBuffer);
  context.animation.syncLayerCanvases();
}

function seedInactiveFixturePixel(context: ProjectContext): void {
  const frame = context.animation.frames.value[0];
  const layer = context.layers.layers.value[0];
  if (!frame || !layer) throw new Error('Inactive fixture project did not load its artwork.');
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frame.id));
  if (!cel) throw new Error('Inactive fixture project did not load its cel.');
  const drawing = cel.canvas.getContext('2d');
  if (!drawing) throw new Error('Inactive fixture project could not create a drawing context.');
  drawing.fillStyle = '#00ff00';
  drawing.fillRect(0, 0, 1, 1);
}

function prepareStructureRefinementFixture(context: ProjectContext): void {
  const firstFrame = context.animation.frames.value[0];
  if (!firstFrame) throw new Error('Refinement fixture did not load its first frame.');
  const frames = createRefinementFrames(firstFrame);
  const layers = createRefinementLayers();
  const cels = createRefinementCels(context, frames, layers);
  context.layers.layers.value = layers;
  context.layers.activeLayerId.value = 'fixture-refinement-bottom';
  context.animation.frames.value = frames;
  context.animation.cels.value = cels;
  context.animation.currentFrameId.value = frames[0].id;
  context.animation.syncLayerCanvases();
}

function createRefinementFrames(firstFrame: Frame): Frame[] {
  return [
    { ...firstFrame, id: 'fixture-refinement-frame-1', order: 0, duration: 100 },
    { ...firstFrame, id: 'fixture-refinement-frame-2', order: 1, duration: 125 },
  ];
}

function createRefinementLayers(): Layer[] {
  return [
    makeRefinementLayer('fixture-refinement-old-group', 'Old Group', 'group', null),
    makeRefinementLayer('fixture-refinement-bottom', 'Bottom', 'image', 'fixture-refinement-old-group'),
    makeRefinementLayer('fixture-refinement-source', 'Merge source', 'image', null),
    makeRefinementLayer('fixture-refinement-target', 'Merge target', 'image', null),
    makeRefinementLayer('fixture-refinement-empty', 'Empty', 'image', null),
  ];
}

function createRefinementCels(
  context: ProjectContext,
  frames: readonly Frame[],
  layers: readonly Layer[],
): Map<string, Cel> {
  const pixels = new Map<string, { readonly x: number; readonly y: number }>([
    ['fixture-refinement-bottom', { x: 0, y: 0 }],
    ['fixture-refinement-source', { x: 1, y: 0 }],
    ['fixture-refinement-target', { x: 2, y: 0 }],
  ]);
  const cels = new Map<string, Cel>();
  for (const frame of frames) {
    for (const layer of layers) {
      cels.set(context.animation.getCelKey(layer.id, frame.id), createRefinementCel(context, frame, layer, pixels));
    }
  }
  return cels;
}

function createRefinementCel(
  context: ProjectContext,
  frame: Frame,
  layer: Layer,
  pixels: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
): Cel {
  const canvas = document.createElement('canvas');
  canvas.width = context.project.width.value;
  canvas.height = context.project.height.value;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Refinement fixture could not create a canvas.');
  const point = pixels.get(layer.id);
  const y = frame.id.endsWith('2') ? 1 : point?.y;
  if (point && y !== undefined) {
    drawing.fillStyle = '#ff0000';
    drawing.fillRect(point.x, y, 1, 1);
  }
  const indexBuffer = new Uint8Array(canvas.width * canvas.height);
  if (point && y !== undefined) indexBuffer[y * canvas.width + point.x] = 2;
  return {
    id: `fixture-refinement-cel-${layer.id}-${frame.id}`,
    layerId: layer.id,
    frameId: frame.id,
    canvas,
    indexBuffer,
    opacity: 100,
  };
}

function makeRefinementLayer(
  id: string,
  name: string,
  type: Layer['type'],
  parentId: string | null,
): Layer {
  return {
    id,
    name,
    type,
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId,
    continuous: false,
  };
}

function cloneProject<T extends ProjectFileInput>(project: T): T {
  return structuredClone(project);
}

async function requestSuccess<T>(adapter: AutomationAdapter, input: Record<string, unknown>): Promise<T> {
  const result = await adapter.request(input);
  if (!result.ok) throw new Error(`Fixture adapter request failed: ${result.error.code}`);
  return result.result as T;
}

async function requestFailure(
  adapter: AutomationAdapter,
  input: Record<string, unknown>,
): Promise<AutomationFailure> {
  const result = await adapter.request(input);
  if (result.ok) throw new Error('Fixture adapter request unexpectedly succeeded.');
  return result;
}

async function snapshotProject(context: ProjectContext): Promise<ProjectFile> {
  return structuredClone(await context.project.saveProject({ rebuildIndexBuffers: false }));
}

async function requestAnimationTransaction(
  adapter: AutomationAdapter,
  target: { readonly projectId: string },
  observation: ProjectObservation,
  child: {
    readonly command: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly operationId: string;
  },
): Promise<EditorTransactionResult> {
  return requestSuccess<EditorTransactionResult>(adapter, {
    operation: 'project.transaction.execute',
    profile: 'animation',
    target,
    expectedRevision: observation.revision,
    provenance: {
      clientId: 'fixture-animation-client',
      sessionId: 'fixture-animation-session',
      runId: 'fixture-animation-run',
      operationId: child.operationId,
    },
    children: [{ command: child.command, input: child.input }],
  });
}

function sameProjectFile(first: ProjectFile, second: ProjectFile): boolean {
  return JSON.stringify(first, projectJsonReplacer) === JSON.stringify(second, projectJsonReplacer);
}

function projectJsonReplacer(_key: string, value: unknown): unknown {
  return value instanceof Uint8Array ? Array.from(value) : value;
}

function exactAssetPackageReload(
  save: SaveResult,
  reload: ReloadResult,
  persistedDocument: ProjectFile,
  sourceRoundTrip: AssetPackageSourceRoundTrip,
  reloadedDocument: ProjectFile,
): { readonly persistedSource: boolean; readonly reload: boolean } {
  return {
    persistedSource: sameProjectFile(sourceRoundTrip.project, persistedDocument)
      && sameProjectFile(sourceRoundTrip.document, reloadedDocument),
    reload: reload.revision === save.revision
      && reload.observation.revision === save.revision
      && sameProjectFile(reloadedDocument, sourceRoundTrip.document),
  };
}

function assetPackageIdentityEvidence(
  assetPackage: AssetPackageResult,
  target: { readonly projectId: string },
  activeTabSwitched: boolean,
): { readonly activeTab: boolean; readonly target: boolean; readonly bytes: boolean } {
  return {
    activeTab: activeTabSwitched,
    target: assetPackage.target.projectId === target.projectId,
    bytes: assetPackage.artifacts.length > 0 && assetPackage.artifacts.every((artifact) => (
      artifact.bytes instanceof Uint8Array && artifact.byteLength === artifact.bytes.byteLength
    )),
  };
}

async function independentlyVerifyAssetPackage(assetPackage: AssetPackageResult): Promise<boolean> {
  for (const artifact of assetPackage.artifacts) {
    const digest = await digestBytesForFixture(artifact.bytes);
    if (digest !== artifact.digest || artifact.byteLength !== artifact.bytes.byteLength) return false;
  }
  const manifestArtifact = assetPackage.artifacts.find((artifact) => artifact.role === 'manifest');
  if (!manifestArtifact) return false;
  const manifestBytes = new TextEncoder().encode(JSON.stringify(assetPackage.manifest));
  if (!sameBytes(manifestBytes, manifestArtifact.bytes)) return false;
  if (await digestBytesForFixture(manifestArtifact.bytes) !== assetPackage.manifestDigest) return false;

  const descriptor = new TextEncoder().encode(JSON.stringify({
    type: assetPackage.type,
    contractVersion: assetPackage.contractVersion,
    target: assetPackage.target,
    revision: assetPackage.revision,
    artifacts: assetPackage.artifacts.map((artifact) => ({
      role: artifact.role,
      filename: artifact.filename,
      mediaType: artifact.mediaType,
      byteLength: artifact.byteLength,
      digest: artifact.digest,
    })),
  }));
  const total = descriptor.byteLength + 1 + assetPackage.artifacts.reduce(
    (sum, artifact) => sum + artifact.bytes.byteLength,
    0,
  );
  const binding = new Uint8Array(total);
  binding.set(descriptor);
  let offset = descriptor.byteLength;
  binding[offset++] = 0;
  for (const artifact of assetPackage.artifacts) {
    binding.set(artifact.bytes, offset);
    offset += artifact.bytes.byteLength;
  }
  return await digestBytesForFixture(binding) === assetPackage.packageDigest;
}

async function digestBytesForFixture(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function sameProjectFileIgnoringEmptyIndices(first: ProjectFile, second: ProjectFile): boolean {
  return sameProjectFile(removeEmptyIndexData(first), removeEmptyIndexData(second));
}

function removeEmptyIndexData(project: ProjectFile): ProjectFile {
  const copy = structuredClone(project);
  for (const frame of copy.frames) {
    for (const cel of frame.cels) {
      if (cel.indexData?.every((index) => index === 0)) {
        delete cel.indexData;
      }
    }
  }
  return copy;
}

function renderProjectPixels(context: ProjectContext, frameId: string): Uint8Array {
  const render = renderProject(context, { projectId: context.project.id.value }, frameId);
  if ('ok' in render) throw new Error(`Fixture render failed: ${render.error.code}`);
  return new Uint8Array(render.pixels);
}

function cropRenderPixels(
  pixels: Uint8Array,
  width: number,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Uint8Array {
  const cropped = new Uint8Array(region.width * region.height * 4);
  for (let row = 0; row < region.height; row += 1) {
    const sourceStart = ((region.y + row) * width + region.x) * 4;
    const targetStart = row * region.width * 4;
    cropped.set(pixels.subarray(sourceStart, sourceStart + region.width * 4), targetStart);
  }
  return cropped;
}

// fallow-ignore-next-line complexity -- Exact fixture comparison keeps every public render field visible.
function sameRender(first: RenderObservation, second: RenderObservation): boolean {
  return first.target.projectId === second.target.projectId
    && first.frameId === second.frameId
    && JSON.stringify(first.source) === JSON.stringify(second.source)
    && JSON.stringify(first.region) === JSON.stringify(second.region)
    && JSON.stringify(first.background) === JSON.stringify(second.background)
    && first.scale === second.scale
    && first.width === second.width
    && first.height === second.height
    && first.format === second.format
    && first.stride === second.stride
    && sameBytes(first.pixels, second.pixels);
}

function sameRenders(first: readonly RenderObservation[], second: readonly RenderObservation[]): boolean {
  return first.length === second.length && first.every((render, index) => {
    const other = second[index];
    return !!other && sameRender(render, other);
  });
}

function sameAnimationStructure(first: ProjectObservation, second: ProjectObservation): boolean {
  return first.currentFrameId === second.currentFrameId
    && JSON.stringify(first.frames) === JSON.stringify(second.frames)
    && JSON.stringify(first.tags) === JSON.stringify(second.tags)
    && JSON.stringify(first.layers) === JSON.stringify(second.layers);
}

function sameStructure(first: ProjectObservation, second: ProjectObservation): boolean {
  return first.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    type: layer.type,
    parentId: layer.parentId,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
  })).every((layer, index) => {
    const other = second.layers[index];
    return other !== undefined && JSON.stringify(layer) === JSON.stringify({
      id: other.id,
      name: other.name,
      type: other.type,
      parentId: other.parentId,
      visible: other.visible,
      locked: other.locked,
      opacity: other.opacity,
      blendMode: other.blendMode,
    });
  }) && first.layers.length === second.layers.length
    && JSON.stringify(first.palette) === JSON.stringify(second.palette);
}

function makeStaticStructureRequest(
  target: { readonly projectId: string },
  observation: ProjectObservation,
): Record<string, unknown> {
  const baseLayer = observation.layers.find((layer) => layer.type === 'image');
  if (!baseLayer) throw new Error('Fixture project has no image layer.');
  return {
    operation: 'project.transaction.execute',
    profile: 'static-structure',
    target,
    expectedRevision: observation.revision,
    provenance: {
      clientId: 'fixture-static-client',
      sessionId: 'fixture-static-session',
      runId: 'fixture-static-run',
      operationId: 'fixture-static-structure',
    },
    children: [
      {
        command: 'project.palette.declaration',
        input: {
          kind: 'palette.declaration',
          entries: observation.palette.map(({ id, color }) => ({ id, color })),
        },
      },
      {
        command: 'project.layer.tree',
        input: {
          kind: 'layer-tree.declaration',
          layers: [
            {
              id: 'fixture-static-group',
              name: 'Static Group',
              type: 'group',
              parentId: null,
              visible: true,
              locked: false,
              opacity: 255,
              blendMode: 'normal',
              continuous: false,
            },
            {
              id: baseLayer.id,
              name: 'Static Base',
              type: 'image',
              parentId: 'fixture-static-group',
              visible: baseLayer.visible,
              locked: baseLayer.locked,
              opacity: baseLayer.opacity,
              blendMode: baseLayer.blendMode,
              continuous: baseLayer.continuous,
            },
            {
              id: 'fixture-static-added',
              name: 'Static Added',
              type: 'image',
              parentId: 'fixture-static-group',
              visible: true,
              locked: false,
              opacity: 255,
              blendMode: 'normal',
              continuous: false,
            },
          ],
        },
      },
    ],
  };
}

async function replayStaticHistory(
  adapter: AutomationAdapter,
  target: { readonly projectId: string },
  afterTransactionObservation: ProjectObservation,
  context: ProjectContext,
): Promise<{
  readonly afterUndo: FixtureStaticStructureJourneyResult['afterUndo'];
  readonly afterRedo: FixtureStaticStructureJourneyResult['afterRedo'];
}> {
  const undoTransition = await requestSuccess<HistoryTransitionResult>(adapter, {
    operation: 'project.history.undo',
    target,
    expectedRevision: afterTransactionObservation.revision,
  });
  const afterUndoObservation = await requestSuccess<ProjectObservation>(adapter, {
    operation: 'project.observe',
    target,
    expectedRevision: undoTransition.revision,
  });
  const afterUndoRender = await requestSuccess<RenderObservation>(adapter, {
    operation: 'project.render.observe',
    target,
    expectedRevision: afterUndoObservation.revision,
    frameId: afterUndoObservation.currentFrameId,
  });
  const afterUndoDocument = structuredClone(
    await context.project.saveProject({ rebuildIndexBuffers: false }),
  );
  const redoTransition = await requestSuccess<HistoryTransitionResult>(adapter, {
    operation: 'project.history.redo',
    target,
    expectedRevision: afterUndoObservation.revision,
  });
  const afterRedoObservation = await requestSuccess<ProjectObservation>(adapter, {
    operation: 'project.observe',
    target,
    expectedRevision: redoTransition.revision,
  });
  const afterRedoRender = await requestSuccess<RenderObservation>(adapter, {
    operation: 'project.render.observe',
    target,
    expectedRevision: afterRedoObservation.revision,
    frameId: afterRedoObservation.currentFrameId,
  });
  const afterRedoDocument = structuredClone(
    await context.project.saveProject({ rebuildIndexBuffers: false }),
  );
  return {
    afterUndo: {
      transition: undoTransition,
      observation: afterUndoObservation,
      render: afterUndoRender,
      document: afterUndoDocument,
    },
    afterRedo: {
      transition: redoTransition,
      observation: afterRedoObservation,
      render: afterRedoRender,
      document: afterRedoDocument,
    },
  };
}

async function settleEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
