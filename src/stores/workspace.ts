import { signal } from "../core/signal";
import {
  createProjectContext,
  defaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from "./project-context";

export const WORKSPACE_OPEN_ITEM_LIMIT = 8;
export const DEFAULT_WORKSPACE_ITEM_ID = "workspace-default";

export interface WorkspaceItem {
  id: string;
  context: ProjectContext;
}

export type WorkspaceAddFailureReason = "tab-limit-reached";
export type WorkspaceActivateFailureReason = "not-found";
export type WorkspaceCloseFailureReason = "not-found" | "last-item";

export type WorkspaceAddResult =
  | { ok: true; item: WorkspaceItem }
  | {
      ok: false;
      reason: WorkspaceAddFailureReason;
      message: string;
    };

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

interface WorkspaceStoreOptions {
  initialContext?: ProjectContext;
  initialItemId?: string;
  itemLimit?: number;
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

  constructor(options: WorkspaceStoreOptions = {}) {
    const initialItem = {
      id: options.initialItemId ?? DEFAULT_WORKSPACE_ITEM_ID,
      context: options.initialContext ?? defaultProjectContext,
    };

    this.items = signal<WorkspaceItem[]>([initialItem]);
    this.activeItemId = signal<string>(initialItem.id);
    this.itemLimit = options.itemLimit ?? WORKSPACE_OPEN_ITEM_LIMIT;

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

  private useExistingItem(
    item: WorkspaceItem,
    options: AddContextOptions,
  ): WorkspaceAddResult {
    this.activateIfRequested(item, options.activate);
    return { ok: true, item };
  }

  private createLimitFailure(): WorkspaceAddResult {
    return {
      ok: false,
      reason: "tab-limit-reached",
      message: `The workspace can keep up to ${this.itemLimit} projects open at once.`,
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
    return { ok: true, item };
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

    closedItem.context.dispose();

    return {
      ok: true,
      closedItem,
      activeItem,
    };
  }

  private findItem(itemId: string): WorkspaceItem | undefined {
    return this.items.value.find((item) => item.id === itemId);
  }

  private findContextItem(context?: ProjectContext): WorkspaceItem | undefined {
    if (!context) return undefined;
    return this.items.value.find((item) => item.context === context);
  }

  private activateIfRequested(item: WorkspaceItem, activate = true) {
    if (activate) {
      this.activate(item.id);
    }
  }
}

export const workspaceStore = new WorkspaceStore();
