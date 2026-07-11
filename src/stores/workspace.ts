import { signal } from "../core/signal";
import { autoSaveService } from "../services/auto-save";
import { projectRepository } from "../services/persistence/indexed-db";
import type {
  ProjectRepository,
  WorkspaceState,
} from "../services/persistence/project-repository";
import {
  projectLibrary,
  type CreateProjectOptions,
  type ProjectLibraryService,
} from "../services/project-library";
import {
  createProjectContext,
  defaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from "./project-context";
import type { ProjectFile } from "../types/project";
import { log } from "../utils/log";

export const WORKSPACE_OPEN_ITEM_LIMIT = 8;
export const DEFAULT_WORKSPACE_ITEM_ID = "workspace-default";

export function workspaceItemLimitMessage(itemLimit = WORKSPACE_OPEN_ITEM_LIMIT): string {
  return `The workspace can keep up to ${itemLimit} projects open at once.`;
}

export interface WorkspaceItem {
  id: string;
  context: ProjectContext;
}

type WorkspaceAddFailureReason = "tab-limit-reached";
type WorkspaceActivateFailureReason = "not-found";
type WorkspaceCloseFailureReason = "not-found" | "last-item";

type WorkspaceLimitFailure = {
  ok: false;
  reason: WorkspaceAddFailureReason;
  message: string;
};

type WorkspaceProjectLibrary = Pick<
  ProjectLibraryService,
  "openProject" | "createProject" | "createProjectFromFile"
>;
type WorkspaceAutoSave = Pick<
  typeof autoSaveService,
  "saveNow" | "start" | "stop"
>;
type WorkspaceStatePersistence = Pick<ProjectRepository, "setWorkspaceState">;

export interface WorkspaceProjectOptions {
  activate?: boolean;
  saveActiveContext?: boolean;
}

export type WorkspaceAddResult =
  | { ok: true; item: WorkspaceItem }
  | WorkspaceLimitFailure;

export type WorkspaceActivateResult =
  | { ok: true; item: WorkspaceItem }
  | {
      ok: false;
      reason: WorkspaceActivateFailureReason;
      message: string;
    };

export type WorkspaceCloseResult =
  | {
      ok: true;
      closedItem: WorkspaceItem;
      activeItem: WorkspaceItem;
    }
  | {
      ok: false;
      reason: WorkspaceCloseFailureReason;
      message: string;
    };

export type WorkspaceProjectResult =
  | {
      ok: true;
      item: WorkspaceItem;
      projectId: string;
    }
  | WorkspaceLimitFailure;

interface WorkspaceStoreOptions {
  initialContext?: ProjectContext;
  initialItemId?: string;
  itemLimit?: number;
  projectLibrary?: WorkspaceProjectLibrary;
  autoSave?: WorkspaceAutoSave;
  workspaceState?: WorkspaceStatePersistence;
}

interface AddContextOptions {
  id?: string;
  activate?: boolean;
}

let nextWorkspaceItemNumber = 1;

function createWorkspaceItemId() {
  nextWorkspaceItemNumber += 1;
  return `workspace-${nextWorkspaceItemNumber}`;
}

export class WorkspaceStore {
  readonly items;
  readonly activeItemId;

  private readonly itemLimit: number;
  private readonly projectLibrary: WorkspaceProjectLibrary;
  private readonly autoSave: WorkspaceAutoSave;
  private readonly workspaceState: WorkspaceStatePersistence;
  private isRestoringWorkspace = false;

  constructor(options: WorkspaceStoreOptions = {}) {
    const initialItem = {
      id: options.initialItemId ?? DEFAULT_WORKSPACE_ITEM_ID,
      context: options.initialContext ?? defaultProjectContext,
    };

    this.items = signal<WorkspaceItem[]>([initialItem]);
    this.activeItemId = signal<string>(initialItem.id);
    this.itemLimit = options.itemLimit ?? WORKSPACE_OPEN_ITEM_LIMIT;
    this.projectLibrary = options.projectLibrary ?? projectLibrary;
    this.autoSave = options.autoSave ?? autoSaveService;
    this.workspaceState = options.workspaceState ?? noopWorkspaceState;

    setActiveProjectContext(initialItem.context);
  }

  get activeItem(): WorkspaceItem {
    const item = this.findItem(this.activeItemId.value);
    if (item) return item;

    const [firstItem] = this.items.value;
    this.activeItemId.value = firstItem.id;
    setActiveProjectContext(firstItem.context);
    return firstItem;
  }

  addContext(
    context?: ProjectContext,
    options: AddContextOptions = {},
  ): WorkspaceAddResult {
    const existingItem = this.findContextItem(context);
    if (existingItem) {
      return this.useExistingItem(existingItem, options);
    }

    if (this.items.value.length >= this.itemLimit) {
      return this.createLimitFailure();
    }

    return this.addNewContext(context ?? createProjectContext(), options);
  }

  async openProject(
    projectId: string,
    options: WorkspaceProjectOptions = {},
  ): Promise<WorkspaceProjectResult> {
    const existingItem = this.getProjectItem(projectId);
    if (existingItem) {
      await this.saveActiveContextIfRequested(options.saveActiveContext);
      this.activateIfRequested(existingItem, options.activate);
      return { ok: true, item: existingItem, projectId };
    }

    if (this.items.value.length >= this.itemLimit) {
      return this.createLimitFailure();
    }

    await this.saveActiveContextIfRequested(options.saveActiveContext);

    const context = createProjectContext();
    try {
      await this.projectLibrary.openProject(projectId, {
        context,
        saveCurrent: false,
      });
    } catch (error) {
      context.dispose();
      throw error;
    }

    return this.addLoadedProject(projectId, context, options);
  }

  async createProject(
    projectOptions: CreateProjectOptions,
    options: WorkspaceProjectOptions = {},
  ): Promise<WorkspaceProjectResult> {
    return this.createProjectInNewContext(options, (context) =>
      this.projectLibrary.createProject(projectOptions, {
        context,
        saveCurrent: false,
      }),
    );
  }

  async createProjectFromFile(
    project: ProjectFile,
    options: WorkspaceProjectOptions = {},
  ): Promise<WorkspaceProjectResult> {
    return this.createProjectInNewContext(options, (context) =>
      this.projectLibrary.createProjectFromFile(project, {
        context,
        saveCurrent: false,
      }),
    );
  }

  private async createProjectInNewContext(
    options: WorkspaceProjectOptions,
    createProject: (context: ProjectContext) => Promise<string>,
  ): Promise<WorkspaceProjectResult> {
    if (this.items.value.length >= this.itemLimit) {
      return this.createLimitFailure();
    }

    await this.saveActiveContextIfRequested(options.saveActiveContext);

    const context = createProjectContext();
    let projectId: string;
    try {
      projectId = await createProject(context);
    } catch (error) {
      context.dispose();
      throw error;
    }

    return this.addLoadedProject(projectId, context, options);
  }

  private useExistingItem(
    item: WorkspaceItem,
    options: AddContextOptions,
  ): WorkspaceAddResult {
    this.activateIfRequested(item, options.activate);
    return { ok: true, item };
  }

  private createLimitFailure(): WorkspaceLimitFailure {
    return {
      ok: false,
      reason: "tab-limit-reached",
      message: workspaceItemLimitMessage(this.itemLimit),
    };
  }

  private addNewContext(
    context: ProjectContext,
    options: AddContextOptions,
  ): WorkspaceAddResult {
    const item = {
      id: options.id ?? createWorkspaceItemId(),
      context,
    };

    this.items.value = [...this.items.value, item];
    this.activateIfRequested(item, options.activate);
    if (options.activate === false) {
      this.persistWorkspaceState();
    }

    return { ok: true, item };
  }

  activate(itemId: string): WorkspaceActivateResult {
    const item = this.findItem(itemId);
    if (!item) {
      return {
        ok: false,
        reason: "not-found",
        message: "Workspace item was not found.",
      };
    }

    this.activeItemId.value = item.id;
    setActiveProjectContext(item.context);
    this.persistWorkspaceState();
    return { ok: true, item };
  }

  activateNext(): WorkspaceActivateResult {
    return this.activateByOffset(1);
  }

  activatePrevious(): WorkspaceActivateResult {
    return this.activateByOffset(-1);
  }

  close(itemId: string): WorkspaceCloseResult {
    const items = this.items.value;
    const itemIndex = items.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) {
      return {
        ok: false,
        reason: "not-found",
        message: "Workspace item was not found.",
      };
    }

    if (items.length === 1) {
      return {
        ok: false,
        reason: "last-item",
        message: "The workspace must keep at least one project open.",
      };
    }

    const closedItem = items[itemIndex];
    const nextItems = items.filter((item) => item.id !== itemId);
    this.items.value = nextItems;

    let activeItem = this.findItem(this.activeItemId.value);
    if (closedItem.id === this.activeItemId.value || !activeItem) {
      activeItem = nextItems[itemIndex] ?? nextItems[itemIndex - 1];
      this.activeItemId.value = activeItem.id;
      setActiveProjectContext(activeItem.context);
    }

    this.autoSave.stop(closedItem.context);
    closedItem.context.dispose();
    this.persistWorkspaceState();

    return {
      ok: true,
      closedItem,
      activeItem,
    };
  }

  async closeProject(itemId: string): Promise<WorkspaceCloseResult> {
    const item = this.findItem(itemId);
    if (!item || this.items.value.length === 1) {
      return this.close(itemId);
    }

    await this.autoSave.saveNow(item.context);
    return this.close(itemId);
  }

  async restoreWorkspace(state: WorkspaceState): Promise<boolean> {
    const restorePlan = this.createRestorePlan(state);
    if (restorePlan.loadProjectIds.length === 0) return false;

    const previousItems = this.items.value;
    const reusableContext = this.activeItem.context;
    let didRestore = false;

    this.isRestoringWorkspace = true;
    try {
      const loadedItemsById = await this.loadWorkspaceItems(
        restorePlan.loadProjectIds,
        reusableContext,
      );
      const loadedItems = this.orderedLoadedItems(
        restorePlan.displayProjectIds,
        loadedItemsById,
      );
      if (loadedItems.length === 0) return false;

      const activeItem = this.restoredActiveItem(
        state.activeProjectId,
        loadedItemsById,
        loadedItems,
      );
      this.disposeReplacedItems(previousItems, loadedItems, reusableContext);
      this.applyRestoredWorkspace(loadedItems, activeItem);
      didRestore = true;
      return true;
    } finally {
      this.isRestoringWorkspace = false;
      if (didRestore) {
        this.persistWorkspaceState();
      }
    }
  }

  private findItem(itemId: string): WorkspaceItem | undefined {
    return this.items.value.find((item) => item.id === itemId);
  }

  getProjectItem(projectId: string): WorkspaceItem | undefined {
    return this.items.value.find((item) => item.context.project.id.value === projectId);
  }

  private findContextItem(context?: ProjectContext): WorkspaceItem | undefined {
    if (!context) return undefined;
    return this.items.value.find((item) => item.context === context);
  }

  private activateByOffset(offset: number): WorkspaceActivateResult {
    const items = this.items.value;
    const activeIndex = items.findIndex((item) => item.id === this.activeItemId.value);
    const nextIndex = activeIndex === -1
      ? 0
      : (activeIndex + offset + items.length) % items.length;

    return this.activate(items[nextIndex].id);
  }

  private activateIfRequested(item: WorkspaceItem, activate = true) {
    if (activate) {
      this.activate(item.id);
    }
  }

  private async saveActiveContextIfRequested(saveActiveContext = false) {
    if (saveActiveContext) {
      await this.autoSave.saveNow(this.activeItem.context);
    }
  }

  private addLoadedProject(
    projectId: string,
    context: ProjectContext,
    options: WorkspaceProjectOptions,
  ): WorkspaceProjectResult {
    const result = this.addContext(context, {
      id: projectId,
      activate: options.activate,
    });
    if (!result.ok) {
      context.dispose();
      return result;
    }

    this.autoSave.start(context);
    return { ok: true, item: result.item, projectId };
  }

  private createRestorePlan(state: WorkspaceState) {
    const displayProjectIds = this.uniqueProjectIds(state.openProjectIds);
    if (state.activeProjectId && !displayProjectIds.includes(state.activeProjectId)) {
      displayProjectIds.unshift(state.activeProjectId);
    }

    const loadProjectIds = state.activeProjectId
      ? [
          state.activeProjectId,
          ...displayProjectIds.filter(
            (projectId) => projectId !== state.activeProjectId,
          ),
        ]
      : displayProjectIds;

    return {
      displayProjectIds: displayProjectIds.slice(0, this.itemLimit),
      loadProjectIds: loadProjectIds.slice(0, this.itemLimit),
    };
  }

  private async loadWorkspaceItems(
    projectIds: string[],
    reusableContext: ProjectContext,
  ): Promise<Map<string, WorkspaceItem>> {
    const loadedItemsById = new Map<string, WorkspaceItem>();
    let didUseReusableContext = false;

    for (const projectId of projectIds) {
      const context = didUseReusableContext
        ? createProjectContext()
        : reusableContext;
      const item = await this.loadWorkspaceItem(projectId, context, reusableContext);
      if (!item) continue;

      didUseReusableContext = true;
      loadedItemsById.set(projectId, item);
    }

    return loadedItemsById;
  }

  private async loadWorkspaceItem(
    projectId: string,
    context: ProjectContext,
    reusableContext: ProjectContext,
  ): Promise<WorkspaceItem | null> {
    try {
      await this.projectLibrary.openProject(projectId, {
        context,
        saveCurrent: false,
      });
    } catch (error) {
      if (context !== reusableContext) {
        context.dispose();
      }
      log.warn("Skipping workspace project during restore:", error);
      return null;
    }

    this.autoSave.start(context);
    return { id: projectId, context };
  }

  private orderedLoadedItems(
    displayProjectIds: string[],
    loadedItemsById: Map<string, WorkspaceItem>,
  ): WorkspaceItem[] {
    return displayProjectIds
      .map((projectId) => loadedItemsById.get(projectId))
      .filter((item): item is WorkspaceItem => Boolean(item));
  }

  private restoredActiveItem(
    activeProjectId: string | null,
    loadedItemsById: Map<string, WorkspaceItem>,
    loadedItems: WorkspaceItem[],
  ): WorkspaceItem {
    return activeProjectId
      ? loadedItemsById.get(activeProjectId) ?? loadedItems[0]
      : loadedItems[0];
  }

  private disposeReplacedItems(
    previousItems: WorkspaceItem[],
    loadedItems: WorkspaceItem[],
    reusableContext: ProjectContext,
  ) {
    for (const item of previousItems) {
      const isStillOpen = loadedItems.some(
        (loadedItem) => loadedItem.context === item.context,
      );
      if (!isStillOpen && item.context !== reusableContext) {
        this.autoSave.stop(item.context);
        item.context.dispose();
      }
    }
  }

  private applyRestoredWorkspace(
    loadedItems: WorkspaceItem[],
    activeItem: WorkspaceItem,
  ) {
    this.items.value = loadedItems;
    this.activeItemId.value = activeItem.id;
    setActiveProjectContext(activeItem.context);
  }

  private uniqueProjectIds(projectIdsToDeduplicate: string[]): string[] {
    const projectIds: string[] = [];

    for (const projectId of projectIdsToDeduplicate) {
      if (!projectId || projectIds.includes(projectId)) continue;
      projectIds.push(projectId);
      if (projectIds.length >= this.itemLimit) break;
    }

    return projectIds;
  }

  private persistWorkspaceState() {
    if (this.isRestoringWorkspace) return;

    void this.workspaceState
      .setWorkspaceState(this.currentWorkspaceState())
      .catch((error) => log.warn("Failed to persist workspace state:", error));
  }

  private currentWorkspaceState(): WorkspaceState {
    const openProjectIds = this.items.value.map((item) => item.context.project.id.value);
    const activeProjectId = this.activeItem.context.project.id.value || null;
    return { openProjectIds, activeProjectId };
  }
}

const noopWorkspaceState: WorkspaceStatePersistence = {
  async setWorkspaceState() {},
};

export const workspaceStore = new WorkspaceStore({
  workspaceState: projectRepository,
});
