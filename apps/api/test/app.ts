import type { FeatureFlags } from '@split-pay/shared';
import { createApp } from '../src/app';
import { createAuth, type OtpSender, type OtpType } from '../src/auth';
import { createApiClient } from '../src/client';
import { testDb } from './db';

export interface SentOtp {
  email: string;
  otp: string;
  type: OtpType;
}

/**
 * The real app wired to the test database. OTP codes are captured in `sentOtps`
 * instead of being logged.
 */
export function createTestApp(options: { flags?: FeatureFlags; webUrl?: string } = {}) {
  const sentOtps: SentOtp[] = [];
  const otpSender: OtpSender = {
    async send(message) {
      sentOtps.push(message);
    },
  };
  const auth = createAuth({
    db: testDb.db,
    otpSender,
    baseURL: 'http://localhost:3000',
    secret: 'test-secret-test-secret-test-secret!!',
  });
  const app = createApp({ auth, db: testDb.db, ...options });

  const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  /** Asks for a sign-in code and returns it as the user would read it from the email. */
  async function requestOtp(email: string): Promise<string> {
    const res = await app.request('/api/auth/email-otp/send-verification-otp', json({ email, type: 'sign-in' }));
    if (res.status !== 200) throw new Error(`send-verification-otp → ${res.status} ${await res.text()}`);
    // The sender is fired without being awaited; let it run.
    await new Promise((resolve) => setImmediate(resolve));
    const sent = sentOtps.filter((m) => m.email === email).at(-1);
    if (!sent) throw new Error(`no OTP was sent to ${email}`);
    return sent.otp;
  }

  /** Full email-OTP sign-in. Returns headers that authenticate later requests. */
  async function signIn(email = 'ania@example.com'): Promise<{ cookie: string; userId: string }> {
    const otp = await requestOtp(email);
    const res = await app.request('/api/auth/sign-in/email-otp', json({ email, otp }));
    if (res.status !== 200) throw new Error(`sign-in/email-otp → ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { user: { id: string } };
    return { cookie: sessionCookie(res), userId: body.user.id };
  }

  /** The typed client (`@split-pay/api/client`) talking to this app in-process. */
  function client(session?: { cookie: string }) {
    return createApiClient('http://localhost:3000', {
      fetch: app.request,
      ...(session ? { headers: { cookie: session.cookie } } : {}),
    });
  }

  return { app, auth, sentOtps, json, requestOtp, signIn, client };
}

/** `name=value` pairs from a response's Set-Cookie headers, ready for a `cookie` request header. */
export function sessionCookie(res: Response): string {
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((c): c is string => !!c && c.includes('session_token'));
  if (cookies.length === 0) throw new Error('response set no session cookie');
  return cookies.join('; ');
}
