/**
 * Object storage for photos (ADR-0006): a private S3-compatible bucket
 * (Hetzner Object Storage in production, MinIO locally). The API never
 * proxies bytes — it signs URLs the phone uploads to and reads from.
 * Implementations: `s3Storage` (`./s3`), `memoryStorage` (tests).
 */
export interface ObjectStorage {
  /**
   * A browser-style POST upload (multipart form: `fields` first, then the
   * file as `file`). The policy pins the key, the content type and the size,
   * so the bucket itself rejects anything else.
   */
  presignUpload(key: string, options: UploadOptions): Promise<PresignedUpload>;
  /** A short-lived GET URL for a private object. */
  signedReadUrl(key: string, options: { expiresInSeconds: number }): Promise<string>;
  /** Deletes objects; missing ones are fine. Throws when the store refuses. */
  deleteObjects(keys: readonly string[]): Promise<void>;
}

export interface UploadOptions {
  contentType: string;
  maxBytes: number;
  expiresInSeconds: number;
}

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
}

/**
 * In-memory storage for tests: URLs are fake, uploads are simulated with
 * `put`. `objects` holds what is "in the bucket".
 */
export function memoryStorage(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const objects = new Map<string, { contentType: string }>();
  const expiry = (seconds: number) => new Date(now().getTime() + seconds * 1000).toISOString();
  const storage: ObjectStorage = {
    async presignUpload(key, { contentType, maxBytes, expiresInSeconds }) {
      return {
        url: 'https://storage.test/upload',
        fields: { key, 'Content-Type': contentType, maxBytes: String(maxBytes), expires: expiry(expiresInSeconds) },
      };
    },
    async signedReadUrl(key, { expiresInSeconds }) {
      return `https://storage.test/${key}?expires=${expiry(expiresInSeconds)}`;
    },
    async deleteObjects(keys) {
      for (const key of keys) objects.delete(key);
    },
  };
  return {
    ...storage,
    objects,
    /** What the phone does with a presigned upload. */
    put(upload: PresignedUpload) {
      objects.set(upload.fields.key!, { contentType: upload.fields['Content-Type']! });
    },
  };
}

export type MemoryStorage = ReturnType<typeof memoryStorage>;
