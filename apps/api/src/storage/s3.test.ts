import { describe, expect, it } from 'vitest';
import { s3Storage } from './s3';

// The example credentials and request from the AWS SigV4 documentation
// ("Authenticating Requests: Using Query Parameters").
const awsExample = {
  endpoint: 'https://s3.amazonaws.com',
  region: 'us-east-1',
  bucket: 'examplebucket',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

describe('s3Storage', () => {
  it('signs a read URL exactly like the AWS SigV4 documentation example', async () => {
    const storage = s3Storage({ ...awsExample, now: () => new Date('2013-05-24T00:00:00Z') });
    expect(await storage.signedReadUrl('test.txt', { expiresInSeconds: 86400 })).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('caps a read URL at the 7-day maximum SigV4 allows', async () => {
    const storage = s3Storage({ ...awsExample, now: () => new Date('2013-05-24T00:00:00Z') });
    const url = new URL(await storage.signedReadUrl('test.txt', { expiresInSeconds: 30 * 24 * 3600 }));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('604800');
  });

  it('uses path-style URLs for stores like MinIO', async () => {
    const storage = s3Storage({
      ...awsExample,
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
      now: () => new Date('2013-05-24T00:00:00Z'),
    });
    const url = new URL(await storage.signedReadUrl('receipts/a/b.jpg', { expiresInSeconds: 600 }));
    expect(url.origin + url.pathname).toBe('http://localhost:9000/examplebucket/receipts/a/b.jpg');
  });

  it('issues a presigned PUT upload that signs the content type (R2 has no POST policies, ADR-0020)', async () => {
    const storage = s3Storage({ ...awsExample, now: () => new Date('2026-11-24T10:00:00Z') });
    const upload = await storage.presignUpload('receipts/g/p.jpg', { contentType: 'image/jpeg', expiresInSeconds: 600 });
    expect(upload.method).toBe('PUT');
    expect(upload.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    const url = new URL(upload.url);
    expect(url.origin + url.pathname).toBe('https://examplebucket.s3.amazonaws.com/receipts/g/p.jpg');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': 'AKIAIOSFODNN7EXAMPLE/20261124/us-east-1/s3/aws4_request',
      'X-Amz-Date': '20261124T100000Z',
      'X-Amz-Expires': '600',
      'X-Amz-SignedHeaders': 'content-type;host',
      'X-Amz-Signature': expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    // The content type is part of the signature.
    const png = await storage.presignUpload('receipts/g/p.jpg', { contentType: 'image/png', expiresInSeconds: 600 });
    expect(new URL(png.url).searchParams.get('X-Amz-Signature')).not.toBe(url.searchParams.get('X-Amz-Signature'));
  });

  it('inspects an object with a signed HEAD request', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const storage = s3Storage({
      ...awsExample,
      endpoint: 'https://account.eu.r2.cloudflarestorage.com',
      region: 'auto',
      forcePathStyle: true,
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(null, { status: 200, headers: { 'content-length': '4321', 'content-type': 'image/jpeg' } });
      },
    });
    expect(await storage.inspectObject('receipts/g/p.jpg')).toEqual({ size: 4321, contentType: 'image/jpeg' });
    expect(calls.map((c) => [c.init?.method, c.url])).toEqual([
      ['HEAD', 'https://account.eu.r2.cloudflarestorage.com/examplebucket/receipts/g/p.jpg'],
    ]);
    expect(new Headers(calls[0]!.init?.headers).get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it('inspecting a missing object gives null; a refusal throws without the store body', async () => {
    const missing = s3Storage({ ...awsExample, fetch: async () => new Response(null, { status: 404 }) });
    expect(await missing.inspectObject('a.jpg')).toBeNull();
    const refused = s3Storage({
      ...awsExample,
      fetch: async () => new Response('<Code>AccessDenied</Code>', { status: 403 }),
    });
    await expect(refused.inspectObject('a.jpg')).rejects.toThrow(/^object storage refused to inspect a\.jpg: 403$/);
  });

  it('deletes each object with a signed DELETE request', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const storage = s3Storage({
      ...awsExample,
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(null, { status: 204 });
      },
    });
    await storage.deleteObjects(['a.jpg', 'b/c.jpg']);
    expect(calls.map((c) => [c.init?.method, c.url])).toEqual([
      ['DELETE', 'https://examplebucket.s3.amazonaws.com/a.jpg'],
      ['DELETE', 'https://examplebucket.s3.amazonaws.com/b/c.jpg'],
    ]);
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it('fails when the store refuses a delete (the retention job retries the next day)', async () => {
    const storage = s3Storage({ ...awsExample, fetch: async () => new Response('denied', { status: 403 }) });
    await expect(storage.deleteObjects(['a.jpg'])).rejects.toThrow(/403/);
  });

  it('keeps the response body of the store out of the thrown error', async () => {
    const body = '<Error><Code>AccessDenied</Code><RequestId>internal-request-id</RequestId></Error>';
    const storage = s3Storage({ ...awsExample, fetch: async () => new Response(body, { status: 403 }) });
    const error: Error = await storage.deleteObjects(['a.jpg']).then(
      () => { throw new Error('expected a rejection'); },
      (e: Error) => e,
    );
    expect(error.message).toMatch(/403/);
    expect(error.message).not.toMatch(/AccessDenied|internal-request-id/);
  });
});
