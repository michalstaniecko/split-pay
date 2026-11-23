import { plural, t } from '@lingui/core/macro';
import { type CurrencyCode, formatAmount, formatDate } from '@split-pay/shared';
import type { EntryItem } from './conversation';
import { incomeBubbleLabel } from './income-bubble-label';
import { spokenEntryAmount } from './spoken-amount';

/**
 * The screen-reader label of any bubble — one sentence for the whole bubble,
 * in the active UI language (#36 pattern, as `incomeBubbleLabel`): "Wydatek
 * 20,00 euro, czyli około 86,43 złotego polskiego: Kolacja. Zapłacił(a):
 * Kasia. 11 lipca 2026. Twój udział 28,81 złotego polskiego."
 * A foreign-currency entry reads the original amount, then the base amount.
 */
export function entryBubbleLabel(item: EntryItem, context: { baseCurrency: CurrencyCode; locale: string }): string {
  const { entry, payerName, otherPayers, myShare, baseAmount } = item;
  if (entry.kind === 'income') return incomeBubbleLabel({ entry, payerName, otherPayers, myShare, baseAmount }, context);

  const amount = spokenEntryAmount(entry, baseAmount, context);
  const date = formatDate(entry.date, context.locale);
  if (entry.kind === 'settlement') return t`Spłata ${amount}. Od: ${payerName}. ${date}.`;

  const title = entry.title;
  const payers =
    otherPayers > 0
      ? t`${payerName} i ${plural(otherPayers, { one: '# inna osoba', few: '# inne osoby', many: '# innych osób', other: '# innej osoby' })}`
      : payerName;
  const sentence = t`Wydatek ${amount}: ${title}. Zapłacił(a): ${payers}. ${date}.`;
  if (myShare === null || myShare === 0) return sentence;
  const share = formatAmount(myShare, context.baseCurrency, context.locale, { currencyDisplay: 'name' });
  return `${sentence} ${t`Twój udział ${share}.`}`;
}
