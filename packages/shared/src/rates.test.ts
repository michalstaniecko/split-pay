import { describe, expect, it } from 'vitest';
import { crossRate, pickRateDay, ratesToBase } from './rates';

describe('crossRate', () => {
  it('divides two EUR rates: PLN per USD from PLN/EUR and USD/EUR', () => {
    // 4.2715 / 1.0812 = 3.950703…
    expect(crossRate('4.2715', '1.0812')).toBe('3.9507');
  });

  it('keeps six significant digits for small rates', () => {
    // EUR per IDR: 1 / 17012.34 = 0.0000587808 6…
    expect(crossRate('1', '17012.34')).toBe('0.0000587809');
  });

  it('keeps six significant digits for large rates and trims trailing zeros', () => {
    expect(crossRate('17012.34', '1')).toBe('17012.3');
    expect(crossRate('4.2715', '1')).toBe('4.2715');
    expect(crossRate('2', '2')).toBe('1');
  });

  it('rounds halves away from zero', () => {
    // 1 / 8 = 0.125 → six digits exact; 2 / 3 = 0.6666666… → 0.666667
    expect(crossRate('1', '8')).toBe('0.125');
    expect(crossRate('2', '3')).toBe('0.666667');
  });
});

describe('ratesToBase', () => {
  const perEur = { PLN: '4.2715', USD: '1.0812', JPY: '162.5' };

  it('gives units of the base currency per 1 unit of each currency, EUR and the base included', () => {
    expect(ratesToBase(perEur, 'PLN')).toEqual({ EUR: '4.2715', PLN: '1', USD: '3.9507', JPY: '0.0262862' });
  });

  it('works with EUR as the base', () => {
    expect(ratesToBase(perEur, 'EUR')).toEqual({ EUR: '1', PLN: '0.23411', USD: '0.924898', JPY: '0.00615385' });
  });

  it('is null when the ECB has no rate for the base currency', () => {
    expect(ratesToBase(perEur, 'XYZ')).toBeNull();
  });
});

describe('pickRateDay (rates for a date fall back to the latest earlier date)', () => {
  const days = [{ date: '2026-07-08' }, { date: '2026-07-10' }, { date: '2026-07-09' }];

  it('takes the exact date when there are rates for it', () => {
    expect(pickRateDay(days, '2026-07-09')?.date).toBe('2026-07-09');
  });

  it('falls back to the latest earlier date (weekends, holidays, today before publication)', () => {
    expect(pickRateDay(days, '2026-07-12')?.date).toBe('2026-07-10');
  });

  it('is undefined before the first known date', () => {
    expect(pickRateDay(days, '2026-07-01')).toBeUndefined();
  });
});
