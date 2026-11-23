import { I18nProvider } from '@lingui/react';
import { getLocales, useLocales } from 'expo-localization';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import { activateLocale, i18n } from './i18n';
import { loadLanguagePreference, saveLanguagePreference } from './language-preference';
import { type AppLocale, resolveLocale } from './locale';

interface LocaleContextValue {
  /** The language the UI is shown in. */
  locale: AppLocale;
  /** The language chosen in Profile; null = follow the system language. */
  preference: AppLocale | null;
  setPreference: (preference: AppLocale | null) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const systemLocales = useLocales();
  const [preference, setPreferenceState] = useState(() => {
    // Activate before the first render so nothing flashes in the wrong language.
    const saved = loadLanguagePreference();
    activateLocale(resolveLocale(saved, getLocales()));
    return saved;
  });
  const locale = resolveLocale(preference, systemLocales);

  // Later changes (Profile, system settings on Android) are applied here.
  useEffect(() => activateLocale(locale), [locale]);

  const setPreference = (next: AppLocale | null) => {
    saveLanguagePreference(next);
    setPreferenceState(next);
  };

  return (
    <LocaleContext value={{ locale, preference, setPreference }}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </LocaleContext>
  );
}

export function useLocale(): LocaleContextValue {
  const value = use(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside <LocaleProvider>');
  return value;
}
