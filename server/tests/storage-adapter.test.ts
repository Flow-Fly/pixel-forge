import { describe, expect, it } from 'vitest';
import { createS3BlobStorage } from '../src/storage/s3-adapter.js';

describe('S3 blob adapter failures', () => {
  it('does not expose SDK errors across the server-owned contract', async () => {
    const storage = createS3BlobStorage({
      accessKeyId: 'pixel_forge',
      bucket: 'pixel-forge-dev',
      endpoint: 'http://127.0.0.1:1',
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: 'private-local-secret',
    });

    try {
      await storage.checkReadiness();
      throw new Error('Expected readiness to fail');
    } catch (error) {
      expect(error).toEqual(new Error('Blob storage readiness check failed'));
      expect(Object.hasOwn(error as object, 'cause')).toBe(false);
    } finally {
      storage.close();
    }
  });
});
