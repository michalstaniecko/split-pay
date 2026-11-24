import { describe, expect, it } from 'vitest';
import { createFormatters } from './formatters';

// Intl separates groups with (narrow) no-break spaces; normalise them.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('createFormatters', () => {
  it('formats amounts for display and, for screen readers, with the currency name spelled out', () => {
    expect(plain(createFormatters('pl').amount(4_550, 'PLN'))).toBe('45,50 zł');
    expect(plain(createFormatters('pl').spokenAmount(4_550, 'PLN'))).toBe('45,50 złotego polskiego');
    expect(createFormatters('en').spokenAmount(2_000, 'EUR')).toBe('20.00 euros');
  });
});
