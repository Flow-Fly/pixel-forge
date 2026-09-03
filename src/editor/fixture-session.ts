import type { ProjectRepository, ProjectMeta, WorkspaceState } from '../services/persistence/project-repository';
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
  type ReloadResult,
  type SaveResult,
} from './automation-adapter';
import type { ProjectObservation, RenderObservation } from './observations';

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
    this.adapter = createAutomationAdapter({
      targetRegistry: new Map([[projectId, this.context]]),
      saveService: this.saveService,
      repository: this.repository,
    });
  }

  async run(): Promise<FixtureJourneyResult> {
    await this.initialize();

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
    const initialObservation = await requestSuccess<ProjectObservation>(this.adapter, {
      operation: 'project.observe',
      target: this.target,
      expectedRevision: initialRevision,
    });
    const initialRender = await requestSuccess<RenderObservation>(this.adapter, {
      operation: 'project.render.observe',
      target: this.target,
      expectedRevision: initialObservation.revision,
      frameId: initialObservation.currentFrameId,
    });
    const initialDocument = await this.serializeDocument();

    const resizeRequest = {
      target: this.target,
      expectedRevision: initialObservation.revision,
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

    const undoTransition = await requestSuccess<HistoryTransitionResult>(this.adapter, {
      operation: 'project.history.undo',
      target: this.target,
      expectedRevision: afterResizeObservation.revision,
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
      negotiation,
      initial: { observation: initialObservation, render: initialRender },
      resize: { preview: resizePreview, execution: resizeExecution },
      afterResize: { observation: afterResizeObservation, render: afterResizeRender },
      afterUndo: {
        transition: undoTransition,
        observation: afterUndoObservation,
        render: afterUndoRender,
      },
      afterRedo: {
        transition: redoTransition,
        observation: afterRedoObservation,
        render: afterRedoRender,
      },
      save,
      reload,
      exact: {
        document: sameProjectFile(initialDocument, afterUndoDocument)
          && sameProjectFile(resizedDocument, afterRedoDocument)
          && sameProjectFile(afterRedoDocument, reloadedDocument),
        render: sameRender(initialRender, afterUndoRender)
          && sameRender(afterResizeRender, afterRedoRender)
          && sameRender(afterRedoRender, reloadedRender),
      },
    };
  }

  dispose(): void {
    this.saveService.stop(this.context);
    if (this.ownsContext) this.context.dispose();
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

function cloneProject<T extends ProjectFileInput>(project: T): T {
  return structuredClone(project);
}

async function requestSuccess<T>(adapter: AutomationAdapter, input: Record<string, unknown>): Promise<T> {
  const result = await adapter.request(input);
  if (!result.ok) throw new Error(`Fixture adapter request failed: ${result.error.code}`);
  return result.result as T;
}

function sameProjectFile(first: ProjectFile, second: ProjectFile): boolean {
  return JSON.stringify(first, (_, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value
  ) === JSON.stringify(second, (_, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value
  );
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

async function settleEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
