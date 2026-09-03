import {
  ProjectAlreadyExistsError,
  type ProjectRepository,
  type ProjectMeta,
  type WorkspaceState,
} from '../services/persistence/project-repository';
import { AutoSaveService, createAutoSaveService } from '../services/auto-save';
import { createProjectContext, type ProjectContext } from '../stores/project-context';
import { PROJECT_VERSION, type ProjectFile, type ProjectFileInput } from '../types/project';
import {
  AutomationAdapter,
  createAutomationAdapter,
  type CatalogNegotiation,
  type CanvasResizeExecutionResult,
  type CanvasResizePreviewResult,
  type HistoryTransitionResult,
  type ProjectCreateResult,
  type ReloadResult,
  type SaveResult,
} from './automation-adapter';
import type { ProjectObservation, RenderObservation } from './observations';
import type { EditorTransactionResult } from './transaction';
import type { Cel, Frame } from '../types/animation';
import type { Layer } from '../types/layer';

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
    await this.initialize();
    const negotiation = await requestSuccess<CatalogNegotiation>(this.adapter, {
      operation: 'catalog.negotiate',
      version: '1.0',
    });
    const initialRevision = (await requestSuccess<{
      readonly type: 'project.target';
      readonly revision: number;
    }>(this.adapter, { operation: 'project.target', target: this.target })).revision;
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

  private async observeTarget(
    adapter: AutomationAdapter,
    revision: number,
    target: { readonly projectId: string } = this.target,
  ): Promise<ProjectObservation> {
    return requestSuccess<ProjectObservation>(adapter, {
      operation: 'project.observe', target, expectedRevision: revision,
    });
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
    palette: ['#000000', '#ff0000'],
    paletteEntries: [
      { id: 'fixture-palette-transparent', color: '#000000' },
      { id: 'fixture-palette-red', color: '#ff0000' },
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
  return JSON.stringify(first, (_, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value
  ) === JSON.stringify(second, (_, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value
  );
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

function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function sameRender(first: RenderObservation, second: RenderObservation): boolean {
  return first.target.projectId === second.target.projectId
    && first.frameId === second.frameId
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
