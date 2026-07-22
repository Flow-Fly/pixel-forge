import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceStoreMock = vi.hoisted(() => ({
  createProject: vi.fn(),
}));

vi.mock('../../../src/stores/workspace', () => ({
  workspaceStore: workspaceStoreMock,
}));

import '../../../src/components/dialogs/pf-new-project-dialog';
import type { PFNewProjectDialog } from '../../../src/components/dialogs/pf-new-project-dialog';
import { productTelemetry } from '../../../src/services/telemetry';

async function settle(element: PFNewProjectDialog) {
  await Promise.resolve();
  await element.updateComplete;
  await Promise.resolve();
  await element.updateComplete;
}

async function createDialog() {
  const element = document.createElement('pf-new-project-dialog') as PFNewProjectDialog;
  element.open = true;
  document.body.append(element);
  await settle(element);
  return element;
}

describe('pf-new-project-dialog', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    workspaceStoreMock.createProject.mockResolvedValue({
      ok: true,
      item: {},
      projectId: 'created-project',
    });
  });

  it('creates projects through the workspace store', async () => {
    const record = vi.spyOn(productTelemetry, 'record');
    const element = await createDialog();
    element.saveCurrentBeforeCreate = true;
    await settle(element);

    let createdProjectId = '';
    element.addEventListener('project-created', (event) => {
      createdProjectId = (event as CustomEvent<{ id: string }>).detail.id;
    });

    element.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle(element);

    expect(workspaceStoreMock.createProject).toHaveBeenCalledWith(
      { width: 64, height: 64 },
      { saveActiveContext: true }
    );
    expect(createdProjectId).toBe('created-project');
    expect(element.open).toBe(false);
    expect(record).toHaveBeenCalledWith({
      name: 'project_created',
      dimensions: { source: 'blank' },
    });
  });
});
