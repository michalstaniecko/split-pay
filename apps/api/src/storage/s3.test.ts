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

  it('issues a POST upload whose policy pins the key, the content type and the size range', async () => {
    const storage = s3Storage({ ...awsExample, now: () => new Date('2026-11-24T10:00:00Z') });
    const upload = await storage.presignUpload('receipts/g/p.jpg', {
      contentType: 'image/jpeg',
      maxBytes: 1000,
      expiresInSeconds: 600,
    });
    expect(upload.url).toBe('https://examplebucket.s3.amazonaws.com/');
    expect(upload.fields).toMatchObject({
      key: 'receipts/g/p.jpg',
      'Content-Type': 'image/jpeg',
      'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      'x-amz-credential': 'AKIAIOSFODNN7EXAMPLE/20261124/us-east-1/s3/aws4_request',
      'x-amz-date': '20261124T100000Z',
    });
    expect(upload.fields['x-amz-signature']).toMatch(/^[0-9a-f]{64}$/);
    const policy = JSON.parse(Buffer.from(upload.fields.policy!, 'base64').toString('utf8'));
    expect(policy.expiration).toBe('2026-11-24T10:10:00.000Z');
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        { bucket: 'examplebucket' },
        { key: 'receipts/g/p.jpg' },
        { 'Content-Type': 'image/jpeg' },
        ['content-length-range', 1, 1000],
      ]),
    );
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
