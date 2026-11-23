import { describe, expect, it } from 'vitest';
import { OTP_LENGTH, cleanOtp, isOtpComplete, parseEmail } from './sign-in-input';

describe('parseEmail', () => {
  it('trims and lowercases a valid address', () => {
    expect(parseEmail('  Ania.Kowalska@Example.COM ')).toBe('ania.kowalska@example.com');
  });

  it.each(['', 'ania', 'ania@', '@example.com', 'ania@example', 'an ia@example.com'])('rejects %j', (input) => {
    expect(parseEmail(input)).toBeNull();
  });
});

describe('one-time code input', () => {
  it('is 6 digits, like the API sends', () => {
    expect(OTP_LENGTH).toBe(6);
  });

  it('keeps only digits, up to the code length (pasted codes)', () => {
    expect(cleanOtp(' 123 456 ')).toBe('123456');
    expect(cleanOtp('12-34-56-78')).toBe('123456');
    expect(cleanOtp('abc')).toBe('');
  });

  it('is complete at exactly 6 digits', () => {
    expect(isOtpComplete('12345')).toBe(false);
    expect(isOtpComplete('123456')).toBe(true);
    expect(isOtpComplete('12345a')).toBe(false);
  });
});
