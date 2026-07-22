import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileService } from '../../src/services/file-service';

describe('FileService static WebP export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // #412: Completion must represent blob creation and download dispatch.
  it('stays pending until the WebP blob is downloaded', async () => {
    let receiveBlob: BlobCallback | undefined;
    const canvas = {
      toBlob: vi.fn((callback: BlobCallback) => {
        receiveBlob = callback;
      }),
    } as unknown as HTMLCanvasElement;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pixel-forge-export');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const completion = FileService.exportToWebP(canvas, 'drawing');
    let completed = false;
    void completion.then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);

    receiveBlob?.(new Blob(['webp'], { type: 'image/webp' }));

    await expect(completion).resolves.toBeUndefined();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pixel-forge-export');
  });

  it('rejects when the canvas cannot create a WebP blob', async () => {
    const canvas = {
      toBlob: vi.fn((callback: BlobCallback) => callback(null)),
    } as unknown as HTMLCanvasElement;

    await expect(FileService.exportToWebP(canvas, 'drawing')).rejects.toThrow(
      'Failed to create WebP blob'
    );
  });
});
