import { plural, t } from '@lingui/core/macro';
import { describe, expect, it } from 'vitest';
import { activateLocale } from './i18n';

// Same message as the placeholder on the Groups screen; tests are excluded
// from extraction, so this only renders if the app's catalogs contain it.
const evenSplit = (amount: string, count: number) =>
  t`Podział ${amount} na ${plural(count, { one: '# osobę', few: '# osoby', many: '# osób', other: '# osoby' })}`;

describe('activateLocale', () => {
  it('renders Polish plural forms', () => {
    activateLocale('pl');
    expect(evenSplit('100,00 zł', 1)).toBe('Podział 100,00 zł na 1 osobę');
    expect(evenSplit('100,00 zł', 3)).toBe('Podział 100,00 zł na 3 osoby');
    expect(evenSplit('100,00 zł', 5)).toBe('Podział 100,00 zł na 5 osób');
    expect(evenSplit('100,00 zł', 22)).toBe('Podział 100,00 zł na 22 osoby');
  });

  it('renders English plural forms', () => {
    activateLocale('en');
    expect(evenSplit('PLN 100.00', 1)).toBe('PLN 100.00 split between 1 person');
    expect(evenSplit('PLN 100.00', 3)).toBe('PLN 100.00 split between 3 people');
  });
});
