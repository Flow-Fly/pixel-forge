import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKSPACE_ITEM_ID,
  WORKSPACE_OPEN_ITEM_LIMIT,
  WorkspaceStore,
} from "../../src/stores/workspace";
import type { ProjectLibraryService } from "../../src/services/project-library";
import {
  createProjectContext,
  defaultProjectContext,
  getActiveProjectContext,
  restoreDefaultProjectContext,
  type ProjectContext,
} from "../../src/stores/project-context";
import { PROJECT_VERSION, type ProjectFile } from "../../src/types/project";

type WorkspaceProjectLibrary = Pick<
  ProjectLibraryService,
  "openProject" | "createProject" | "createProjectFromFile" | "deleteProject"
>;

function makeProjectFile(name: string): ProjectFile {
  const layerId = `${name}-layer`;
  const frameId = `${name}-frame`;

  return {
    version: PROJECT_VERSION,
    name,
    width: 8,
    height: 8,
    palette: ["#000000", "#ffffff"],
    layers: [
      {
        id: layerId,
        name: "Layer 1",
        type: "image",
        visible: true,
        opacity: 255,
        blendMode: "normal",
        continuous: false,
        data: new Uint8Array(0),
      },
    ],
    frames: [
      {
        id: frameId,
        duration: 100,
        cels: [
          {
            layerId,
            data: new Uint8Array(0),
          },
        ],
      },
    ],
    animation: {
      fps: 12,
      currentFrameIndex: 0,
    },
    tags: [],
  };
}

const createdContexts: ProjectContext[] = [];

function createTestContext(name: string) {
  const context = createProjectContext();
  context.project.name.value = name;
  createdContexts.push(context);
  return context;
}

function rememberContext(context: ProjectContext | undefined) {
  if (context && !createdContexts.includes(context)) {
    createdContexts.push(context);
  }
}

function createProjectLibraryMock() {
  let nextProjectNumber = 1;
  const projectLibrary: WorkspaceProjectLibrary = {
    openProject: vi.fn(async (projectId, settings = {}) => {
      rememberContext(settings.context);
      if (settings.context) {
        settings.context.project.id.value = projectId;
        settings.context.project.name.value = `Project ${projectId}`;
      }
      return makeProjectFile(`Project ${projectId}`);
    }),
    createProject: vi.fn(async (options, settings = {}) => {
      const projectId = `created-project-${nextProjectNumber}`;
      nextProjectNumber += 1;
      rememberContext(settings.context);
      if (settings.context) {
        settings.context.project.id.value = projectId;
        settings.context.project.name.value = options.name ?? "Untitled";
      }
      return projectId;
    }),
    createProjectFromFile: vi.fn(async (project, settings = {}) => {
      const projectId = `created-project-${nextProjectNumber}`;
      nextProjectNumber += 1;
      rememberContext(settings.context);
      if (settings.context) {
        settings.context.project.id.value = projectId;
        settings.context.project.name.value = project.name ?? "Untitled";
        settings.context.guidedDrawing.load(project.guidedDrawing);
      }
      return projectId;
    }),
    deleteProject: vi.fn(async () => {}),
  };

  return projectLibrary;
}

function createAutoSaveMock() {
  return {
    saveNow: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createWorkspaceStateMock() {
  return {
    setWorkspaceState: vi.fn(async () => {}),
  };
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

  it("finds an open project item by project id regardless of the active tab", () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    contextA.project.id.value = "project-a";
    contextB.project.id.value = "project-b";
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
    });
    workspace.addContext(contextB, { id: "project-b" });

    expect(workspace.activeItem.context).toBe(contextB);
    expect(workspace.getProjectItem("project-a")?.context).toBe(contextA);
    expect(workspace.getProjectItem("project-b")?.context).toBe(contextB);
    expect(workspace.getProjectItem("missing-project")).toBeUndefined();
  });

  it("cycles project tabs through the active project context", () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    const contextC = createTestContext("Project C");
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
    });
    workspace.addContext(contextB, { id: "project-b", activate: false });
    workspace.addContext(contextC, { id: "project-c", activate: false });

    workspace.activateNext();
    expect(workspace.activeItem.context).toBe(contextB);
    expect(getActiveProjectContext()).toBe(contextB);

    workspace.activateNext();
    expect(workspace.activeItem.context).toBe(contextC);
    expect(getActiveProjectContext()).toBe(contextC);

    workspace.activateNext();
    expect(workspace.activeItem.context).toBe(contextA);
    expect(getActiveProjectContext()).toBe(contextA);

    workspace.activatePrevious();
    expect(workspace.activeItem.context).toBe(contextC);
    expect(getActiveProjectContext()).toBe(contextC);
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

  it("saves a project before closing it through the project close path", async () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
      autoSave,
    });
    workspace.addContext(contextB, { id: "project-b" });

    const result = await workspace.closeProject("project-b");

    expect(result.ok).toBe(true);
    expect(autoSave.saveNow).toHaveBeenCalledWith(contextB);
    expect(autoSave.stop).toHaveBeenCalledWith(contextB);
    expect(workspace.items.value.map((item) => item.id)).toEqual(["project-a"]);
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

  it("deletes the active project and activates a remaining project", async () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    contextA.project.id.value = "project-a";
    contextB.project.id.value = "project-b";
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
      projectLibrary,
      autoSave,
    });
    workspace.addContext(contextB, { id: "project-b" });
    const dispose = vi.spyOn(contextB, "dispose");

    await workspace.deleteProject("project-b");

    expect(autoSave.pause).toHaveBeenCalledWith(contextB);
    expect(projectLibrary.deleteProject).toHaveBeenCalledWith("project-b");
    expect(workspace.items.value.map((item) => item.id)).toEqual(["project-a"]);
    expect(workspace.activeItem.context).toBe(contextA);
    expect(getActiveProjectContext()).toBe(contextA);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("deletes an inactive project without changing the active project", async () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    contextA.project.id.value = "project-a";
    contextB.project.id.value = "project-b";
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
      projectLibrary,
      autoSave,
    });
    workspace.addContext(contextB, { id: "project-b", activate: false });
    const dispose = vi.spyOn(contextB, "dispose");

    await workspace.deleteProject("project-b");

    expect(workspace.items.value.map((item) => item.id)).toEqual(["project-a"]);
    expect(workspace.activeItem.context).toBe(contextA);
    expect(getActiveProjectContext()).toBe(contextA);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("replaces the last deleted project with a fresh safe context", async () => {
    const deletedContext = createTestContext("Only Project");
    deletedContext.project.id.value = "only-project";
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext: deletedContext,
      initialItemId: "only-project",
      projectLibrary,
      autoSave,
    });
    const dispose = vi.spyOn(deletedContext, "dispose");

    await workspace.deleteProject("only-project");

    const replacement = workspace.activeItem;
    rememberContext(replacement.context);
    expect(replacement.context).not.toBe(deletedContext);
    expect(replacement.context.project.id.value).not.toBe("only-project");
    expect(workspace.items.value).toHaveLength(1);
    expect(getActiveProjectContext()).toBe(replacement.context);
    expect(autoSave.start).toHaveBeenCalledWith(replacement.context);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("restores observation and keeps the workspace intact when deletion fails", async () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    contextA.project.id.value = "project-a";
    contextB.project.id.value = "project-b";
    const projectLibrary = createProjectLibraryMock();
    vi.mocked(projectLibrary.deleteProject).mockRejectedValue(new Error("delete failed"));
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
      projectLibrary,
      autoSave,
    });
    workspace.addContext(contextB, { id: "project-b" });
    const dispose = vi.spyOn(contextB, "dispose");

    await expect(workspace.deleteProject("project-b")).rejects.toThrow(
      "delete failed",
    );

    expect(autoSave.pause).toHaveBeenCalledWith(contextB);
    expect(autoSave.start).toHaveBeenCalledWith(contextB);
    expect(workspace.items.value.map((item) => item.id)).toEqual([
      "project-a",
      "project-b",
    ]);
    expect(workspace.activeItem.context).toBe(contextB);
    expect(getActiveProjectContext()).toBe(contextB);
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

  it("persists open project ids and the active project when workspace state changes", () => {
    const contextA = createTestContext("Project A");
    const contextB = createTestContext("Project B");
    const workspaceState = createWorkspaceStateMock();
    contextA.project.id.value = "project-a";
    contextB.project.id.value = "project-b";
    const workspace = new WorkspaceStore({
      initialContext: contextA,
      initialItemId: "project-a",
      workspaceState,
    });

    workspace.addContext(contextB, { id: "project-b", activate: false });
    workspace.activate("project-b");
    workspace.close("project-a");

    expect(workspaceState.setWorkspaceState).toHaveBeenNthCalledWith(1, {
      openProjectIds: ["project-a", "project-b"],
      activeProjectId: "project-a",
    });
    expect(workspaceState.setWorkspaceState).toHaveBeenNthCalledWith(2, {
      openProjectIds: ["project-a", "project-b"],
      activeProjectId: "project-b",
    });
    expect(workspaceState.setWorkspaceState).toHaveBeenNthCalledWith(3, {
      openProjectIds: ["project-b"],
      activeProjectId: "project-b",
    });
  });

  it("restores workspace projects, skips missing ids, and keeps the active project selected", async () => {
    const initialContext = createTestContext("Initial Project");
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspaceState = createWorkspaceStateMock();
    const workspace = new WorkspaceStore({
      initialContext,
      initialItemId: "initial-project",
      projectLibrary,
      autoSave,
      workspaceState,
    });
    vi.mocked(projectLibrary.openProject).mockImplementation(
      async (projectId, settings = {}) => {
        if (projectId === "missing-project") {
          throw new Error("Project not found");
        }
        rememberContext(settings.context);
        if (settings.context) {
          settings.context.project.id.value = projectId;
          settings.context.project.name.value = `Project ${projectId}`;
        }
        return makeProjectFile(`Project ${projectId}`);
      },
    );

    const didRestore = await workspace.restoreWorkspace({
      openProjectIds: ["project-a", "missing-project", "project-b"],
      activeProjectId: "project-b",
    });

    expect(didRestore).toBe(true);
    expect(workspace.items.value.map((item) => item.context.project.id.value)).toEqual([
      "project-a",
      "project-b",
    ]);
    expect(workspace.activeItem.context.project.id.value).toBe("project-b");
    expect(getActiveProjectContext()).toBe(workspace.activeItem.context);
    expect(workspace.activeItem.context).toBe(initialContext);
    expect(autoSave.start).toHaveBeenCalledTimes(2);
    expect(workspaceState.setWorkspaceState).toHaveBeenCalledWith({
      openProjectIds: ["project-a", "project-b"],
      activeProjectId: "project-b",
    });
  });

  it("opens project ids into separate contexts and activates the latest project", async () => {
    const initialContext = createTestContext("Initial Project");
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext,
      initialItemId: "initial-project",
      projectLibrary,
      autoSave,
    });

    const firstResult = await workspace.openProject("project-a");
    const secondResult = await workspace.openProject("project-b");

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (!firstResult.ok || !secondResult.ok) return;

    expect(firstResult.item.context).not.toBe(secondResult.item.context);
    expect(firstResult.item.context.project.id.value).toBe("project-a");
    expect(secondResult.item.context.project.id.value).toBe("project-b");
    expect(workspace.activeItem).toBe(secondResult.item);
    expect(getActiveProjectContext()).toBe(secondResult.item.context);
    expect(projectLibrary.openProject).toHaveBeenCalledTimes(2);
    expect(projectLibrary.openProject).toHaveBeenNthCalledWith(
      1,
      "project-a",
      {
        context: firstResult.item.context,
        saveCurrent: false,
      },
    );
    expect(projectLibrary.openProject).toHaveBeenNthCalledWith(
      2,
      "project-b",
      {
        context: secondResult.item.context,
        saveCurrent: false,
      },
    );
    expect(autoSave.start).toHaveBeenCalledWith(firstResult.item.context);
    expect(autoSave.start).toHaveBeenCalledWith(secondResult.item.context);
  });

  it("activates an already-open project without creating a duplicate context", async () => {
    const initialContext = createTestContext("Initial Project");
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext,
      initialItemId: "initial-project",
      projectLibrary,
      autoSave,
    });
    const firstResult = await workspace.openProject("project-a");
    await workspace.openProject("project-b");

    const reopenedResult = await workspace.openProject("project-a");

    expect(reopenedResult.ok).toBe(true);
    if (!firstResult.ok || !reopenedResult.ok) return;

    expect(reopenedResult.item).toBe(firstResult.item);
    expect(
      workspace.items.value.filter((item) => item.context.project.id.value === "project-a"),
    ).toHaveLength(1);
    expect(workspace.activeItem).toBe(firstResult.item);
    expect(projectLibrary.openProject).toHaveBeenCalledTimes(2);
  });

  it("creates a project in a new active workspace item", async () => {
    const initialContext = createTestContext("Initial Project");
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext,
      initialItemId: "initial-project",
      projectLibrary,
      autoSave,
    });

    const result = await workspace.createProject({ name: "Fresh Project" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.projectId).toBe("created-project-1");
    expect(result.item.context.project.id.value).toBe("created-project-1");
    expect(result.item.context.project.name.value).toBe("Fresh Project");
    expect(workspace.activeItem).toBe(result.item);
    expect(getActiveProjectContext()).toBe(result.item.context);
    expect(projectLibrary.createProject).toHaveBeenCalledWith(
      { name: "Fresh Project" },
      {
        context: result.item.context,
        saveCurrent: false,
      },
    );
    expect(autoSave.start).toHaveBeenCalledWith(result.item.context);
  });

  it("creates an exact project file in a separate context", async () => {
    const initialContext = createTestContext("Current Project");
    initialContext.project.id.value = "current-project";
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext,
      initialItemId: "current-project",
      projectLibrary,
      autoSave,
    });
    const project = makeProjectFile("Guided Project");
    project.guidedDrawing = {
      version: 1,
      width: 8,
      height: 8,
      target: new Array(64).fill(1),
      settings: {
        longSide: 8,
        paletteSource: "generated",
        maxColors: 2,
        mapping: "color",
        simplifyIsolatedPixels: true,
      },
      createdAt: 123,
    };

    const result = await workspace.createProjectFromFile(project, {
      activate: true,
      saveActiveContext: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.context).not.toBe(initialContext);
    expect(result.item.context.project.name.value).toBe("Guided Project");
    expect(result.item.context.guidedDrawing.active).toBe(true);
    expect(initialContext.project.name.value).toBe("Current Project");
    expect(autoSave.saveNow).toHaveBeenCalledWith(initialContext);
    expect(projectLibrary.createProjectFromFile).toHaveBeenCalledWith(project, {
      context: result.item.context,
      saveCurrent: false,
    });
  });

  it("saves the active context before opening another project when requested", async () => {
    const initialContext = createTestContext("Project A");
    initialContext.project.id.value = "project-a";
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext,
      initialItemId: "project-a",
      projectLibrary,
      autoSave,
    });

    const result = await workspace.openProject("project-b", {
      saveActiveContext: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(autoSave.saveNow).toHaveBeenCalledWith(initialContext);
    expect(projectLibrary.openProject).toHaveBeenCalledWith("project-b", {
      context: result.item.context,
      saveCurrent: false,
    });
    expect(initialContext.project.id.value).toBe("project-a");
    expect(result.item.context.project.id.value).toBe("project-b");
  });

  it("refuses to open or create project items past the workspace cap", async () => {
    const firstContext = createTestContext("Project 1");
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    const workspace = new WorkspaceStore({
      initialContext: firstContext,
      initialItemId: "project-1",
      projectLibrary,
      autoSave,
    });

    for (let index = 2; index <= WORKSPACE_OPEN_ITEM_LIMIT; index += 1) {
      const context = createTestContext(`Project ${index}`);
      expectAdded(workspace.addContext(context, { id: `project-${index}` }));
    }

    const openResult = await workspace.openProject("overflow-project");
    const createResult = await workspace.createProject({ name: "Overflow Project" });

    expect(openResult).toEqual({
      ok: false,
      reason: "tab-limit-reached",
      message: `The workspace can keep up to ${WORKSPACE_OPEN_ITEM_LIMIT} projects open at once.`,
    });
    expect(createResult).toEqual(openResult);
    expect(projectLibrary.openProject).not.toHaveBeenCalled();
    expect(projectLibrary.createProject).not.toHaveBeenCalled();
    expect(workspace.items.value).toHaveLength(WORKSPACE_OPEN_ITEM_LIMIT);
  });

  it("disposes a loaded context when the last tab is claimed during opening", async () => {
    const initialContext = createTestContext("Initial Project");
    const projectLibrary = createProjectLibraryMock();
    const autoSave = createAutoSaveMock();
    let disposeLoadedContext: ReturnType<typeof vi.spyOn> | undefined;

    vi.mocked(projectLibrary.openProject).mockImplementation(
      async (projectId, settings = {}) => {
        const loadedContext = settings.context;
        expect(loadedContext).toBeDefined();
        if (!loadedContext) throw new Error("Expected an isolated project context");

        rememberContext(loadedContext);
        disposeLoadedContext = vi.spyOn(loadedContext, "dispose");
        loadedContext.project.id.value = projectId;
        expectAdded(
          workspace.addContext(createTestContext("Competing Project"), {
            id: "competing-project",
            activate: false,
          }),
        );
        return makeProjectFile(`Project ${projectId}`);
      },
    );

    const workspace = new WorkspaceStore({
      initialContext,
      initialItemId: "initial-project",
      itemLimit: 2,
      projectLibrary,
      autoSave,
    });

    const result = await workspace.openProject("overflow-project");

    expect(result).toEqual({
      ok: false,
      reason: "tab-limit-reached",
      message: "The workspace can keep up to 2 projects open at once.",
    });
    expect(disposeLoadedContext).toHaveBeenCalledOnce();
    expect(autoSave.start).not.toHaveBeenCalled();
    expect(workspace.items.value.map((item) => item.id)).toEqual([
      "initial-project",
      "competing-project",
    ]);
  });
});
