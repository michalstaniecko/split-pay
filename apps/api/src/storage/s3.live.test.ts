import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { s3StorageFromEnv } from './s3';

/**
 * The S3 adapter against a real store (ADR-0020). Skipped unless
 * `S3_LIVE_TEST=1` with the usual `S3_*` variables, e.g. the local store
 * from compose.yaml (`pnpm db:up`) or a staging R2 bucket:
 *
 *   S3_LIVE_TEST=1 S3_ENDPOINT=http://localhost:9000 S3_REGION=us-east-1 S3_BUCKET=splitpay-photos \
 *   S3_ACCESS_KEY_ID=splitpay S3_SECRET_ACCESS_KEY=splitpay-secret S3_FORCE_PATH_STYLE=true \
 *   pnpm --filter @split-pay/api exec vitest run src/storage/s3.live.test.ts
 */
const storage = process.env.S3_LIVE_TEST === '1' ? s3StorageFromEnv(process.env) : undefined;

describe.skipIf(!storage)('s3Storage against a real store', () => {
  const s3 = storage!;

  it('uploads with a presigned PUT, inspects, reads and deletes the object', async () => {
    const key = `live-test/${randomUUID()}.jpg`;
    const body = new Uint8Array(1234).fill(7);
    const upload = await s3.presignUpload(key, { contentType: 'image/jpeg', expiresInSeconds: 60 });
    try {
      const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body });
      expect(put.status).toBe(200);

      expect(await s3.inspectObject(key)).toEqual({ size: 1234, contentType: 'image/jpeg' });
      const read = await fetch(await s3.signedReadUrl(key, { expiresInSeconds: 60 }));
      expect(read.status).toBe(200);
      expect(new Uint8Array(await read.arrayBuffer())).toEqual(body);
    } finally {
      await s3.deleteObjects([key]);
    }
    expect(await s3.inspectObject(key)).toBeNull();
  });

  it('refuses a PUT with another content type than the signed one', async () => {
    const key = `live-test/${randomUUID()}.jpg`;
    const upload = await s3.presignUpload(key, { contentType: 'image/jpeg', expiresInSeconds: 60 });
    const put = await fetch(upload.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(10),
    });
    await put.body?.cancel();
    expect(put.status).toBe(403);
    expect(await s3.inspectObject(key)).toBeNull();
  });
});
