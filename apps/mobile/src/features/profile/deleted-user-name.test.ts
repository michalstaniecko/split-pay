import { DELETED_USER_NAMES } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { appLocales } from '../../i18n/locale';

describe('deleted user name (account deletion, ADR-0019)', () => {
  it('exists for every UI language, so a removed name reads in each viewer’s language', () => {
    for (const locale of appLocales) expect(Object.keys(DELETED_USER_NAMES)).toContain(locale);
  });
});
