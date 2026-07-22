import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';
import { autoSaveService } from '../../../src/services/auto-save';
import { projectLibrary } from '../../../src/services/project-library';
import { productTelemetry } from '../../../src/services/telemetry';

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
  deleteProject: vi.fn(),
  restoreWorkspace: vi.fn(),
}));

const pwaFileHandlingMock = vi.hoisted(() => ({
  registerLaunchConsumer: vi.fn(),
}));

const projectFileHandlingMock = vi.hoisted(() => ({
  importProjectFiles: vi.fn(),
  supportedProjectFiles: vi.fn((files: Iterable<File>) =>
    Array.from(files).filter((file) => /\.(?:pf|json|ase|aseprite)$/i.test(file.name))
  ),
  describeProjectFileImport: vi.fn(() => 'Opened portrait.pf.'),
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

vi.mock('../../../src/services/pwa-file-handling', () => ({
  pwaFileHandling: pwaFileHandlingMock,
}));

vi.mock('../../../src/services/project-file-handling', () => ({
  PROJECT_FILE_IMPORT_REPORT_EVENT: 'project-file-import-report',
  ...projectFileHandlingMock,
}));

describe('pixel-forge-app project dialogs', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.clear();
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
    workspaceStoreMock.deleteProject.mockResolvedValue({
      activeItem: null,
      installedReplacement: false,
    });
    projectFileHandlingMock.importProjectFiles.mockResolvedValue({
      outcomes: [],
      unreadableFiles: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
  });

  it('duplicates the project active when the action starts', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const contextA = createProjectContext();
    const contextB = createProjectContext();
    contextA.project.id.value = 'project-a';
    contextB.project.id.value = 'project-b';
    createdContexts.push(contextA, contextB);
    setActiveProjectContext(contextB);
    const saveNow = vi.spyOn(autoSaveService, 'saveNow').mockResolvedValue();
    const duplicateProject = vi
      .spyOn(projectLibrary, 'duplicateProject')
      .mockResolvedValue('project-b-copy');
    const element = document.createElement('pixel-forge-app') as HTMLElement;
    document.body.append(element);

    window.dispatchEvent(new CustomEvent('duplicate-current-project'));
    await vi.waitFor(() => {
      expect(duplicateProject).toHaveBeenCalled();
    });

    expect(saveNow).toHaveBeenCalledWith(contextB);
    expect(duplicateProject).toHaveBeenCalledWith('project-b');
  });

  it('deletes the project active when confirmation opened', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const contextA = createProjectContext();
    const contextB = createProjectContext();
    contextA.project.id.value = 'project-a';
    contextB.project.id.value = 'project-b';
    createdContexts.push(contextA, contextB);
    setActiveProjectContext(contextB);
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);

    window.dispatchEvent(new CustomEvent('delete-current-project'));
    await element.updateComplete;
    setActiveProjectContext(contextA);
    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('pf-dialog button.primary')
      ?.click();
    await vi.waitFor(() => {
      expect(workspaceStoreMock.deleteProject).toHaveBeenCalled();
    });

    expect(workspaceStoreMock.deleteProject).toHaveBeenCalledWith('project-b');
  });

  it('guards current-project deletion while the request is pending', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const context = createProjectContext();
    context.project.id.value = 'project-to-delete';
    createdContexts.push(context);
    setActiveProjectContext(context);
    let finishDelete!: () => void;
    workspaceStoreMock.deleteProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelete = () =>
            resolve({
              activeItem: null,
              installedReplacement: true,
            });
        })
    );
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);

    window.dispatchEvent(new CustomEvent('delete-current-project'));
    await element.updateComplete;
    const deleteButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      'pf-dialog button.primary'
    );

    deleteButton?.click();
    deleteButton?.click();
    await element.updateComplete;

    const pendingDialog = element.shadowRoot?.querySelector<HTMLElement & {
      closeOnBackdrop: boolean;
      closeOnEscape: boolean;
      showCloseButton: boolean;
    }>('pf-dialog');
    const pendingDeleteButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      'pf-dialog button.primary'
    );
    expect(workspaceStoreMock.deleteProject).toHaveBeenCalledOnce();
    expect(pendingDeleteButton?.disabled).toBe(true);
    expect(pendingDeleteButton?.textContent).toContain('Deleting...');
    expect(pendingDialog?.closeOnBackdrop).toBe(false);
    expect(pendingDialog?.closeOnEscape).toBe(false);
    expect(pendingDialog?.showCloseButton).toBe(false);

    finishDelete();
    await vi.waitFor(() => {
      expect(pendingDialog?.open).toBe(false);
    });
  });

  it('keeps a failed current-project deletion inline and announced', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const context = createProjectContext();
    context.project.id.value = 'project-delete-failure';
    createdContexts.push(context);
    setActiveProjectContext(context);
    workspaceStoreMock.deleteProject.mockRejectedValueOnce(new Error('delete failed'));
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);

    window.dispatchEvent(new CustomEvent('delete-current-project'));
    await element.updateComplete;
    element.shadowRoot?.querySelector<HTMLButtonElement>('pf-dialog button.primary')?.click();

    await vi.waitFor(() => {
      const alert = element.shadowRoot?.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('Could not delete project');
    });
    expect(element.shadowRoot?.querySelector<HTMLElement>('pf-dialog')?.open).toBe(true);
  });

  it('warns before unload when any autosaved project is dirty', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const inactiveContext = createProjectContext();
    createdContexts.push(inactiveContext);
    autoSaveService.start(inactiveContext);
    autoSaveService.markDirty(inactiveContext);
    const element = document.createElement('pixel-forge-app') as HTMLElement;
    document.body.append(element);
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('opens export with the project active when the action starts', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const contextA = createProjectContext();
    const contextB = createProjectContext();
    createdContexts.push(contextA, contextB);
    setActiveProjectContext(contextB);
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);

    window.dispatchEvent(new CustomEvent('show-export-dialog'));
    setActiveProjectContext(contextA);
    await element.updateComplete;

    const dialog = element.shadowRoot?.querySelector<HTMLElement & {
      context: ProjectContext | null;
      open: boolean;
    }>('pf-export-dialog');
    expect(dialog?.open).toBe(true);
    expect(dialog?.context).toBe(contextB);
  });

  it('captures a fresh project context each time export is reopened', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const contextA = createProjectContext();
    const contextB = createProjectContext();
    contextA.project.name.value = 'Tab A';
    contextB.project.name.value = 'Tab B';
    createdContexts.push(contextA, contextB);
    setActiveProjectContext(contextB);
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);

    window.dispatchEvent(new CustomEvent('show-export-dialog'));
    await element.updateComplete;

    const dialog = element.shadowRoot?.querySelector<HTMLElement & {
      context: ProjectContext | null;
      open: boolean;
      updateComplete: Promise<unknown>;
    }>('pf-export-dialog');
    expect(dialog?.context).toBe(contextB);

    dialog?.shadowRoot?.querySelector<HTMLButtonElement>('.btn-cancel')?.click();
    await dialog?.updateComplete;
    await element.updateComplete;

    setActiveProjectContext(contextA);
    window.dispatchEvent(new CustomEvent('show-export-dialog'));
    await element.updateComplete;
    await dialog?.updateComplete;

    expect(dialog?.open).toBe(true);
    expect(dialog?.context).toBe(contextA);
    expect(dialog?.shadowRoot?.querySelector<HTMLInputElement>('#export-filename')?.value).toBe(
      'Tab A'
    );
  });

  it('restores saved workspace state during startup', async () => {
    const record = vi.spyOn(productTelemetry, 'record');
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
    expect(record).toHaveBeenCalledWith({
      name: 'project_opened',
      dimensions: { source: 'session_restore' },
    });
  });

  it('starts in the editor when no saved project can be restored', async () => {
    await import('../../../src/components/app/pixel-forge-app');

    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      hasLibraryProject: boolean;
      showProjectBrowser: boolean;
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);

    await vi.waitFor(() => {
      expect(projectRepositoryMock.list).toHaveBeenCalled();
    });
    await element.updateComplete;

    expect(element.hasLibraryProject).toBe(false);
    expect(element.showProjectBrowser).toBe(false);
    expect(element.shadowRoot?.querySelector('pf-project-browser')).toBeNull();
    expect(element.shadowRoot?.querySelector('pf-drawing-canvas')).toBeTruthy();
  });

  it('waits for workspace restoration before accepting operating-system files', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    let finishWorkspaceRead: ((value: null) => void) | undefined;
    projectRepositoryMock.getWorkspaceState.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          finishWorkspaceRead = resolve;
        })
    );
    const element = document.createElement('pixel-forge-app') as HTMLElement;

    document.body.append(element);
    await Promise.resolve();

    expect(pwaFileHandlingMock.registerLaunchConsumer).not.toHaveBeenCalled();

    finishWorkspaceRead?.(null);
    await vi.waitFor(() => {
      expect(pwaFileHandlingMock.registerLaunchConsumer).toHaveBeenCalledOnce();
    });
  });

  it('imports supported dropped files and prevents unsupported drops from navigating away', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement;
    document.body.append(element);
    await vi.waitFor(() => {
      expect(pwaFileHandlingMock.registerLaunchConsumer).toHaveBeenCalledOnce();
    });
    const project = new File(['project'], 'portrait.pf');
    const notes = new File(['notes'], 'notes.txt');
    const supportedDrag = fileTransferEvent('dragover', [project, notes]);
    const supportedDrop = fileTransferEvent('drop', [project, notes]);

    window.dispatchEvent(supportedDrag);
    window.dispatchEvent(supportedDrop);

    expect(supportedDrag.defaultPrevented).toBe(true);
    expect(supportedDrop.defaultPrevented).toBe(true);
    expect(projectFileHandlingMock.importProjectFiles).toHaveBeenCalledWith([project]);

    projectFileHandlingMock.importProjectFiles.mockClear();
    const unsupportedDrop = fileTransferEvent('drop', [notes]);
    window.dispatchEvent(unsupportedDrop);

    expect(unsupportedDrop.defaultPrevented).toBe(true);
    expect(projectFileHandlingMock.importProjectFiles).not.toHaveBeenCalled();
  });

  it('accepts protected file drags before the browser exposes their files', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement;
    document.body.append(element);
    await vi.waitFor(() => {
      expect(pwaFileHandlingMock.registerLaunchConsumer).toHaveBeenCalledOnce();
    });
    const drag = protectedFileDragEvent();

    window.dispatchEvent(drag);

    expect(drag.defaultPrevented).toBe(true);
    expect(projectFileHandlingMock.importProjectFiles).not.toHaveBeenCalled();
  });

  it('announces project import results with dismissible, polite feedback', async () => {
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      hasLibraryProject: boolean;
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);
    const project = new File([], 'portrait.pf');

    window.dispatchEvent(
      new CustomEvent('project-file-import-report', {
        detail: {
          outcomes: [
            {
              file: project,
              ok: true,
              result: { projectId: 'portrait', opened: true },
            },
          ],
          unreadableFiles: [],
        },
      })
    );
    await element.updateComplete;

    const status = element.shadowRoot?.querySelector('[role="status"]');
    expect(status?.textContent).toBe('Opened portrait.pf.');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(element.hasLibraryProject).toBe(true);

    element.shadowRoot?.querySelector<HTMLButtonElement>('.file-import-status button')?.click();
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector('.file-import-status')).toBeNull();
  });

  it('opens the project browser from the project tab strip', async () => {
    await import('../../../src/components/app/pixel-forge-app');

    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      showProjectBrowser: boolean;
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);
    await vi.waitFor(() => {
      expect(projectRepositoryMock.list).toHaveBeenCalled();
    });
    await element.updateComplete;

    element.showProjectBrowser = false;
    await element.updateComplete;

    const tabs = element.shadowRoot?.querySelector('pf-project-tabs');
    tabs?.dispatchEvent(
      new CustomEvent('show-project-browser', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(element.showProjectBrowser).toBe(true);
    const browser = element.shadowRoot?.querySelector('pf-project-browser');
    expect(browser).toBeTruthy();
    expect(browser?.canClose).toBe(true);

    browser?.dispatchEvent(
      new CustomEvent('project-browser-close', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(element.showProjectBrowser).toBe(false);
    expect(element.shadowRoot?.querySelector('pf-project-browser')).toBeNull();
  });

  it('requires another project after deleting the active library project', async () => {
    await import('../../../src/components/app/pixel-forge-app');

    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      hasLibraryProject: boolean;
      showProjectBrowser: boolean;
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);
    await element.updateComplete;

    element.hasLibraryProject = true;
    element.showProjectBrowser = true;
    await element.updateComplete;

    const browser = element.shadowRoot?.querySelector('pf-project-browser');
    browser?.dispatchEvent(
      new CustomEvent('current-project-deleted', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    const requiredBrowser = element.shadowRoot?.querySelector('pf-project-browser');
    expect(element.hasLibraryProject).toBe(false);
    expect(element.showProjectBrowser).toBe(true);
    expect(requiredBrowser?.canClose).toBe(false);

    requiredBrowser?.dispatchEvent(
      new CustomEvent('project-browser-close', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(element.showProjectBrowser).toBe(true);
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

    element.shadowRoot?.querySelector('pf-new-project-dialog')?.dispatchEvent(
      new CustomEvent('close', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(element.showNewProjectDialog).toBe(false);
    expect(element.showProjectBrowser).toBe(false);
  });

  it('opens guided setup when the project browser requests it', async () => {
    await import('../../../src/components/app/pixel-forge-app');

    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      hasLibraryProject: boolean;
      showPaintByNumberDialog: boolean;
      showProjectBrowser: boolean;
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);
    await element.updateComplete;

    element.hasLibraryProject = false;
    element.showProjectBrowser = true;
    element.showPaintByNumberDialog = false;
    await element.updateComplete;

    const browser = element.shadowRoot?.querySelector('pf-project-browser');
    browser?.dispatchEvent(
      new CustomEvent('show-paint-by-number-dialog', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(element.showProjectBrowser).toBe(false);
    expect(element.showPaintByNumberDialog).toBe(true);
    expect(element.shadowRoot?.querySelector('pf-project-browser')).toBeNull();
    expect(element.shadowRoot?.querySelector('pf-paint-by-number-dialog')?.open).toBe(true);

    element.shadowRoot?.querySelector('pf-paint-by-number-dialog')?.dispatchEvent(
      new CustomEvent('close', { bubbles: true, composed: true })
    );
    await element.updateComplete;

    expect(element.showPaintByNumberDialog).toBe(false);
    expect(element.showProjectBrowser).toBe(false);
  });

  it('restores the sidebar width with accessible separator values', async () => {
    vi.stubGlobal('innerWidth', 1280);
    localStorage.setItem('pf-sidebar-width', '360');
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };

    document.body.append(element);
    await element.updateComplete;

    const separator = element.shadowRoot?.querySelector<HTMLElement>('.sidebar-resize-handle');
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('360px');
    expect(separator?.getAttribute('role')).toBe('separator');
    expect(separator?.getAttribute('aria-orientation')).toBe('vertical');
    expect(separator?.getAttribute('aria-valuemin')).toBe('240');
    expect(separator?.getAttribute('aria-valuemax')).toBe('480');
    expect(separator?.getAttribute('aria-valuenow')).toBe('360');
    expect(separator?.tabIndex).toBe(0);
  }, 15_000);

  it('resizes and persists the sidebar through the pointer lifecycle', async () => {
    vi.stubGlobal('innerWidth', 1280);
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);
    await element.updateComplete;
    const separator = element.shadowRoot?.querySelector<HTMLElement>('.sidebar-resize-handle');
    const start = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 992,
      bubbles: true,
      cancelable: true,
    });

    separator?.dispatchEvent(start);
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 920 }));
    await element.updateComplete;

    expect(start.defaultPrevented).toBe(true);
    expect(document.body.style.cursor).toBe('ew-resize');
    expect(document.body.style.userSelect).toBe('none');
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('360px');

    document.dispatchEvent(new PointerEvent('pointerup'));
    expect(localStorage.getItem('pf-sidebar-width')).toBe('360');
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 800 }));
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('360px');
  }, 15_000);

  it('tracks one pointer and cleans up when the browser loses focus', async () => {
    vi.stubGlobal('innerWidth', 1280);
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);
    await element.updateComplete;
    const separator = element.shadowRoot?.querySelector<HTMLElement>('.sidebar-resize-handle');
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(separator ?? {}, {
      setPointerCapture,
      hasPointerCapture: () => true,
      releasePointerCapture,
    });

    separator?.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 7,
        button: 0,
        clientX: 992,
        cancelable: true,
      })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 8, clientX: 800, cancelable: true })
    );
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('288px');
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8 }));
    expect(document.body.style.cursor).toBe('ew-resize');

    document.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 7, clientX: 920, cancelable: true })
    );
    window.dispatchEvent(new Event('blur'));
    await element.updateComplete;

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('360px');
    expect(localStorage.getItem('pf-sidebar-width')).toBe('360');
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    document.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 7, clientX: 800, cancelable: true })
    );
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('360px');
  }, 15_000);

  it('supports arrow-key resizing and Home reset', async () => {
    vi.stubGlobal('innerWidth', 1280);
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);
    await element.updateComplete;
    const separator = element.shadowRoot?.querySelector<HTMLElement>('.sidebar-resize-handle');

    separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    await element.updateComplete;
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('304px');

    separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    await element.updateComplete;
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('288px');

    localStorage.setItem('pf-sidebar-width', '420');
    separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', cancelable: true }));
    await element.updateComplete;
    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('288px');
    expect(localStorage.getItem('pf-sidebar-width')).toBe('288');
  }, 15_000);

  it('hides the resize affordance when the viewport only fits the minimum', async () => {
    vi.stubGlobal('innerWidth', 600);
    localStorage.setItem('pf-sidebar-width', '420');
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);
    await element.updateComplete;
    const separator = element.shadowRoot?.querySelector<HTMLElement>('.sidebar-resize-handle');

    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('240px');
    expect(separator?.hidden).toBe(true);
    expect(separator?.tabIndex).toBe(-1);
    expect(localStorage.getItem('pf-sidebar-width')).toBe('420');

    vi.stubGlobal('innerWidth', 1280);
    window.dispatchEvent(new Event('resize'));
    await element.updateComplete;

    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('420px');
    expect(separator?.hidden).toBe(false);
    expect(separator?.getAttribute('aria-valuemax')).toBe('480');
  }, 15_000);

  it('cleans up an active sidebar resize when disconnected', async () => {
    vi.stubGlobal('innerWidth', 1280);
    await import('../../../src/components/app/pixel-forge-app');
    const element = document.createElement('pixel-forge-app') as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(element);
    await element.updateComplete;
    const separator = element.shadowRoot?.querySelector<HTMLElement>('.sidebar-resize-handle');

    separator?.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, clientX: 992, cancelable: true })
    );
    element.remove();
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 900 }));

    expect(element.style.getPropertyValue('--pf-sidebar-width')).toBe('288px');
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  }, 15_000);
});

function fileTransferEvent(type: 'dragover' | 'drop', files: File[]): DragEvent {
  const event = new Event(type, { cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files,
      items: [],
      dropEffect: 'none',
    },
  });
  return event;
}

function protectedFileDragEvent(): DragEvent {
  const event = new Event('dragover', { cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files: [],
      items: [{ kind: 'file', getAsFile: () => null }],
      types: ['Files'],
      dropEffect: 'none',
    },
  });
  return event;
}
