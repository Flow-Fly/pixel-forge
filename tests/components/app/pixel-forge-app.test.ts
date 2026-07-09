import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

vi.mock('../../../src/services/persistence/indexed-db', () => ({
  projectRepository: projectRepositoryMock,
}));

vi.mock('../../../src/stores/workspace', () => ({
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
