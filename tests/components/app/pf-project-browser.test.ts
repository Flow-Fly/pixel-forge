import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectLibraryMock = vi.hoisted(() => ({
  listProjects: vi.fn(),
  openProject: vi.fn(),
  createProject: vi.fn(),
  duplicateProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const autoSaveServiceMock = vi.hoisted(() => ({
  saveNow: vi.fn(),
}));

const projectStoreMock = vi.hoisted(() => ({
  id: { value: 'open-project' },
  name: { value: 'Open Project' },
}));

vi.mock('../../../src/services/project-library', () => ({
  projectLibrary: projectLibraryMock,
}));

vi.mock('../../../src/services/auto-save', () => ({
  autoSaveService: autoSaveServiceMock,
}));

vi.mock('../../../src/stores/project', () => ({
  projectStore: projectStoreMock,
}));

import '../../../src/components/app/pf-project-browser';
import type { PFProjectBrowser } from '../../../src/components/app/pf-project-browser';

const PROJECTS = [
  {
    id: 'open-project',
    name: 'Open Project',
    width: 64,
    height: 32,
    lastModified: 1_700_000_000_000,
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

function confirmDeleteButton(root: ShadowRoot) {
  return root.querySelector<HTMLButtonElement>('pf-dialog button.primary.danger');
}

describe('pf-project-browser', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_030_000);
    projectStoreMock.id.value = 'open-project';
    projectStoreMock.name.value = 'Open Project';
    projectLibraryMock.listProjects.mockResolvedValue([...PROJECTS]);
    projectLibraryMock.openProject.mockResolvedValue(undefined);
    projectLibraryMock.duplicateProject.mockResolvedValue('copy-id');
    projectLibraryMock.renameProject.mockResolvedValue(undefined);
    projectLibraryMock.deleteProject.mockResolvedValue(undefined);
    autoSaveServiceMock.saveNow.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders saved projects and a new-project action', async () => {
    const element = await createBrowser();

    expect(element.shadowRoot?.textContent).toContain('Project Library');
    expect(element.shadowRoot?.textContent).toContain('Open Project');
    expect(element.shadowRoot?.textContent).toContain('Second Project');
    expect(buttonWithText(element.shadowRoot!, 'New Project')).toBeTruthy();
  });

  it('opens a project and emits project-opened', async () => {
    const element = await createBrowser();
    let opened = false;
    element.addEventListener('project-opened', () => {
      opened = true;
    });

    buttonWithText(element.shadowRoot!, 'Open Project')?.click();
    await settle(element);

    expect(projectLibraryMock.openProject).toHaveBeenCalledWith('open-project');
    expect(opened).toBe(true);
  });

  it('renames a stored project through the library service', async () => {
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

    expect(projectStoreMock.name.value).toBe('Renamed Project');
    expect(autoSaveServiceMock.saveNow).toHaveBeenCalledOnce();
    expect(projectLibraryMock.renameProject).not.toHaveBeenCalled();
  });

  it('duplicates a project and refreshes the list', async () => {
    const element = await createBrowser();

    buttonWithText(element.shadowRoot!, 'Duplicate')?.click();
    await settle(element);

    expect(autoSaveServiceMock.saveNow).toHaveBeenCalledOnce();
    expect(projectLibraryMock.duplicateProject).toHaveBeenCalledWith('open-project');
    expect(projectLibraryMock.listProjects).toHaveBeenCalledTimes(2);
  });

  it('confirms deletion before deleting a project', async () => {
    projectStoreMock.id.value = 'different-project';
    const element = await createBrowser();

    buttonWithText(element.shadowRoot!, 'Delete')?.click();
    await element.updateComplete;

    expect(projectLibraryMock.deleteProject).not.toHaveBeenCalled();

    confirmDeleteButton(element.shadowRoot!)?.click();
    await settle(element);

    expect(projectLibraryMock.deleteProject).toHaveBeenCalledWith('open-project');
  });

  it('emits current-project-deleted when the open project is deleted', async () => {
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
});
