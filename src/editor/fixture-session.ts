import type { ProjectRepository, ProjectMeta, WorkspaceState } from '../services/persistence/project-repository';
import { AutoSaveService, createAutoSaveService } from '../services/auto-save';
import { createProjectContext, type ProjectContext } from '../stores/project-context';
import { PROJECT_VERSION, type ProjectFile, type ProjectFileInput } from '../types/project';
import {
  AutomationAdapter,
  createAutomationAdapter,
  type AutomationResult,
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
// fallow-ignore-next-line unused-export -- Fixture consumers may inject the deterministic repository.
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
      targets: new Map([[projectId, this.context]]),
      saveService: this.saveService,
      repository: this.repository,
    });
  }

  async run(): Promise<FixtureJourneyResult> {
    await this.initialize();

    const negotiation = expectSuccess(this.adapter.negotiateCatalog({ version: '1.0' }));
    const initialRevision = expectSuccess(this.adapter.captureTargetRevision(this.target)).revision;
    const initialObservation = expectSuccess(this.adapter.observeProject({
      target: this.target,
      expectedRevision: initialRevision,
    }));
    const initialRender = expectSuccess(this.adapter.observeRender({
      target: this.target,
      expectedRevision: initialObservation.revision,
      frameId: initialObservation.currentFrameId,
    }));

    const resizeRequest = {
      target: this.target,
      expectedRevision: initialObservation.revision,
      width: 6,
      height: 5,
      offset: { x: 1, y: 1 },
    };
    const resizePreview = expectSuccess(this.adapter.previewCanvasResize(resizeRequest));
    const resizeExecution = expectSuccess(await this.adapter.executeCanvasResize(resizeRequest, {
      preview: resizePreview.preview,
      confirmed: true,
    }));
    await settleEffects();

    const afterResizeObservation = expectSuccess(this.adapter.observeProject({
      target: this.target,
      expectedRevision: resizeExecution.revision,
    }));
    const afterResizeRender = expectSuccess(this.adapter.observeRender({
      target: this.target,
      expectedRevision: afterResizeObservation.revision,
      frameId: afterResizeObservation.currentFrameId,
    }));

    const undoTransition = expectSuccess(await this.adapter.undo({
      target: this.target,
      expectedRevision: afterResizeObservation.revision,
    }));
    const afterUndoObservation = expectSuccess(this.adapter.observeProject({
      target: this.target,
      expectedRevision: undoTransition.revision,
    }));
    const afterUndoRender = expectSuccess(this.adapter.observeRender({
      target: this.target,
      expectedRevision: afterUndoObservation.revision,
      frameId: afterUndoObservation.currentFrameId,
    }));

    const redoTransition = expectSuccess(await this.adapter.redo({
      target: this.target,
      expectedRevision: afterUndoObservation.revision,
    }));
    const afterRedoObservation = expectSuccess(this.adapter.observeProject({
      target: this.target,
      expectedRevision: redoTransition.revision,
    }));
    const afterRedoRender = expectSuccess(this.adapter.observeRender({
      target: this.target,
      expectedRevision: afterRedoObservation.revision,
      frameId: afterRedoObservation.currentFrameId,
    }));

    const save = expectSuccess(await this.adapter.save({
      target: this.target,
      expectedRevision: afterRedoObservation.revision,
    }));
    const reload = expectSuccess(await this.adapter.reload({
      target: this.target,
      expectedRevision: afterRedoObservation.revision,
    }));
    const reloadedRender = expectSuccess(this.adapter.observeRender({
      target: this.target,
      expectedRevision: reload.revision,
      frameId: reload.observation.currentFrameId,
    }));

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
        document: sameDocument(afterRedoObservation, reload.observation),
        render: sameBytes(afterRedoRender.pixels, reloadedRender.pixels),
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

function expectSuccess<T>(result: AutomationResult<T>): T {
  if (!result.ok) throw new Error(`Fixture adapter request failed: ${result.error.code}`);
  return result.result;
}

function sameDocument(first: ProjectObservation, second: ProjectObservation): boolean {
  return JSON.stringify({
    name: first.name,
    canvas: first.canvas,
    currentFrameId: first.currentFrameId,
    fps: first.fps,
    layers: first.layers,
    frames: first.frames,
    tags: first.tags,
    palette: first.palette,
  }) === JSON.stringify({
    name: second.name,
    canvas: second.canvas,
    currentFrameId: second.currentFrameId,
    fps: second.fps,
    layers: second.layers,
    frames: second.frames,
    tags: second.tags,
    palette: second.palette,
  });
}

function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

async function settleEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
