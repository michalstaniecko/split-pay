import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate } from './format';

// Intl separates groups and the currency symbol with (narrow) no-break spaces;
// normalise them so the expectations stay readable.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatAmount', () => {
  it('formats grosze as złoty in Polish', () => {
    expect(plain(formatAmount(1_234_567, 'PLN', 'pl'))).toBe('12 345,67 zł');
  });

  it('formats cents in English', () => {
    expect(plain(formatAmount(1_234_567, 'USD', 'en'))).toBe('$12,345.67');
  });

  it('respects currencies with 0 and 3 decimal places', () => {
    expect(plain(formatAmount(1500, 'JPY', 'en'))).toBe('¥1,500');
    expect(plain(formatAmount(1500, 'KWD', 'en'))).toBe('KWD 1.500');
  });

  it('formats small and negative amounts (income)', () => {
    expect(plain(formatAmount(5, 'PLN', 'pl'))).toBe('0,05 zł');
    expect(plain(formatAmount(-1050, 'EUR', 'en'))).toBe('-€10.50');
  });

  it('is exact for the largest safe amount', () => {
    expect(plain(formatAmount(Number.MAX_SAFE_INTEGER, 'PLN', 'pl'))).toBe('90 071 992 547 409,91 zł');
  });

  it('rejects non-integer amounts', () => {
    expect(() => formatAmount(10.5, 'PLN', 'pl')).toThrow(RangeError);
  });
});

describe('formatDate', () => {
  it('formats a calendar date in Polish and English', () => {
    expect(formatDate('2026-11-23', 'pl')).toBe('23 listopada 2026');
    expect(formatDate('2026-11-23', 'en')).toBe('November 23, 2026');
  });

  it('does not shift the day with the device time zone', () => {
    expect(formatDate('2026-01-01', 'en')).toBe('January 1, 2026');
    expect(formatDate('2026-12-31', 'en')).toBe('December 31, 2026');
  });
});
