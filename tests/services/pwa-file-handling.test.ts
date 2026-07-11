import { describe, expect, it, vi } from 'vitest';
import { PwaFileHandlingService } from '../../src/services/pwa-file-handling';

function fileHandle(file: File): FileSystemFileHandle {
  return {
    kind: 'file',
    name: file.name,
    getFile: vi.fn(async () => file),
    isSameEntry: vi.fn(async () => false),
    createWritable: vi.fn(),
    queryPermission: vi.fn(),
    requestPermission: vi.fn(),
  } as unknown as FileSystemFileHandle;
}

describe('PwaFileHandlingService', () => {
  it('is a quiet no-op when launchQueue is unavailable', () => {
    const importer = { importFiles: vi.fn() };
    const service = new PwaFileHandlingService(importer);

    expect(service.registerLaunchConsumer(undefined)).toBe(false);
    expect(importer.importFiles).not.toHaveBeenCalled();
  });

  it('registers once and delivers multiple launched files in order', async () => {
    const importer = { importFiles: vi.fn(async () => []) };
    const service = new PwaFileHandlingService(importer);
    const setConsumer = vi.fn();
    const launchQueue = { setConsumer } as LaunchQueue;
    const first = new File(['first'], 'first.pf');
    const second = new File(['second'], 'second.ase');

    expect(service.registerLaunchConsumer(launchQueue)).toBe(true);
    expect(service.registerLaunchConsumer(launchQueue)).toBe(false);

    const consumer = setConsumer.mock.calls[0][0] as (params: LaunchParams) => void;
    consumer({ files: [fileHandle(first), fileHandle(second)] });

    await vi.waitFor(() => {
      expect(importer.importFiles).toHaveBeenCalledWith([first, second]);
    });
    expect(setConsumer).toHaveBeenCalledOnce();
  });

  it('continues when the operating system cannot expose one handle', async () => {
    const readable = new File(['project'], 'project.pf');
    const importer = { importFiles: vi.fn(async () => []) };
    const service = new PwaFileHandlingService(importer);
    const unreadable = {
      kind: 'file',
      name: 'private.ase',
      getFile: vi.fn(async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      }),
    } as unknown as FileSystemFileHandle;

    const result = await service.importLaunch({
      files: [unreadable, fileHandle(readable)],
    });

    expect(result.unreadableFiles).toEqual(['private.ase']);
    expect(importer.importFiles).toHaveBeenCalledWith([readable]);
  });
});
