import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';
import { createApiClient } from './client';

describe('typed API client', () => {
  it('sends the session from an async headers option', async () => {
    const { app, signIn } = createTestApp();
    const { cookie, userId } = await signIn('ania@example.com');
    // Same shape as the mobile app: the cookie is read asynchronously per request.
    const api = createApiClient('http://localhost:3000', {
      fetch: app.request,
      headers: async () => ({ cookie }),
    });

    const me = await parseResponse(api.me.$get());

    expect(me).toMatchObject({ id: userId, email: 'ania@example.com' });
  });

  it('gets 401 without a session', async () => {
    const { client } = createTestApp();

    const res = await client().me.$get();

    expect(res.status).toBe(401);
  });
});
