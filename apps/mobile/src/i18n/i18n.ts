import { i18n } from '@lingui/core';
import { messages as en } from '../locales/en/messages.po';
import { messages as pl } from '../locales/pl/messages.po';
import type { AppLocale } from './locale';

// Both catalogs are tiny and bundled; switching needs no async loading.
i18n.load({ pl, en });

/** Switches the whole UI (every `useLingui`/`Trans`) to the given language. */
export function activateLocale(locale: AppLocale): void {
  if (i18n.locale !== locale) i18n.activate(locale);
}

export { i18n };
