export interface BlobStorage {
  checkReadiness(): Promise<void>;
  close(): void;
  delete(key: string): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  put(key: string, bytes: Uint8Array): Promise<void>;
}
