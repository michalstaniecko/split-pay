import { describe, expect, it } from 'vitest';
import { otpEmail } from './templates';

describe('OTP email templates', () => {
  it('puts the sign-in code in the English subject, HTML and text', () => {
    const email = otpEmail({ type: 'sign-in', otp: '123456', locale: 'en', validForMinutes: 5 });

    expect(email.subject).toBe('Your Kwitz sign-in code: 123456');
    expect(email.html).toContain('123456');
    expect(email.text).toContain('123456');
    expect(email.text).toContain('5 minutes');
    expect(email.text).toContain("If this wasn't you, ignore this email.");
  });

  it('writes Polish when the locale is pl', () => {
    const email = otpEmail({ type: 'sign-in', otp: '654321', locale: 'pl', validForMinutes: 5 });

    expect(email.subject).toBe('Twój kod logowania do Kwitz: 654321');
    expect(email.text).toContain('654321');
    expect(email.text).toContain('5 minut');
    expect(email.text).toContain('Jeśli to nie Ty, zignoruj tę wiadomość.');
    expect(email.html).toContain('lang="pl"');
  });

  it('gives other OTP types their own subject with the same body', () => {
    const verify = otpEmail({ type: 'email-verification', otp: '111222', locale: 'en', validForMinutes: 5 });
    const change = otpEmail({ type: 'change-email', otp: '111222', locale: 'pl', validForMinutes: 5 });

    expect(verify.subject).toBe('Your Kwitz verification code: 111222');
    expect(change.subject).toBe('Twój kod zmiany adresu e-mail w Kwitz: 111222');
    expect(verify.text).toContain('111222');
  });

  it('escapes the interpolated code in HTML', () => {
    const email = otpEmail({ type: 'sign-in', otp: '<b>&', locale: 'en', validForMinutes: 5 });

    expect(email.html).toContain('&lt;b&gt;&amp;');
    expect(email.html).not.toContain('<b>&');
  });
});
