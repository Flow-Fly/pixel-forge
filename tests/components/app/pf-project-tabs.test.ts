import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestProjectContext = {
  project: {
    name: {
      value: string;
    };
  };
};

type TestWorkspaceItem = {
  id: string;
  context: TestProjectContext;
};

const workspaceStoreMock = vi.hoisted(() => ({
  items: { value: [] as TestWorkspaceItem[] },
  activeItemId: { value: '' },
  activate: vi.fn(),
  closeProject: vi.fn(),
}));

const autoSaveServiceMock = vi.hoisted(() => ({
  dirtyContexts: new Set<TestProjectContext>(),
  isDirty: vi.fn((context: TestProjectContext) => autoSaveServiceMock.dirtyContexts.has(context)),
}));

vi.mock('../../../src/stores/workspace', () => ({
  WORKSPACE_OPEN_ITEM_LIMIT: 8,
  workspaceItemLimitMessage: () => 'The workspace can keep up to 8 projects open at once.',
  workspaceStore: workspaceStoreMock,
}));

vi.mock('../../../src/services/auto-save', () => ({
  autoSaveService: autoSaveServiceMock,
}));

import '../../../src/components/app/pf-project-tabs';
import type { PFProjectTabs } from '../../../src/components/app/pf-project-tabs';

const projectA = createWorkspaceItem('project-a', 'Project A');
const projectB = createWorkspaceItem('project-b', 'Project B');

function createWorkspaceItem(id: string, name: string): TestWorkspaceItem {
  return {
    id,
    context: {
      project: {
        name: { value: name },
      },
    },
  };
}

async function settle(element: PFProjectTabs) {
  await Promise.resolve();
  await element.updateComplete;
  await Promise.resolve();
  await element.updateComplete;
}

async function createTabs() {
  const element = document.createElement('pf-project-tabs') as PFProjectTabs;
  document.body.append(element);
  await settle(element);
  return element;
}

function buttonWithLabel(root: ShadowRoot, label: string) {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === label
  );
}

describe('pf-project-tabs', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    workspaceStoreMock.items.value = [projectA, projectB];
    workspaceStoreMock.activeItemId.value = 'project-a';
    workspaceStoreMock.activate.mockImplementation((itemId: string) => ({
      ok: true,
      item: workspaceStoreMock.items.value.find((item) => item.id === itemId),
    }));
    workspaceStoreMock.closeProject.mockResolvedValue({
      ok: true,
      closedItem: projectA,
      activeItem: projectB,
    });
    autoSaveServiceMock.dirtyContexts.clear();
    autoSaveServiceMock.isDirty.mockClear();
  });

  it('renders workspace items with the active project marked', async () => {
    const element = await createTabs();

    const activeButton = buttonWithLabel(element.shadowRoot!, 'Project A');
    const inactiveButton = buttonWithLabel(element.shadowRoot!, 'Project B');

    expect(activeButton?.getAttribute('aria-current')).toBe('page');
    expect(inactiveButton?.getAttribute('aria-current')).toBe('false');
  });

  it('marks dirty projects in the tab label', async () => {
    autoSaveServiceMock.dirtyContexts.add(projectB.context);

    const element = await createTabs();

    expect(buttonWithLabel(element.shadowRoot!, 'Project B, unsaved changes')).toBeTruthy();
  });

  it('activates a clicked tab', async () => {
    const element = await createTabs();

    buttonWithLabel(element.shadowRoot!, 'Project B')?.click();
    await settle(element);

    expect(workspaceStoreMock.activate).toHaveBeenCalledWith('project-b');
  });

  it('closes a tab through the workspace store', async () => {
    const element = await createTabs();

    buttonWithLabel(element.shadowRoot!, 'Close Project A')?.click();
    await settle(element);

    expect(workspaceStoreMock.closeProject).toHaveBeenCalledWith('project-a');
  });

  it('keeps a compact close action bound to the active project', async () => {
    workspaceStoreMock.items.value = Array.from({ length: 8 }, (_, index) =>
      createWorkspaceItem(`project-${index + 1}`, `Long Project Name ${index + 1}`)
    );
    workspaceStoreMock.activeItemId.value = 'project-8';
    const element = await createTabs();

    const compactCloseButton =
      element.shadowRoot?.querySelector<HTMLButtonElement>('.active-close-button');
    expect(compactCloseButton?.getAttribute('aria-label')).toBe('Close Long Project Name 8');

    compactCloseButton?.click();
    await settle(element);

    expect(workspaceStoreMock.closeProject).toHaveBeenCalledWith('project-8');
  });

  it('closes a tab through the same path on middle click', async () => {
    const element = await createTabs();
    const tabButton = buttonWithLabel(element.shadowRoot!, 'Project A');

    tabButton?.dispatchEvent(
      new MouseEvent('auxclick', {
        bubbles: true,
        composed: true,
        button: 1,
      })
    );
    await settle(element);

    expect(workspaceStoreMock.closeProject).toHaveBeenCalledWith('project-a');
  });

  it('emits the project browser event from the plus button', async () => {
    const element = await createTabs();
    let didOpenBrowser = false;
    element.addEventListener('show-project-browser', () => {
      didOpenBrowser = true;
    });

    buttonWithLabel(element.shadowRoot!, 'Open project')?.click();
    await settle(element);

    expect(didOpenBrowser).toBe(true);
  });

  it('shows a message instead of opening the browser at the tab cap', async () => {
    workspaceStoreMock.items.value = Array.from({ length: 8 }, (_, index) =>
      createWorkspaceItem(`project-${index + 1}`, `Project ${index + 1}`)
    );
    const element = await createTabs();
    let didOpenBrowser = false;
    element.addEventListener('show-project-browser', () => {
      didOpenBrowser = true;
    });

    buttonWithLabel(element.shadowRoot!, 'Open project')?.click();
    await settle(element);

    expect(didOpenBrowser).toBe(false);
    expect(element.shadowRoot?.textContent).toContain(
      'The workspace can keep up to 8 projects open at once.'
    );
  });

  it('clears tab-cap feedback after six seconds', async () => {
    vi.useFakeTimers();
    workspaceStoreMock.items.value = Array.from({ length: 8 }, (_, index) =>
      createWorkspaceItem(`project-${index + 1}`, `Project ${index + 1}`)
    );
    const element = await createTabs();

    buttonWithLabel(element.shadowRoot!, 'Open project')?.click();
    await settle(element);
    expect(element.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain(
      'The workspace can keep up to 8 projects open at once.'
    );

    await vi.advanceTimersByTimeAsync(6000);
    await settle(element);

    expect(element.shadowRoot?.querySelector('[role="status"]')?.textContent).toBe('');
    expect(element.shadowRoot?.querySelector('.error')).toBeNull();
    vi.useRealTimers();
  });
});
