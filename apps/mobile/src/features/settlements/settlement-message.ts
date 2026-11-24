import { t } from '@lingui/core/macro';
import { formatAmount, formatDate, type Member, type Settlement } from '@split-pay/shared';

/**
 * A settlement as a Conversation system message (ADR-0017), in the active UI
 * language: `text` = "Spłata: Bartek → Ania · 30,50 zł" (me as "Ty"), `label`
 * = the screen-reader sentence with the currency spelled out and the date.
 */
export function settlementMessage(
  entry: Pick<Settlement, 'from' | 'to' | 'amount' | 'currency' | 'date'>,
  context: { members: readonly { id: string; displayName: string }[]; myMemberId: string | null; locale: string },
): { text: string; label: string } {
  const name = (memberId: string) =>
    memberId === context.myMemberId ? t`Ty` : (context.members.find((m) => m.id === memberId)?.displayName ?? '?');
  const from = name(entry.from);
  const to = name(entry.to);
  const amount = formatAmount(entry.amount, entry.currency, context.locale);
  const spoken = formatAmount(entry.amount, entry.currency, context.locale, { currencyDisplay: 'name' });
  const date = formatDate(entry.date, context.locale);
  return {
    text: t`Spłata: ${from} → ${to} · ${amount}`,
    label: t`Spłata ${spoken}. Od: ${from}. Dla: ${to}. ${date}.`,
  };
}
