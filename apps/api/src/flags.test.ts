import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('GET /flags', () => {
  it('serves the defaults when nothing is configured, without signing in', async () => {
    const { client } = createTestApp();
    expect(await parseResponse(client().flags.$get())).toEqual({ ads: false });
  });

  it('serves the configured flags', async () => {
    const { client } = createTestApp({ flags: { ads: true } });
    expect(await parseResponse(client().flags.$get())).toEqual({ ads: true });
  });
});
