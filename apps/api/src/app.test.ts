import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('api', () => {
  const { app } = createTestApp();

  it('GET /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('POST /dev/split-evenly validates input', async () => {
    const res = await app.request('/dev/split-evenly', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ total: 1.5, memberIds: [] }),
    });
    expect(res.status).toBe(400);
  });
});
