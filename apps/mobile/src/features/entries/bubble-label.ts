import { plural, t } from '@lingui/core/macro';

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
 * "Kasia, Ania i Bartek zapłacili 90,00 zł za Pizza, 10 lipca 2026. Twój
 * udział 30,00 zł." Amounts and the date come formatted (`useFormatters`);
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
      ? t`${names} ${plural(count, { one: 'zapłacił(a)', few: 'zapłacili', many: 'zapłacili', other: 'zapłacili' })} ${amount} za ${title}, ${date}.`
      : t`${names} ${plural(count, { one: 'otrzymał(a)', few: 'otrzymali', many: 'otrzymali', other: 'otrzymali' })} ${amount} za ${title}, ${date}.`;
  if (input.myShare === null) return sentence;
  const share = input.myShare;
  return `${sentence} ${t`Twój udział ${share}.`}`;
}
