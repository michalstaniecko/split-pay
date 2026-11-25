import { describe, expect, it } from 'vitest';
import { otpLocaleFromHeader } from './locale';

describe('otpLocaleFromHeader', () => {
  it('picks Polish for pl and its regional variants', () => {
    expect(otpLocaleFromHeader('pl')).toBe('pl');
    expect(otpLocaleFromHeader('pl-PL')).toBe('pl');
    expect(otpLocaleFromHeader('PL-pl,en;q=0.5')).toBe('pl');
  });

  it('picks English for en', () => {
    expect(otpLocaleFromHeader('en-GB')).toBe('en');
  });

  it('follows the most preferred language', () => {
    expect(otpLocaleFromHeader('en;q=0.4, pl;q=0.9')).toBe('pl');
  });

  it('falls back to English for other languages or no header', () => {
    expect(otpLocaleFromHeader('de-DE')).toBe('en');
    expect(otpLocaleFromHeader('')).toBe('en');
    expect(otpLocaleFromHeader(null)).toBe('en');
    expect(otpLocaleFromHeader(undefined)).toBe('en');
  });
});
