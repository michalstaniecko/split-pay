import { t } from '@lingui/core/macro';
import { type CurrencyCode, formatAmount } from '@split-pay/shared';
import type { BalanceRow, BannerState } from './balances';

interface LabelContext {
  baseCurrency: CurrencyCode;
  locale: string;
}

const spoken = (amount: number, context: LabelContext) =>
  formatAmount(Math.abs(amount), context.baseCurrency, context.locale, { currencyDisplay: 'name' });

/**
 * The balance banner for screen readers (#36), the currency spelled out and
 * the Polish impersonal ("Do oddania: 40,00 złotego polskiego", "Należy ci
 * się: …", "Wszystko rozliczone"). Uses the active Lingui locale.
 */
export function bannerLabel(state: BannerState, context: LabelContext): string {
  const amount = spoken(state.amount, context);
  if (state.kind === 'owe') return t`Do oddania: ${amount}`;
  if (state.kind === 'owed') return t`Należy ci się: ${amount}`;
  return t`Wszystko rozliczone`;
}

/**
 * A member's balance in the balance drawer for screen readers (#36): the name
 * in the nominative, then "do oddania" / "do odebrania" with the currency
 * spelled out, or "rozliczono". My own row is marked "(Ty)".
 */
export function balanceRowLabel(row: BalanceRow, context: LabelContext): string {
  const name = row.isMe ? t`${row.name} (Ty)` : row.name;
  const amount = spoken(row.amount, context);
  if (row.amount < 0) return t`${name}: do oddania ${amount}`;
  if (row.amount > 0) return t`${name}: do odebrania ${amount}`;
  return t`${name}: rozliczono`;
}
