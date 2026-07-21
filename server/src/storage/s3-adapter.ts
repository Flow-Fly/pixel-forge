import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { BlobStorage } from './blob-storage.js';
import type { StorageConfig } from './config.js';

function requireKey(key: string): void {
  if (key.length === 0) throw new Error('Blob key must not be empty');
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    readonly Code?: string;
    readonly name?: string;
  };
  return candidate.name === 'NoSuchKey' || candidate.Code === 'NoSuchKey';
}

function storageFailure(message: string): Error {
  return new Error(message);
}

export function createS3BlobStorage(config: StorageConfig): BlobStorage {
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    maxAttempts: 1,
    region: config.region,
  });

  return {
    async checkReadiness() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      } catch {
        throw storageFailure('Blob storage readiness check failed');
      }
    },

    close() {
      client.destroy();
    },

    async delete(key) {
      requireKey(key);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
      } catch {
        throw storageFailure('Blob deletion failed');
      }
    },

    async get(key) {
      requireKey(key);
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key })
        );
        if (!response.Body) throw new Error('Object body is missing');
        return await response.Body.transformToByteArray();
      } catch (error) {
        if (isMissingObject(error)) return undefined;
        throw storageFailure('Blob read failed');
      }
    },

    async put(key, bytes) {
      requireKey(key);
      try {
        await client.send(new PutObjectCommand({ Bucket: config.bucket, Body: bytes, Key: key }));
      } catch {
        throw storageFailure('Blob write failed');
      }
    },
  };
}
