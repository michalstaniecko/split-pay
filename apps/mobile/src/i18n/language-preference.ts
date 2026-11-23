import Storage from 'expo-sqlite/kv-store';
import { type AppLocale, isAppLocale } from './locale';

// Native: SQLite-backed key-value store (synchronous, so the saved language is
// known before the first render). Web: see language-preference.web.ts.
const KEY = 'language';

/** The language chosen in Profile, or null to follow the system language. */
export function loadLanguagePreference(): AppLocale | null {
  const value = Storage.getItemSync(KEY);
  return isAppLocale(value) ? value : null;
}

export function saveLanguagePreference(locale: AppLocale | null): void {
  if (locale === null) Storage.removeItemSync(KEY);
  else Storage.setItemSync(KEY, locale);
}
