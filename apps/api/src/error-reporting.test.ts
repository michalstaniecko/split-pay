import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ErrorReporter, reportServerErrors, sentryOptionsFromEnv, startSentry } from './error-reporting';

describe('sentryOptionsFromEnv', () => {
  it('is off without SENTRY_DSN', () => {
    expect(sentryOptionsFromEnv({})).toBeNull();
    expect(sentryOptionsFromEnv({ SENTRY_DSN: '', SENTRY_ENVIRONMENT: 'staging' })).toBeNull();
  });

  it('is on with SENTRY_DSN, collecting no personal data and with the scrubber', () => {
    const options = sentryOptionsFromEnv({ SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1', SENTRY_ENVIRONMENT: 'staging' });
    expect(options).toMatchObject({
      dsn: 'https://key@o1.ingest.sentry.io/1',
      environment: 'staging',
      dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false },
    });
    expect(options?.beforeSend).toBeTypeOf('function');
  });
});

/** A tiny app with the error handler: routes that fail in different ways. */
const appWith = (reporter: ErrorReporter | null) => {
  const app = new Hono<{ Variables: { user: { id: string } } }>()
    .use(async (c, next) => {
      c.set('user', { id: 'user-1' });
      await next();
    })
    .get('/links/:token', () => {
      throw new Error('boom for ania@example.com');
    })
    .get('/not-found', () => {
      throw new HTTPException(404, { message: 'nope' });
    })
    .get('/unavailable', () => {
      throw new HTTPException(503, { message: 'down' });
    });
  app.onError(reportServerErrors(reporter));
  return app;
};

describe('reportServerErrors', () => {
  const capture = vi.fn<ErrorReporter['capture']>();
  beforeEach(() => {
    capture.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports an unhandled error with the route pattern and user id, and answers 500', async () => {
    const res = await appWith({ capture }).request('/links/secret-token');

    expect(res.status).toBe(500);
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]?.[1]).toEqual({ method: 'GET', route: '/links/:token', userId: 'user-1' });
  });

  it('reports a 5xx HTTPException and keeps its response', async () => {
    const res = await appWith({ capture }).request('/unavailable');

    expect(res.status).toBe(503);
    expect(capture).toHaveBeenCalledOnce();
  });

  it('does not report client errors', async () => {
    const res = await appWith({ capture }).request('/not-found');

    expect(res.status).toBe(404);
    expect(capture).not.toHaveBeenCalled();
  });

  it('answers 500 without a reporter (Sentry off)', async () => {
    const res = await appWith(null).request('/links/secret-token');

    expect(res.status).toBe(500);
  });
});

describe('startSentry', () => {
  afterAll(() => Sentry.close());

  it('returns no reporter without SENTRY_DSN', () => {
    expect(startSentry({})).toBeNull();
  });

  it('sends scrubbed events: no email, token, cookie, auth header or body', async () => {
    const sent: string[] = [];
    const reporter = startSentry(
      { SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1', SENTRY_ENVIRONMENT: 'test' },
      {
        transport: (options) =>
          Sentry.createTransport(options, async (request) => {
            sent.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body));
            return { statusCode: 200 };
          }),
      },
    );
    expect(reporter).not.toBeNull();
    const app = appWith(reporter);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await app.request('/links/secret-token?otp=123456', {
      headers: {
        authorization: 'Bearer secret-bearer',
        cookie: 'better-auth.session_token=secret-cookie',
        'x-forwarded-for': '203.0.113.7',
      },
    });
    await Sentry.flush(2000);

    const envelope = sent.join('\n');
    expect(envelope).toContain('boom for [email]');
    expect(envelope).toContain('"id":"user-1"');
    expect(envelope).toContain('"environment":"test"');
    for (const secret of ['ania@example.com', 'secret-token', '123456', 'secret-bearer', 'secret-cookie', '203.0.113.7']) {
      expect(envelope).not.toContain(secret);
    }
  });
});
