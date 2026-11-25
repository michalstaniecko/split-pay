import { describe, expect, it } from 'vitest';
import { scrubErrorReport, scrubUrl } from './error-report';

const LINK_TOKEN = 'Zx8kQ2v7Lp0aBcD';
const SESSION = 'better-auth.session_token=abc123secret';

/** An event as an SDK could build it, full of personal data and secrets. */
const dirtyEvent = () => ({
  event_id: 'e1',
  level: 'error' as const,
  message: 'Sign-in failed for ania@example.com',
  logentry: { message: 'Sign-in failed for %s', params: ['ania@example.com'] },
  server_name: 'api-1',
  user: {
    id: 'user-1',
    email: 'ania@example.com',
    username: 'Ania Kowalska',
    name: 'Ania Kowalska',
    ip_address: '203.0.113.7',
    geo: { city: 'Kraków' },
  },
  request: {
    method: 'POST',
    url: `https://api.example.com/links/${LINK_TOKEN}/join?token=otp-secret#frag`,
    query_string: 'token=otp-secret',
    data: { email: 'ania@example.com', otp: '123456', name: 'Ania Kowalska' },
    cookies: { 'better-auth.session_token': 'abc123secret' },
    headers: {
      authorization: 'Bearer secret-token',
      Cookie: SESSION,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'okhttp/4',
    },
    env: { REMOTE_ADDR: '203.0.113.7' },
  },
  exception: {
    values: [
      {
        type: 'Error',
        value: 'No member for ola@example.org',
        stacktrace: {
          frames: [
            {
              filename: 'app.ts',
              lineno: 1,
              vars: { email: 'ola@example.org' },
              context_line: "throw new Error('no ola@example.org');",
              pre_context: ['// ola@example.org'],
            },
          ],
        },
      },
    ],
  },
  breadcrumbs: [
    {
      category: 'console',
      level: 'log' as const,
      message: 'Signed in as Ania Kowalska',
      data: { arguments: ['Ania Kowalska'] },
    },
    {
      category: 'fetch',
      type: 'http',
      data: {
        method: 'PUT',
        url: 'https://bucket.r2.example.com/receipts/g1/p1.jpg?X-Amz-Signature=deadbeef',
        status_code: 200,
        body: 'ania@example.com',
      },
    },
    {
      category: 'navigation',
      data: { from: `/g/${LINK_TOKEN}?ref=share`, to: '/groups/g1' },
    },
    { category: 'ui.click', message: 'Button[aria-label="Ania Kowalska"]' },
  ],
  extra: { body: { email: 'ania@example.com' } },
  contexts: {
    device: { name: "Ania's iPhone", model: 'iPhone17,1' },
    os: { name: 'iOS', version: '26.1' },
    state: { session: { user: { email: 'ania@example.com' } } },
  },
  tags: { route: '/links/:token', email: 'ania@example.com' },
});

describe('scrubErrorReport', () => {
  const scrubbed = scrubErrorReport(dirtyEvent());
  const serialized = JSON.stringify(scrubbed);

  it.each([
    ['an email', 'ania@example.com'],
    ['an email in an error message', 'ola@example.org'],
    ['a user name', 'Ania Kowalska'],
    ['a device name', "Ania's iPhone"],
    ['a link token', LINK_TOKEN],
    ['a query string token', 'otp-secret'],
    ['a sign-in code', '123456'],
    ['a presigned URL signature', 'deadbeef'],
    ['a cookie', 'abc123secret'],
    ['an authorization header', 'secret-token'],
    ['an IP address', '203.0.113.7'],
    ['a city', 'Kraków'],
  ])('lets no %s through', (_, secret) => {
    expect(serialized).not.toContain(secret);
  });

  it('keeps only the user id', () => {
    expect(scrubbed.user).toEqual({ id: 'user-1' });
  });

  it('drops the request body, cookies, query string and env', () => {
    expect(scrubbed.request).not.toHaveProperty('data');
    expect(scrubbed.request).not.toHaveProperty('cookies');
    expect(scrubbed.request).not.toHaveProperty('query_string');
    expect(scrubbed.request).not.toHaveProperty('env');
  });

  it('keeps the method, a token-free URL and harmless headers', () => {
    expect(scrubbed.request).toEqual({
      method: 'POST',
      url: 'https://api.example.com/links/[token]/join',
      headers: { 'content-type': 'application/json', 'user-agent': 'okhttp/4' },
    });
  });

  it('keeps what helps debugging: error types, stack frames without locals, tags without PII', () => {
    expect(scrubbed.exception?.values?.[0]).toEqual({
      type: 'Error',
      value: 'No member for [email]',
      stacktrace: {
        frames: [
          { filename: 'app.ts', lineno: 1, context_line: "throw new Error('no [email]');", pre_context: ['// [email]'] },
        ],
      },
    });
    expect(scrubbed.message).toBe('Sign-in failed for [email]');
    expect(scrubbed.logentry).toEqual({ message: 'Sign-in failed for %s', params: ['[email]'] });
    expect(scrubbed.tags).toEqual({ route: '/links/:token', email: '[email]' });
    expect(scrubbed.contexts).toEqual({ device: { model: 'iPhone17,1' }, os: { name: 'iOS', version: '26.1' } });
    expect(scrubbed).not.toHaveProperty('extra');
  });

  it('keeps breadcrumbs as an outline: category, method, status, token-free URLs', () => {
    expect(scrubbed.breadcrumbs).toEqual([
      { category: 'console', level: 'log' },
      {
        category: 'fetch',
        type: 'http',
        data: { method: 'PUT', url: 'https://bucket.r2.example.com/receipts/g1/p1.jpg', status_code: 200 },
      },
      { category: 'navigation', data: { from: '/g/[token]', to: '/groups/g1' } },
      { category: 'ui.click' },
    ]);
  });

  it('does not change the event it was given', () => {
    const event = dirtyEvent();
    scrubErrorReport(event);
    expect(event).toEqual(dirtyEvent());
  });

  it('handles a minimal event', () => {
    expect(scrubErrorReport({ event_id: 'e2' })).toEqual({ event_id: 'e2' });
  });
});

describe('scrubUrl', () => {
  it.each([
    ['https://api.example.com/health', 'https://api.example.com/health'],
    ['https://api.example.com/groups/g1?since=5', 'https://api.example.com/groups/g1'],
    [`https://api.example.com/public/links/${LINK_TOKEN}`, 'https://api.example.com/public/links/[token]'],
    [`https://api.example.com/og/${LINK_TOKEN}`, 'https://api.example.com/og/[token]'],
    [`splitpay://g/${LINK_TOKEN}`, 'splitpay://g/[token]'],
    [`/g/${LINK_TOKEN}#x`, '/g/[token]'],
    ['/api/auth/reset?email=ania@example.com', '/api/auth/reset'],
  ])('%s → %s', (input, expected) => {
    expect(scrubUrl(input)).toBe(expected);
  });
});
