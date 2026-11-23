import { plural, t } from '@lingui/core/macro';
import { describe, expect, it } from 'vitest';
import { activateLocale } from './i18n';

// Same message as the member count in Group info; tests are excluded from
// extraction, so this only renders if the app's catalogs contain it.
const memberCount = (count: number) =>
  t`${plural(count, { one: '# osoba', few: '# osoby', many: '# osób', other: '# osoby' })}`;

describe('activateLocale', () => {
  it('renders Polish plural forms', () => {
    activateLocale('pl');
    expect(memberCount(1)).toBe('1 osoba');
    expect(memberCount(3)).toBe('3 osoby');
    expect(memberCount(5)).toBe('5 osób');
    expect(memberCount(22)).toBe('22 osoby');
  });

  it('renders English plural forms', () => {
    activateLocale('en');
    expect(memberCount(1)).toBe('1 person');
    expect(memberCount(3)).toBe('3 people');
  });
});
