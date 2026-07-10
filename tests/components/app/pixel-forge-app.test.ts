import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';

const projectRepositoryMock = vi.hoisted(() => ({
  getLastOpenedProjectId: vi.fn(),
  list: vi.fn(),
  load: vi.fn(),
  setLastOpenedProjectId: vi.fn(),
  getWorkspaceState: vi.fn(),
  setWorkspaceState: vi.fn(),
}));

const workspaceStoreMock = vi.hoisted(() => ({
  items: { value: [] },
  activeItemId: { value: '' },
  activate: vi.fn(),
  closeProject: vi.fn(),
  restoreWorkspace: vi.fn(),
}));

const canvasContext = new Proxy(
  { imageSmoothingEnabled: false },
  {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return vi.fn();
    },
    set(target, key, value) {
      (target as Record<PropertyKey, unknown>)[key] = value;
      return true;
    },
  }
);

HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContext);
HTMLElement.prototype.showPopover = vi.fn();
HTMLElement.prototype.hidePopover = vi.fn();

const createdContexts: ProjectContext[] = [];

vi.mock('../../../src/services/persistence/indexed-db', () => ({
  projectRepository: projectRepositoryMock,
}));

vi.mock('../../../src/stores/workspace', () => ({
  WORKSPACE_OPEN_ITEM_LIMIT: 8,
  workspaceItemLimitMessage: () => 'The workspace can keep up to 8 projects open at once.',
  workspaceStore: workspaceStoreMock,
}));

describe('pixel-forge-app project dialogs', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    projectRepositoryMock.getWorkspaceState.mockResolvedValue(null);
    projectRepositoryMock.getLastOpenedProjectId.mockResolvedValue(null);
    projectRepositoryMock.list.mockResolvedValue([]);
    projectRepositoryMock.load.mockResolvedValue(null);
    projectRepositoryMock.setLastOpenedProjectId.mockResolvedValue(undefined);
    projectRepositoryMock.setWorkspaceState.mockResolvedValue(undefined);
    workspaceStoreMock.restoreWorkspace.mockResolvedValue(false);
    workspaceStoreMock.activate.mockReturnValue({
      ok: true,
      item: null,
    });
    workspaceStoreMock.closeProject.mockResolvedValue({
      ok: true,
      closedItem: null,
      activeItem: null,
    });
  });

  afterEach(() => {
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
  });

  it('restores saved workspace state during startup', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const workspaceState = {
      openProjectIds: ['project-a', 'project-b'],
      activeProjectId: 'project-b',
    };
    projectRepositoryMock.getWorkspaceState.mockResolvedValue(workspaceState);
    workspaceStoreMock.restoreWorkspace.mockResolvedValue(true);

    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      hasLibraryProject: boolean;
      showProjectBrowser: boolean;
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);
    await Promise.resolve();
    await element.updateComplete;

    expect(workspaceStoreMock.restoreWorkspace).toHaveBeenCalledWith(workspaceState);
    expect(projectRepositoryMock.getLastOpenedProjectId).not.toHaveBeenCalled();
    expect(element.hasLibraryProject).toBe(true);
    expect(element.showProjectBrowser).toBe(false);
  });

  it('opens the project browser from the project tab strip', async () => {
    await import('../../../src/components/app/pixel-forge-app');

    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      showProjectBrowser: boolean;
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);
    await element.updateComplete;

    element.showProjectBrowser = false;
    await element.updateComplete;

    const tabs = element.shadowRoot?.querySelector('pf-project-tabs');
    tabs?.dispatchEvent(
      new CustomEvent('show-project-browser', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(element.showProjectBrowser).toBe(true);
    expect(element.shadowRoot?.querySelector('pf-project-browser')).toBeTruthy();
  });

  it('renders the canvas surface from the active project context', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const context = createProjectContext();
    createdContexts.push(context);
    context.project.width.value = 37;
    context.project.height.value = 29;
    setActiveProjectContext(context);

    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);
    await element.updateComplete;

    const drawingCanvas = element.shadowRoot?.querySelector('pf-drawing-canvas') as
      | (HTMLElement & { width: number; height: number })
      | null;

    expect(drawingCanvas?.width).toBe(37);
    expect(drawingCanvas?.height).toBe(29);
  });

  it('opens the new-project dialog when the project browser requests it', async () => {
    await import('../../../src/components/app/pixel-forge-app');

    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      hasLibraryProject: boolean;
      showNewProjectDialog: boolean;
      showProjectBrowser: boolean;
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);
    await element.updateComplete;

    element.hasLibraryProject = false;
    element.showProjectBrowser = true;
    element.showNewProjectDialog = false;
    await element.updateComplete;

    const browser = element.shadowRoot?.querySelector('pf-project-browser');
    browser?.dispatchEvent(
      new CustomEvent('show-new-project-dialog', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(element.showProjectBrowser).toBe(false);
    expect(element.showNewProjectDialog).toBe(true);
    expect(element.shadowRoot?.querySelector('pf-project-browser')).toBeNull();
    expect(element.shadowRoot?.querySelector('pf-new-project-dialog')?.open).toBe(true);
  });
});
