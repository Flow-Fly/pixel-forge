import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKSPACE_ITEM_ID,
  WORKSPACE_OPEN_ITEM_LIMIT,
  WorkspaceStore,
} from "../../src/stores/workspace";
import {
  createProjectContext,
  defaultProjectContext,
  getActiveProjectContext,
  restoreDefaultProjectContext,
  type ProjectContext,
} from "../../src/stores/project-context";

const createdContexts: ProjectContext[] = [];

function createTestContext(name: string) {
  const context = createProjectContext();
  context.project.name.value = name;
  createdContexts.push(context);
  return context;
}

function expectAdded(result: ReturnType<WorkspaceStore["addContext"]>) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.item;
}

function expectClosed(result: ReturnType<WorkspaceStore["close"]>) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

describe("WorkspaceStore", () => {
  afterEach(() => {
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    vi.restoreAllMocks();
  });

  it("starts with the default project context", () => {
    const workspace = new WorkspaceStore();

    expect(workspace.items.value).toEqual([
      {
        id: DEFAULT_WORKSPACE_ITEM_ID,
        context: defaultProjectContext,
      },
    ]);
    expect(workspace.activeItemId.value).toBe(DEFAULT_WORKSPACE_ITEM_ID);
    expect(workspace.activeItem.context).toBe(defaultProjectContext);
    expect(getActiveProjectContext()).toBe(defaultProjectContext);
  });

  it("activates another workspace item and switches active project context", () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
    });
    workspace.addContext(contextB, { id: "project-b", activate: false });

    const result = workspace.activate("project-b");

    expect(result.ok).toBe(true);
    expect(workspace.activeItemId.value).toBe("project-b");
    expect(workspace.activeItem.context).toBe(contextB);
    expect(getActiveProjectContext()).toBe(contextB);
  });

  it("closes the active item, activates a neighbor, and disposes the closed context", () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
    });
    workspace.addContext(contextB, { id: "project-b" });
    const dispose = vi.spyOn(contextB, "dispose");

    const result = expectClosed(workspace.close("project-b"));

    expect(result.closedItem.context).toBe(contextB);
    expect(result.activeItem.context).toBe(contextA);
    expect(workspace.items.value.map((item) => item.id)).toEqual(["project-a"]);
    expect(workspace.activeItemId.value).toBe("project-a");
    expect(getActiveProjectContext()).toBe(contextA);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("closes an inactive item without changing the active context", () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
    });
    workspace.addContext(contextB, { id: "project-b", activate: false });
    const dispose = vi.spyOn(contextB, "dispose");

    const result = expectClosed(workspace.close("project-b"));

    expect(result.closedItem.context).toBe(contextB);
    expect(result.activeItem.context).toBe(contextA);
    expect(workspace.activeItemId.value).toBe("project-a");
    expect(getActiveProjectContext()).toBe(contextA);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("refuses to close the last workspace item", () => {
    const context = createTestContext("Only Project");
    const workspace = new WorkspaceStore({
      initialContext: context,
      initialItemId: "only-project",
    });
    const dispose = vi.spyOn(context, "dispose");

    const result = workspace.close("only-project");

    expect(result).toEqual({
      ok: false,
      reason: "last-item",
      message: "The workspace must keep at least one project open.",
    });
    expect(workspace.items.value).toHaveLength(1);
    expect(workspace.activeItem.context).toBe(context);
    expect(getActiveProjectContext()).toBe(context);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("returns a clear failure when the open item cap is reached", () => {
    const firstContext = createTestContext("Project 1");
    const workspace = new WorkspaceStore({
      initialContext: firstContext,
      initialItemId: "project-1",
    });

    for (let index = 2; index <= WORKSPACE_OPEN_ITEM_LIMIT; index += 1) {
      const context = createTestContext(`Project ${index}`);
      expectAdded(workspace.addContext(context, { id: `project-${index}` }));
    }

    const overflowContext = createTestContext("Overflow Project");
    const result = workspace.addContext(overflowContext, {
      id: "overflow-project",
    });

    expect(result).toEqual({
      ok: false,
      reason: "tab-limit-reached",
      message: `The workspace can keep up to ${WORKSPACE_OPEN_ITEM_LIMIT} projects open at once.`,
    });
    expect(workspace.items.value).toHaveLength(WORKSPACE_OPEN_ITEM_LIMIT);
    expect(workspace.items.value.some((item) => item.id === "overflow-project")).toBe(
      false,
    );
    expect(getActiveProjectContext()).not.toBe(overflowContext);
  });
});
