import { type AppLocale, isAppLocale } from './locale';

// Web: localStorage, so the web build needs no SQLite/WASM setup for this.
const KEY = 'split-pay.language';

/** The language chosen in Profile, or null to follow the system language. */
export function loadLanguagePreference(): AppLocale | null {
  const value = globalThis.localStorage?.getItem(KEY) ?? null;
  return isAppLocale(value) ? value : null;
}

export function saveLanguagePreference(locale: AppLocale | null): void {
  if (locale === null) globalThis.localStorage?.removeItem(KEY);
  else globalThis.localStorage?.setItem(KEY, locale);
}
