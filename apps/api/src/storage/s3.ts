import { createHash, createHmac } from 'node:crypto';
import type { ObjectStorage } from './object-storage';

export interface S3Config {
  /** e.g. `https://<account-id>.eu.r2.cloudflarestorage.com` (Cloudflare R2) or `http://localhost:9000` (local store). */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `<endpoint>/<bucket>/<key>` instead of `<bucket>.<host>/<key>` (R2, local stores). */
  forcePathStyle?: boolean;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
}

const ALGORITHM = 'AWS4-HMAC-SHA256';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
/** SigV4 presigned URLs live at most 7 days. */
const MAX_EXPIRES_SECONDS = 604800;

const sha256Hex = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();
const hmacHex = (key: Buffer, data: string) => createHmac('sha256', key).update(data, 'utf8').digest('hex');

/** RFC 3986 encoding as SigV4 wants it. */
const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodeKey = (key: string) => key.split('/').map(encode).join('/');

/** `20130524T000000Z` */
const amzDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * S3-compatible object storage signed with AWS Signature Version 4 (no SDK:
 * presigned GET/PUT plus HEAD and DELETE are all we need). Works with
 * Cloudflare R2, Hetzner Object Storage, MinIO/RustFS and AWS S3 (ADR-0020).
 */
export function s3Storage(config: S3Config): ObjectStorage {
  const endpoint = new URL(config.endpoint);
  const doFetch = config.fetch ?? ((url, init) => fetch(url, init));
  const now = config.now ?? (() => new Date());

  const host = config.forcePathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  const origin = `${endpoint.protocol}//${host}`;
  const bucketPath = config.forcePathStyle ? `/${encode(config.bucket)}` : '';
  const objectPath = (key: string) => `${bucketPath}/${encodeKey(key)}`;

  /** The credential and the signing functions for a request made at `date`. */
  function signer(date: Date) {
    const day = amzDate(date).slice(0, 8);
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, day), config.region), 's3'),
      'aws4_request',
    );
    const credentialScope = `${day}/${config.region}/s3/aws4_request`;
    return {
      credential: `${config.accessKeyId}/${credentialScope}`,
      /** Signature of a canonical request (query-string or header auth). */
      signRequest: (canonicalRequest: string) =>
        hmacHex(signingKey, [ALGORITHM, amzDate(date), credentialScope, sha256Hex(canonicalRequest)].join('\n')),
    };
  }

  /**
   * A presigned URL (query-string auth). `headers` (lower-case names) are
   * signed too, so the request must send them with exactly these values.
   */
  function presignedUrl(method: 'GET' | 'PUT', key: string, expiresInSeconds: number, headers: Record<string, string> = {}) {
    const date = now();
    const { credential, signRequest } = signer(date);
    const signed = Object.entries({ ...headers, host }).sort(([a], [b]) => (a < b ? -1 : 1));
    const signedHeaders = signed.map(([k]) => k).join(';');
    const query: [string, string][] = [
      ['X-Amz-Algorithm', ALGORITHM],
      ['X-Amz-Credential', credential],
      ['X-Amz-Date', amzDate(date)],
      ['X-Amz-Expires', String(Math.min(expiresInSeconds, MAX_EXPIRES_SECONDS))],
      ['X-Amz-SignedHeaders', signedHeaders],
    ];
    const canonicalQuery = query
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${encode(k)}=${encode(v)}`)
      .join('&');
    const canonicalRequest = [
      method,
      objectPath(key),
      canonicalQuery,
      ...signed.map(([k, v]) => `${k}:${v}`),
      '',
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    return `${origin}${objectPath(key)}?${canonicalQuery}&X-Amz-Signature=${signRequest(canonicalRequest)}`;
  }

  /** Sends a bodiless request signed with an `authorization` header (HEAD, DELETE). */
  async function send(method: 'HEAD' | 'DELETE', key: string) {
    const date = now();
    const { credential, signRequest } = signer(date);
    const headers = { host, 'x-amz-content-sha256': EMPTY_SHA256, 'x-amz-date': amzDate(date) };
    const signedHeaders = Object.keys(headers).join(';');
    const canonicalRequest = [
      method,
      objectPath(key),
      '',
      ...Object.entries(headers).map(([k, v]) => `${k}:${v}`),
      '',
      signedHeaders,
      EMPTY_SHA256,
    ].join('\n');
    const authorization = `${ALGORITHM} Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signRequest(canonicalRequest)}`;
    const { host: _host, ...sent } = headers;
    const res = await doFetch(`${origin}${objectPath(key)}`, { method, headers: { ...sent, authorization } });
    // The body (error XML) is never surfaced: it may carry store internals into logs.
    await res.body?.cancel();
    return res;
  }

  return {
    async signedReadUrl(key, { expiresInSeconds }) {
      return presignedUrl('GET', key, expiresInSeconds);
    },

    async presignUpload(key, { contentType, expiresInSeconds }) {
      return {
        method: 'PUT',
        url: presignedUrl('PUT', key, expiresInSeconds, { 'content-type': contentType }),
        headers: { 'Content-Type': contentType },
      };
    },

    async inspectObject(key) {
      const res = await send('HEAD', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`object storage refused to inspect ${key}: ${res.status}`);
      const size = Number(res.headers.get('content-length'));
      if (!Number.isSafeInteger(size)) throw new Error(`object storage gave no size for ${key}`);
      return { size, contentType: res.headers.get('content-type') };
    },

    async deleteObjects(keys) {
      for (const key of keys) {
        const res = await send('DELETE', key);
        // 404: already gone — deleting is idempotent.
        if (!res.ok && res.status !== 404) {
          throw new Error(`object storage refused to delete ${key}: ${res.status}`);
        }
      }
    },
  };
}

/** `s3Storage` from `S3_*` environment variables, or `undefined` when photos are not configured. */
export function s3StorageFromEnv(env: Record<string, string | undefined>): ObjectStorage | undefined {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return undefined;
  return s3Storage({
    endpoint: S3_ENDPOINT,
    region: S3_REGION || 'us-east-1',
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
  });
}
