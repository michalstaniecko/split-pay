import { plural, t } from '@lingui/core/macro';
import { type CurrencyCode, formatAmount, formatDate, type Income } from '@split-pay/shared';
import type { EntryItem } from './conversation';
import { spokenEntryAmount } from './spoken-amount';

/**
 * The screen-reader label of an income bubble — one sentence for the whole
 * bubble, in the active UI language (#36 pattern): "Wpływ 400,00 złotego
 * polskiego: Zwrot kaucji. Dla: Kasia i 1 inna osoba. 14 lipca 2026.
 * Twój udział 100,00 złotego polskiego."
 * Amounts spell the currency out; my share is read as a positive amount (the
 * part of the money that belongs to me) and left out when I have none.
 * A foreign-currency income also reads its base amount (`baseAmount`, #14).
 */
export function incomeBubbleLabel(
  item: Pick<EntryItem, 'payerName' | 'otherPayers' | 'myShare'> & { entry: Income; baseAmount?: number | null },
  context: { baseCurrency: CurrencyCode; locale: string },
): string {
  const { entry, payerName, otherPayers, myShare } = item;
  const spoken = (amount: number, currency: CurrencyCode) =>
    formatAmount(amount, currency, context.locale, { currencyDisplay: 'name' });
  const amount = spokenEntryAmount(entry, item.baseAmount ?? null, context);
  const title = entry.title;
  const date = formatDate(entry.date, context.locale);
  const recipients =
    otherPayers > 0
      ? t`${payerName} i ${plural(otherPayers, { one: '# inna osoba', few: '# inne osoby', many: '# innych osób', other: '# innej osoby' })}`
      : payerName;
  const sentence = t`Wpływ ${amount}: ${title}. Dla: ${recipients}. ${date}.`;
  if (myShare === null || myShare === 0) return sentence;
  const share = spoken(Math.abs(myShare), context.baseCurrency);
  return `${sentence} ${t`Twój udział ${share}.`}`;
}
