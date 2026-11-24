import { createHash, createHmac } from 'node:crypto';
import type { ObjectStorage } from './object-storage';

export interface S3Config {
  /** e.g. `https://fsn1.your-objectstorage.com` (Hetzner) or `http://localhost:9000` (MinIO). */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `<endpoint>/<bucket>/<key>` instead of `<bucket>.<host>/<key>` (MinIO). */
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

/** RFC 3986 encoding as SigV4 wants it. */
const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodeKey = (key: string) => key.split('/').map(encode).join('/');

/** `20130524T000000Z` */
const amzDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * S3-compatible object storage signed with AWS Signature Version 4 (no SDK:
 * three request types are all we need). Works with Hetzner Object Storage,
 * MinIO and AWS S3.
 */
export function s3Storage(config: S3Config): ObjectStorage {
  const endpoint = new URL(config.endpoint);
  const doFetch = config.fetch ?? ((url, init) => fetch(url, init));
  const now = config.now ?? (() => new Date());

  const host = config.forcePathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  const origin = `${endpoint.protocol}//${host}`;
  const bucketPath = config.forcePathStyle ? `/${encode(config.bucket)}` : '';
  const objectPath = (key: string) => `${bucketPath}/${encodeKey(key)}`;

  function scope(date: Date) {
    const day = amzDate(date).slice(0, 8);
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, day), config.region), 's3'),
      'aws4_request',
    );
    const credentialScope = `${day}/${config.region}/s3/aws4_request`;
    return { signingKey, credentialScope, credential: `${config.accessKeyId}/${credentialScope}` };
  }

  function signature(date: Date, canonicalRequest: string) {
    const { signingKey, credentialScope } = scope(date);
    const stringToSign = [ALGORITHM, amzDate(date), credentialScope, sha256Hex(canonicalRequest)].join('\n');
    return createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  }

  return {
    async signedReadUrl(key, { expiresInSeconds }) {
      const date = now();
      const query: [string, string][] = [
        ['X-Amz-Algorithm', ALGORITHM],
        ['X-Amz-Credential', scope(date).credential],
        ['X-Amz-Date', amzDate(date)],
        ['X-Amz-Expires', String(Math.min(expiresInSeconds, MAX_EXPIRES_SECONDS))],
        ['X-Amz-SignedHeaders', 'host'],
      ];
      const canonicalQuery = query
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${encode(k)}=${encode(v)}`)
        .join('&');
      const canonicalRequest = ['GET', objectPath(key), canonicalQuery, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join(
        '\n',
      );
      return `${origin}${objectPath(key)}?${canonicalQuery}&X-Amz-Signature=${signature(date, canonicalRequest)}`;
    },

    async presignUpload(key, { contentType, maxBytes, expiresInSeconds }) {
      const date = now();
      const { signingKey, credential } = scope(date);
      const fields = {
        key,
        'Content-Type': contentType,
        'x-amz-algorithm': ALGORITHM,
        'x-amz-credential': credential,
        'x-amz-date': amzDate(date),
      };
      const policy = Buffer.from(
        JSON.stringify({
          expiration: new Date(date.getTime() + expiresInSeconds * 1000).toISOString(),
          conditions: [
            { bucket: config.bucket },
            ...Object.entries(fields).map(([k, v]) => ({ [k]: v })),
            ['content-length-range', 1, maxBytes],
          ],
        }),
        'utf8',
      ).toString('base64');
      const policySignature = createHmac('sha256', signingKey).update(policy, 'utf8').digest('hex');
      return {
        url: `${origin}${bucketPath}/`,
        fields: { ...fields, policy, 'x-amz-signature': policySignature },
      };
    },

    async deleteObjects(keys) {
      for (const key of keys) {
        const date = now();
        const headers = { host, 'x-amz-content-sha256': EMPTY_SHA256, 'x-amz-date': amzDate(date) };
        const signedHeaders = Object.keys(headers).join(';');
        const canonicalRequest = [
          'DELETE',
          objectPath(key),
          '',
          ...Object.entries(headers).map(([k, v]) => `${k}:${v}`),
          '',
          signedHeaders,
          EMPTY_SHA256,
        ].join('\n');
        const authorization = `${ALGORITHM} Credential=${scope(date).credential}, SignedHeaders=${signedHeaders}, Signature=${signature(date, canonicalRequest)}`;
        const { host: _host, ...sent } = headers;
        const res = await doFetch(`${origin}${objectPath(key)}`, {
          method: 'DELETE',
          headers: { ...sent, authorization },
        });
        // The body (error XML) is never surfaced: it may carry store internals into logs.
        await res.body?.cancel();
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
