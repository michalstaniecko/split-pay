import { afterEach, describe, expect, it } from 'vitest';
import { decimalSeparator, resolveLocale } from './locale';

const system = (...codes: (string | null)[]) => codes.map((languageCode) => ({ languageCode }));

describe('resolveLocale', () => {
  it('uses the language chosen in Profile', () => {
    expect(resolveLocale('en', system('pl'))).toBe('en');
    expect(resolveLocale('pl', system('en'))).toBe('pl');
  });

  it('uses the system language when nothing is chosen', () => {
    expect(resolveLocale(null, system('en'))).toBe('en');
    expect(resolveLocale(null, system('pl'))).toBe('pl');
  });

  it('takes the first supported language from the system preference list', () => {
    expect(resolveLocale(null, system('de', null, 'pl', 'en'))).toBe('pl');
  });

  it('falls back to English when no system language is supported', () => {
    expect(resolveLocale(null, system('de', 'fr'))).toBe('en');
  });

  it('ignores an unknown stored value', () => {
    expect(resolveLocale('xx', system('pl'))).toBe('pl');
  });
});

describe('decimalSeparator', () => {
  const formatToParts = Intl.NumberFormat.prototype.formatToParts;

  afterEach(() => {
    Intl.NumberFormat.prototype.formatToParts = formatToParts;
  });

  it("is ',' in Polish and '.' in English", () => {
    expect(decimalSeparator('pl')).toBe(',');
    expect(decimalSeparator('en')).toBe('.');
  });

  // Hermes on iOS has no Intl.NumberFormat#formatToParts (#58).
  it('works where Intl.NumberFormat#formatToParts is missing', () => {
    // @ts-expect-error simulating an engine without the method
    Intl.NumberFormat.prototype.formatToParts = undefined;
    expect(decimalSeparator('pl')).toBe(',');
    expect(decimalSeparator('en')).toBe('.');
  });
});
