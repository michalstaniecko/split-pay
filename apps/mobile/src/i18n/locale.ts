/** UI languages; keep in sync with `lingui.config.ts`. Polish is the source language. */
export const appLocales = ['pl', 'en'] as const;
export type AppLocale = (typeof appLocales)[number];

/** The locale's decimal separator ("," in Polish, "." in English). */
export function decimalSeparator(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';
}

/** Used when none of the system languages is supported. */
export const fallbackLocale: AppLocale = 'en';

export function isAppLocale(value: unknown): value is AppLocale {
  return appLocales.includes(value as AppLocale);
}

/**
 * The language the UI is shown in: the one chosen in Profile if any, otherwise
 * the first supported language from the system preference list (as returned
 * by `expo-localization`'s `getLocales()`), otherwise English.
 */
export function resolveLocale(
  preference: string | null,
  systemLocales: readonly { languageCode: string | null }[],
): AppLocale {
  if (isAppLocale(preference)) return preference;
  return systemLocales.map((l) => l.languageCode).find(isAppLocale) ?? fallbackLocale;
}
