/**
 * Object storage for photos (ADR-0006, ADR-0020): a private bucket in any
 * S3-compatible store (Cloudflare R2 in production, a local S3 store in
 * development). The API never proxies bytes — it signs URLs the phone uploads
 * to and reads from. Only features every S3-compatible store has are used:
 * presigned PUT and GET, HEAD and DELETE.
 * Implementations: `s3Storage` (`./s3`), `memoryStorage` (tests).
 */
export interface ObjectStorage {
  /**
   * A presigned PUT upload: the phone sends the file as the request body with
   * exactly `headers` (the signed `Content-Type`). A PUT URL can't limit the
   * size, so the API checks the object with `inspectObject` before using it.
   */
  presignUpload(key: string, options: UploadOptions): Promise<PresignedUpload>;
  /** A short-lived GET URL for a private object. */
  signedReadUrl(key: string, options: { expiresInSeconds: number }): Promise<string>;
  /** Size and content type of a stored object; `null` when there is none. Throws when the store refuses. */
  inspectObject(key: string): Promise<ObjectInfo | null>;
  /** Deletes objects; missing ones are fine. Throws when the store refuses. */
  deleteObjects(keys: readonly string[]): Promise<void>;
}

export interface UploadOptions {
  contentType: string;
  expiresInSeconds: number;
}

export interface PresignedUpload {
  method: 'PUT';
  url: string;
  /** Headers the upload must send exactly as given (they are part of the signature). */
  headers: Record<string, string>;
}

export interface ObjectInfo {
  /** Bytes. */
  size: number;
  /** `null` when the store has none. */
  contentType: string | null;
}

/**
 * In-memory storage for tests: URLs are fake, uploads are simulated with
 * `put`. `objects` holds what is "in the bucket".
 */
export function memoryStorage(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const objects = new Map<string, ObjectInfo>();
  const expiry = (seconds: number) => new Date(now().getTime() + seconds * 1000).toISOString();
  const keyOf = (upload: PresignedUpload) => decodeURIComponent(new URL(upload.url).pathname.slice(1));
  const storage: ObjectStorage = {
    async presignUpload(key, { contentType, expiresInSeconds }) {
      return {
        method: 'PUT',
        url: `https://storage.test/${key}?upload&expires=${expiry(expiresInSeconds)}`,
        headers: { 'Content-Type': contentType },
      };
    },
    async signedReadUrl(key, { expiresInSeconds }) {
      return `https://storage.test/${key}?expires=${expiry(expiresInSeconds)}`;
    },
    async inspectObject(key) {
      return objects.get(key) ?? null;
    },
    async deleteObjects(keys) {
      for (const key of keys) objects.delete(key);
    },
  };
  return {
    ...storage,
    objects,
    /** The object key an upload URL writes to. */
    keyOf,
    /**
     * What the phone does with a presigned upload: a 1000-byte file with the
     * signed content type, unless `file` says otherwise (a misbehaving client).
     */
    put(upload: PresignedUpload, file: Partial<ObjectInfo> = {}) {
      objects.set(keyOf(upload), {
        size: file.size ?? 1000,
        contentType: file.contentType === undefined ? (upload.headers['Content-Type'] ?? null) : file.contentType,
      });
    },
  };
}

export type MemoryStorage = ReturnType<typeof memoryStorage>;
