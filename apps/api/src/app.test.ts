import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('api', () => {
  const { app } = createTestApp();

  it('GET /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
