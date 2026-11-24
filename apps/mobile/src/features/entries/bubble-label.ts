import { plural, t } from '@lingui/core/macro';
import { type CurrencyCode, formatDate } from '@split-pay/shared';
import { createFormatters } from '../../i18n/formatters';
import type { EntryItem } from './conversation';
import { incomeBubbleLabel } from './income-bubble-label';
import { spokenEntryAmount } from './spoken-amount';

/** "Kasia, Ania i Bartek" / "Kasia, Ania and Bartek". */
function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const rest = names.slice(0, -1).join(', ');
  const last = names[names.length - 1]!;
  return t`${rest} i ${last}`;
}

/**
 * The screen-reader label of a bubble naming its payers (income: recipients),
 * one sentence read as one element (the bubble label pattern of #36):
 * "Wydatek 90,00 zł: Pizza. Płacą: Kasia, Ania i Bartek. 10 lipca 2026. Twój
 * udział 30,00 zł." The verb agrees in number ("Płaci: Kasia"). Gender-neutral: names come after a colon, never as the
 * subject of a past-tense verb (docs/SPEC.md → Language). Amounts and the date come formatted (`useFormatters`);
 * `myShare` is `null` when I have no share. Uses the active Lingui locale.
 */
export function payersBubbleLabel(input: {
  kind: 'expense' | 'income';
  /** Largest amount first. */
  payerNames: readonly string[];
  title: string;
  amount: string;
  date: string;
  myShare: string | null;
}): string {
  const names = nameList(input.payerNames);
  const count = input.payerNames.length;
  const { amount, title, date } = input;
  const sentence =
    input.kind === 'expense'
      ? t`Wydatek ${amount}: ${title}. ${plural(count, { one: 'Płaci', few: 'Płacą', many: 'Płacą', other: 'Płacą' })}: ${names}. ${date}.`
      : t`Wpływ ${amount}: ${title}. Dla: ${names}. ${date}.`;
  if (input.myShare === null) return sentence;
  const share = input.myShare;
  return `${sentence} ${t`Twój udział ${share}.`}`;
}

/**
 * The screen-reader label of any bubble, one sentence for the whole bubble in
 * the active UI language (#36 pattern): incomes via `incomeBubbleLabel`,
 * several payers via `payersBubbleLabel`, otherwise "Wydatek 20,00 euro,
 * czyli około 86,43 złotego polskiego: Kolacja. Płaci: Kasia.
 * 11 lipca 2026. Twój udział 28,81 złotego polskiego."
 * Amounts spell the currency out; a foreign-currency entry reads the
 * original amount, then the base amount (#14).
 */
export function entryBubbleLabel(item: EntryItem, context: { baseCurrency: CurrencyCode; locale: string }): string {
  const { entry, payerName, payerNames, otherPayers, myShare, baseAmount } = item;
  if (entry.kind === 'income') return incomeBubbleLabel({ entry, payerName, otherPayers, myShare, baseAmount }, context);

  const amount = spokenEntryAmount(entry, baseAmount, context);
  const date = formatDate(entry.date, context.locale);
  if (entry.kind === 'settlement') return t`Spłata ${amount}. Od: ${payerName}. ${date}.`;

  const { spokenAmount } = createFormatters(context.locale);
  const spokenShare = myShare === null || myShare === 0 ? null : spokenAmount(myShare, context.baseCurrency);
  if (otherPayers > 0) {
    return payersBubbleLabel({ kind: 'expense', payerNames, title: entry.title, amount, date, myShare: spokenShare });
  }
  const title = entry.title;
  const sentence = t`Wydatek ${amount}: ${title}. Płaci: ${payerName}. ${date}.`;
  if (spokenShare === null) return sentence;
  const share = spokenShare;
  return `${sentence} ${t`Twój udział ${share}.`}`;
}
