import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectLibraryMock = vi.hoisted(() => ({
  listProjects: vi.fn(),
  duplicateProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const autoSaveServiceMock = vi.hoisted(() => ({
  saveNow: vi.fn(),
}));

const activeProjectContextMock = vi.hoisted(() => ({
  project: {
    id: { value: 'open-project' },
    name: { value: 'Open Project' },
  },
}));

const workspaceStoreMock = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  openProject: vi.fn(),
  getProjectItem: vi.fn(),
}));

vi.mock('../../../src/services/project-library', () => ({
  projectLibrary: projectLibraryMock,
}));

vi.mock('../../../src/services/auto-save', () => ({
  autoSaveService: autoSaveServiceMock,
}));

vi.mock('../../../src/stores/project-context', () => ({
  getActiveProjectContext: vi.fn(() => activeProjectContextMock),
}));

vi.mock('../../../src/stores/workspace', () => ({
  workspaceStore: workspaceStoreMock,
}));

import '../../../src/components/app/pf-project-browser';
import type { PFProjectBrowser } from '../../../src/components/app/pf-project-browser';
import { productTelemetry } from '../../../src/services/telemetry';

let originalShowModal: HTMLDialogElement['showModal'] | undefined;
let originalClose: HTMLDialogElement['close'] | undefined;

const dialogPrototype = HTMLDialogElement.prototype as HTMLDialogElement & {
  showModal?: HTMLDialogElement['showModal'];
  close?: HTMLDialogElement['close'];
};

const PROJECTS = [
  {
    id: 'open-project',
    name: 'Open Project',
    width: 64,
    height: 32,
    lastModified: 1_700_000_000_000,
    thumbnail: new Uint8Array([137, 80, 78, 71]),
  },
  {
    id: 'second-project',
    name: 'Second Project',
    width: 16,
    height: 16,
    lastModified: 1_699_999_900_000,
  },
];

async function settle(element: PFProjectBrowser) {
  await Promise.resolve();
  await element.updateComplete;
  await Promise.resolve();
  await element.updateComplete;
}

async function createBrowser() {
  const element = document.createElement('pf-project-browser') as PFProjectBrowser;
  document.body.append(element);
  await settle(element);
  return element;
}

function buttonWithText(root: ShadowRoot, text: string) {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes(text)
  );
}

function projectAction(root: ShadowRoot, projectName: string, action: string) {
  const projectCard = [...root.querySelectorAll<HTMLElement>('article')].find(
    (article) => article.querySelector('.project-name')?.textContent === projectName
  );

  return [...(projectCard?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (button) => button.textContent?.trim() === action
  );
}

function confirmDeleteButton(root: ShadowRoot) {
  return root.querySelector<HTMLButtonElement>('.delete-dialog button.primary.danger');
}

function projectDialog(root: ShadowRoot) {
  return root.querySelector<HTMLDialogElement>('.browser-dialog');
}

function installDialogMocks() {
  originalShowModal = dialogPrototype.showModal;
  originalClose = dialogPrototype.close;

  dialogPrototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });

  dialogPrototype.close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.open) return;

    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
}

function restoreDialogMocks() {
  if (originalShowModal) {
    dialogPrototype.showModal = originalShowModal;
  } else {
    delete dialogPrototype.showModal;
  }

  if (originalClose) {
    dialogPrototype.close = originalClose;
  } else {
    delete dialogPrototype.close;
  }
}

function requestNativeCancel(dialog: HTMLDialogElement | null | undefined) {
  if (!dialog) return;

  const cancelEvent = new Event('cancel', { cancelable: true });
  const shouldClose = dialog.dispatchEvent(cancelEvent);

  if (shouldClose) {
    dialog.close();
  }
}

function closeWithReturnValue(
  dialog: HTMLDialogElement | null | undefined,
  returnValue: string
) {
  if (!dialog) return;

  dialog.returnValue = returnValue;
  dialog.removeAttribute('open');
  dialog.dispatchEvent(new Event('close'));
}

function clickNativeBackdrop(dialog: HTMLDialogElement | null | undefined) {
  if (!dialog) return;

  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    right: 300,
    bottom: 300,
    left: 100,
    width: 200,
    height: 200,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });
  dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 20 }));
}

describe('pf-project-browser', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    installDialogMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_030_000);
    activeProjectContextMock.project.id.value = 'open-project';
    activeProjectContextMock.project.name.value = 'Open Project';
    projectLibraryMock.listProjects.mockResolvedValue([...PROJECTS]);
    projectLibraryMock.duplicateProject.mockResolvedValue('copy-id');
    projectLibraryMock.renameProject.mockResolvedValue(undefined);
    projectLibraryMock.deleteProject.mockResolvedValue(undefined);
    autoSaveServiceMock.saveNow.mockResolvedValue(undefined);
    workspaceStoreMock.openProject.mockResolvedValue({
      ok: true,
      item: {},
      projectId: 'open-project',
    });
    workspaceStoreMock.deleteProject.mockResolvedValue({
      activeItem: { context: activeProjectContextMock },
      installedReplacement: false,
    });
    workspaceStoreMock.getProjectItem.mockImplementation((projectId: string) =>
      projectId === 'open-project' ? { context: activeProjectContextMock } : undefined
    );
  });

  afterEach(() => {
    restoreDialogMocks();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders saved projects and a new-project action', async () => {
    const element = await createBrowser();

    const dialog = projectDialog(element.shadowRoot!);
    expect(dialog?.open).toBe(true);
    expect(dialog?.getAttribute('closedby')).toBe('none');
    expect(dialog?.getAttribute('data-scrollbar')).toBe('both');
    expect(element.shadowRoot?.querySelector('.project-list')?.getAttribute('data-scrollbar')).toBe(
      'vertical'
    );
    expect(element.shadowRoot?.textContent).toContain('Project Library');
    expect(element.shadowRoot?.textContent).toContain('Open Project');
    expect(element.shadowRoot?.textContent).toContain('Second Project');
    expect(buttonWithText(element.shadowRoot!, 'New Project')).toBeTruthy();
    expect(buttonWithText(element.shadowRoot!, 'Guided Drawing')).toBeTruthy();
  });

  it('emits show-new-project-dialog from the native dialog return value', async () => {
    const element = await createBrowser();

    let requested = false;
    element.addEventListener('show-new-project-dialog', () => {
      requested = true;
    });

    closeWithReturnValue(projectDialog(element.shadowRoot!), 'new-project');
    await settle(element);

    expect(requested).toBe(true);
  });

  it('emits the shared guided-drawing setup request from the library', async () => {
    const element = await createBrowser();
    let requested = false;
    element.addEventListener('show-paint-by-number-dialog', () => {
      requested = true;
    });

    closeWithReturnValue(projectDialog(element.shadowRoot!), 'guided-drawing');
    await settle(element);

    expect(requested).toBe(true);
  });

  it('emits project-browser-close from the dialog close button when closing is allowed', async () => {
    const element = await createBrowser();
    element.canClose = true;
    await settle(element);

    let closed = false;
    element.addEventListener('project-browser-close', () => {
      closed = true;
    });

    element.shadowRoot?.querySelector<HTMLButtonElement>('.dialog-header button')?.click();
    await settle(element);

    expect(closed).toBe(true);
  });

  it('emits project-browser-close from Escape and backdrop when closing is allowed', async () => {
    const element = await createBrowser();
    element.canClose = true;
    await settle(element);

    let closeCount = 0;
    element.addEventListener('project-browser-close', () => {
      closeCount += 1;
    });

    requestNativeCancel(projectDialog(element.shadowRoot!));
    await settle(element);

    const dialog = projectDialog(element.shadowRoot!);
    dialog!.showModal();
    clickNativeBackdrop(dialog);
    await settle(element);

    expect(closeCount).toBe(2);
  });

  it('keeps the browser dialog open and locked when closing is not allowed', async () => {
    const element = await createBrowser();

    let closed = false;
    element.addEventListener('project-browser-close', () => {
      closed = true;
    });

    const dialog = projectDialog(element.shadowRoot!);

    expect(dialog?.getAttribute('closedby')).toBe('none');
    expect(element.shadowRoot?.querySelector('.dialog-header button')).toBeNull();

    requestNativeCancel(dialog);
    clickNativeBackdrop(dialog);
    dialog?.close();
    await settle(element);

    expect(closed).toBe(false);
    expect(dialog?.open).toBe(true);
  });

  it('renders project thumbnails from blob URLs and falls back when missing', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:thumbnail');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const element = await createBrowser();

    const image = element.shadowRoot?.querySelector<HTMLImageElement>('.thumbnail img');
    expect(image?.getAttribute('src')).toBe('blob:thumbnail');
    expect(element.shadowRoot?.textContent).toContain('16x16');

    element.remove();

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:thumbnail');
  });

  it('opens a project and emits project-opened', async () => {
    const record = vi.spyOn(productTelemetry, 'record');
    const element = await createBrowser();
    let opened = false;
    element.addEventListener('project-opened', () => {
      opened = true;
    });

    buttonWithText(element.shadowRoot!, 'Open Project')?.click();
    await settle(element);

    expect(workspaceStoreMock.openProject).toHaveBeenCalledWith('open-project', {
      saveActiveContext: false,
    });
    expect(opened).toBe(true);
    expect(record).toHaveBeenCalledWith({
      name: 'project_opened',
      dimensions: { source: 'library' },
    });
  });

  it('renames the active open project through its context', async () => {
    const element = await createBrowser();

    buttonWithText(element.shadowRoot!, 'Rename')?.click();
    await element.updateComplete;

    const input = element.shadowRoot?.querySelector<HTMLInputElement>('input[name="project-name"]');
    expect(input).toBeTruthy();
    input!.value = 'Renamed Project';
    input!.dispatchEvent(new Event('input'));

    element.shadowRoot
      ?.querySelector<HTMLFormElement>('.rename-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(element);

    expect(activeProjectContextMock.project.name.value).toBe('Renamed Project');
    expect(autoSaveServiceMock.saveNow).toHaveBeenCalledWith(activeProjectContextMock);
    expect(projectLibraryMock.renameProject).not.toHaveBeenCalled();
  });

  it('renames the targeted open project while another project is active', async () => {
    const inactiveProjectContext = {
      project: {
        id: { value: 'second-project' },
        name: { value: 'Second Project' },
      },
    };
    workspaceStoreMock.getProjectItem.mockImplementation((projectId: string) => {
      if (projectId === 'open-project') return { context: activeProjectContextMock };
      if (projectId === 'second-project') return { context: inactiveProjectContext };
      return undefined;
    });
    const element = await createBrowser();

    projectAction(element.shadowRoot!, 'Second Project', 'Rename')?.click();
    await element.updateComplete;

    const input = element.shadowRoot?.querySelector<HTMLInputElement>('input[name="project-name"]');
    expect(input).toBeTruthy();
    input!.value = 'Renamed Second Project';
    input!.dispatchEvent(new Event('input'));

    element.shadowRoot
      ?.querySelector<HTMLFormElement>('.rename-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(element);

    expect(inactiveProjectContext.project.name.value).toBe('Renamed Second Project');
    expect(activeProjectContextMock.project.name.value).toBe('Open Project');
    expect(autoSaveServiceMock.saveNow).toHaveBeenCalledWith(inactiveProjectContext);
    expect(projectLibraryMock.renameProject).not.toHaveBeenCalled();
  });

  it('renames a closed project through the library service', async () => {
    const element = await createBrowser();

    projectAction(element.shadowRoot!, 'Second Project', 'Rename')?.click();
    await element.updateComplete;

    const input = element.shadowRoot?.querySelector<HTMLInputElement>('input[name="project-name"]');
    input!.value = 'Stored Project Rename';
    input!.dispatchEvent(new Event('input'));
    element.shadowRoot
      ?.querySelector<HTMLFormElement>('.rename-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(element);

    expect(projectLibraryMock.renameProject).toHaveBeenCalledWith(
      'second-project',
      'Stored Project Rename'
    );
  });

  it('duplicates a project and refreshes the list', async () => {
    const element = await createBrowser();

    buttonWithText(element.shadowRoot!, 'Duplicate')?.click();
    await settle(element);

    expect(autoSaveServiceMock.saveNow).toHaveBeenCalledWith(activeProjectContextMock);
    expect(projectLibraryMock.duplicateProject).toHaveBeenCalledWith('open-project');
    expect(projectLibraryMock.listProjects).toHaveBeenCalledTimes(2);
  });

  it('saves a targeted inactive open project before duplicating it', async () => {
    const inactiveProjectContext = {
      project: {
        id: { value: 'second-project' },
        name: { value: 'Second Project' },
      },
    };
    workspaceStoreMock.getProjectItem.mockImplementation((projectId: string) => {
      if (projectId === 'open-project') return { context: activeProjectContextMock };
      if (projectId === 'second-project') return { context: inactiveProjectContext };
      return undefined;
    });
    const element = await createBrowser();

    projectAction(element.shadowRoot!, 'Second Project', 'Duplicate')?.click();
    await settle(element);

    expect(autoSaveServiceMock.saveNow).toHaveBeenCalledWith(inactiveProjectContext);
    expect(projectLibraryMock.duplicateProject).toHaveBeenCalledWith('second-project');
  });

  it('confirms deletion before deleting a project', async () => {
    activeProjectContextMock.project.id.value = 'different-project';
    const element = await createBrowser();

    buttonWithText(element.shadowRoot!, 'Delete')?.click();
    await element.updateComplete;

    expect(workspaceStoreMock.deleteProject).not.toHaveBeenCalled();
    expect(
      element.shadowRoot?.querySelector('.delete-dialog')?.getAttribute('data-scrollbar')
    ).toBe('vertical');

    confirmDeleteButton(element.shadowRoot!)?.click();
    await settle(element);

    expect(workspaceStoreMock.deleteProject).toHaveBeenCalledWith('open-project');
  });

  it('routes inactive open project deletion through the workspace lifecycle', async () => {
    const inactiveProjectContext = {
      project: {
        id: { value: 'second-project' },
        name: { value: 'Second Project' },
      },
    };
    workspaceStoreMock.getProjectItem.mockImplementation((projectId: string) => {
      if (projectId === 'open-project') return { context: activeProjectContextMock };
      if (projectId === 'second-project') return { context: inactiveProjectContext };
      return undefined;
    });
    const element = await createBrowser();

    projectAction(element.shadowRoot!, 'Second Project', 'Delete')?.click();
    await element.updateComplete;
    confirmDeleteButton(element.shadowRoot!)?.click();
    await settle(element);

    expect(workspaceStoreMock.deleteProject).toHaveBeenCalledWith('second-project');
  });

  it('emits current-project-deleted when the open project is deleted', async () => {
    workspaceStoreMock.deleteProject.mockResolvedValue({
      activeItem: { context: {} },
      installedReplacement: true,
    });
    const element = await createBrowser();
    let deletedCurrent = false;
    element.addEventListener('current-project-deleted', () => {
      deletedCurrent = true;
    });

    buttonWithText(element.shadowRoot!, 'Delete')?.click();
    await element.updateComplete;
    confirmDeleteButton(element.shadowRoot!)?.click();
    await settle(element);

    expect(deletedCurrent).toBe(true);
  });

  it('keeps the browser open when Escape closes the delete confirmation', async () => {
    const element = await createBrowser();
    element.canClose = true;
    await settle(element);

    let browserClosed = false;
    element.addEventListener('project-browser-close', () => {
      browserClosed = true;
    });

    buttonWithText(element.shadowRoot!, 'Delete')?.click();
    await settle(element);

    const browserDialog = projectDialog(element.shadowRoot!);
    const deleteDialog = element.shadowRoot!.querySelector<HTMLDialogElement>('.delete-dialog');
    expect(browserDialog?.open).toBe(true);
    expect(deleteDialog?.open).toBe(true);
    expect(browserDialog?.getAttribute('closedby')).toBe('none');

    requestNativeCancel(deleteDialog);
    await settle(element);

    expect(browserClosed).toBe(false);
    expect(projectDialog(element.shadowRoot!)?.open).toBe(true);
    expect(element.shadowRoot!.querySelector<HTMLDialogElement>('.delete-dialog')?.open).toBe(false);
  });
});
