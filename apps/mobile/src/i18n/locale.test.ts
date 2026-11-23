import { describe, expect, it } from 'vitest';
import { resolveLocale } from './locale';

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
