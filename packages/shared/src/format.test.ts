import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate, formatDayParts } from './format';

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

describe('formatAmount for screen readers', () => {
  it('spells out the currency name', () => {
    expect(plain(formatAmount(4550, 'PLN', 'pl', { currencyDisplay: 'name' }))).toBe('45,50 złotego polskiego');
    expect(plain(formatAmount(120_000, 'EUR', 'en', { currencyDisplay: 'name' }))).toBe('1,200.00 euros');
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

describe('formatDayParts', () => {
  it('splits a calendar date into a short weekday, day of month and short month', () => {
    // 23 November 2026 is a Monday.
    expect(formatDayParts('2026-11-23', 'en')).toEqual({ weekday: 'Mon', day: '23', month: 'Nov' });
    expect(formatDayParts('2026-11-23', 'pl')).toEqual({ weekday: 'pon.', day: '23', month: 'lis' });
  });

  it('does not shift the day with the device time zone', () => {
    // 1 January 2026 is a Thursday.
    expect(formatDayParts('2026-01-01', 'en')).toEqual({ weekday: 'Thu', day: '1', month: 'Jan' });
  });
});
