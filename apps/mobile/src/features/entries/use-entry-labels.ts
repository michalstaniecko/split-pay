import { useLingui } from '@lingui/react/macro';
import type { Category, SplitMode } from '@split-pay/shared';

/** Translated names of categories and split modes. */
export function useEntryLabels() {
  const { t } = useLingui();
  const category: Record<Category, string> = {
    groceries: t`Zakupy spożywcze`,
    food: t`Jedzenie`,
    transport: t`Transport`,
    fuel: t`Paliwo`,
    accommodation: t`Nocleg`,
    alcohol: t`Alkohol`,
    entertainment: t`Rozrywka`,
    other: t`Inne`,
  };
  const splitMode: Record<SplitMode, string> = {
    equal: t`Po równo`,
    exact: t`Dokładne kwoty`,
    shares: t`Udziały`,
    commonPlusPersonal: t`Wspólne + osobiste`,
  };
  return { category, splitMode };
}
