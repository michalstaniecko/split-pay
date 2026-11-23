import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test/app';
import { devOtpSender } from './auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('email OTP sign-in', () => {
  it('signs a new user in with the emailed code and returns their session', async () => {
    const { app, signIn } = createTestApp();

    const { cookie } = await signIn('ania@example.com');

    const res = await app.request('/api/auth/get-session', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string; id: string } };
    expect(body.user.email).toBe('ania@example.com');
    expect(body.user.id).toMatch(UUID);
  });

  it('sends a 6-digit code to the given email', async () => {
    const { requestOtp, sentOtps } = createTestApp();

    const otp = await requestOtp('bartek@example.com');

    expect(otp).toMatch(/^\d{6}$/);
    expect(sentOtps).toEqual([{ email: 'bartek@example.com', otp, type: 'sign-in' }]);
  });

  it('rejects a wrong code', async () => {
    const { app, json, requestOtp } = createTestApp();
    const otp = await requestOtp('ania@example.com');
    const wrong = otp === '000000' ? '111111' : '000000';

    const res = await app.request('/api/auth/sign-in/email-otp', json({ email: 'ania@example.com', otp: wrong }));

    expect(res.status).toBe(400);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('signs the same user in again on a second sign-in', async () => {
    const { signIn } = createTestApp();

    const first = await signIn('ania@example.com');
    const second = await signIn('ania@example.com');

    expect(second.userId).toBe(first.userId);
  });

  it('has no password sign-up', async () => {
    const { app, json } = createTestApp();

    const res = await app.request(
      '/api/auth/sign-up/email',
      json({ email: 'ania@example.com', password: 'hunter22hunter22', name: 'Ania' }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe('protected routes', () => {
  it('return 401 without a session', async () => {
    const { app } = createTestApp();

    const res = await app.request('/me');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('return 401 with an invalid session cookie', async () => {
    const { app } = createTestApp();

    const res = await app.request('/me', { headers: { cookie: 'better-auth.session_token=forged.value' } });

    expect(res.status).toBe(401);
  });

  it('GET /me returns the signed-in user', async () => {
    const { app, signIn } = createTestApp();
    const { cookie, userId } = await signIn('ania@example.com');

    const res = await app.request('/me', { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: userId, email: 'ania@example.com' });
  });

  it('return 401 after sign-out', async () => {
    const { app, json, signIn } = createTestApp();
    const { cookie } = await signIn('ania@example.com');

    const out = await app.request('/api/auth/sign-out', json({}, { cookie, 'expo-origin': 'splitpay://' }));
    expect(out.status).toBe(200);

    const res = await app.request('/me', { headers: { cookie } });
    expect(res.status).toBe(401);
  });
});

describe('requests from the mobile app', () => {
  it('are trusted from the app scheme (expo-origin header set by expoClient)', async () => {
    const { app, json, signIn } = createTestApp();
    const { cookie } = await signIn('ania@example.com');

    const res = await app.request('/api/auth/sign-out', json({}, { cookie, 'expo-origin': 'splitpay://' }));

    expect(res.status).toBe(200);
  });

  it('are rejected from an untrusted origin', async () => {
    const { app, json, signIn } = createTestApp();
    const { cookie } = await signIn('ania@example.com');

    const res = await app.request('/api/auth/sign-out', json({}, { cookie, origin: 'https://evil.example' }));

    expect(res.status).toBe(403);
  });
});

describe('devOtpSender', () => {
  it('writes the code to the log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await devOtpSender.send({ email: 'ania@example.com', otp: '123456', type: 'sign-in' });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('ania@example.com'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'));
    log.mockRestore();
  });
});
