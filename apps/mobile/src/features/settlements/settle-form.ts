import {
  type CurrencyCode,
  type Settlement,
  type LocalDate,
  type Member,
  type MinorAmount,
  minorUnitDigits,
  NewEntry,
} from '@split-pay/shared';
import { parseAmountInput } from '../entries/amount-input';

/** A new settlement, as the settle sheet sends it. */
export type NewSettlement = Extract<NewEntry, { kind: 'settlement' }>;

/** The settle sheet's fields: member ids (`''` = not picked yet) and the amount as typed. */
export interface SettleForm {
  from: string;
  to: string;
  amount: string;
}

/** Minor units → amount field text ("30,50"), by string arithmetic — no floats. */
function amountText(amount: MinorAmount, digits: number, separator: string): string {
  if (digits === 0) return String(amount);
  const text = String(amount).padStart(digits + 1, '0');
  return `${text.slice(0, -digits)}${separator}${text.slice(-digits)}`;
}

/**
 * The sheet's starting values. "Oddaj" on a suggested transfer passes `to` and
 * `amount` (prefilled, still editable); "Inna spłata" passes neither and only
 * `from` defaults to me (`null` without a member of mine). `separator` is the
 * locale's decimal separator.
 */
export function settleForm(input: {
  from: string | null;
  to?: string;
  amount?: MinorAmount;
  currency: CurrencyCode;
  separator: string;
}): SettleForm {
  return {
    from: input.from ?? '',
    to: input.to ?? '',
    amount: input.amount === undefined ? '' : amountText(input.amount, minorUnitDigits(input.currency), input.separator),
  };
}

export type SettleFormField = 'from' | 'to' | 'amount';
const FIELDS: readonly SettleFormField[] = ['from', 'to', 'amount'];

export type ParsedSettleForm = { ok: true; value: NewSettlement } | { ok: false; errors: SettleFormField[] };

/**
 * Validates the sheet and builds the settlement: in `currency` (the group's
 * base currency) at rate 1, checked with the shared `NewEntry` schema.
 * A settlement to oneself is an error on `to`.
 */
export function parseSettleForm(
  form: SettleForm,
  context: { id: string; date: LocalDate; currency: CurrencyCode; members: readonly Pick<Member, 'id'>[] },
): ParsedSettleForm {
  const isMember = (memberId: string) => context.members.some((m) => m.id === memberId);
  const errors = new Set<SettleFormField>();
  if (!isMember(form.from)) errors.add('from');
  if (!isMember(form.to) || form.to === form.from) errors.add('to');
  const amount = parseAmountInput(form.amount, minorUnitDigits(context.currency));
  if (amount === null) errors.add('amount');
  if (errors.size > 0 || amount === null) return { ok: false, errors: FIELDS.filter((f) => errors.has(f)) };

  const parsed = NewEntry.safeParse({
    kind: 'settlement',
    id: context.id,
    date: context.date,
    amount,
    currency: context.currency,
    rateToBase: '1',
    from: form.from,
    to: form.to,
  });
  if (!parsed.success || parsed.data.kind !== 'settlement') return { ok: false, errors: [...FIELDS] };
  return { ok: true, value: parsed.data };
}

/** The settle sheet opened by "Edytuj" on a settlement (#10×#11): its people and amount. */
export function settleFormFromEntry(entry: Settlement, separator: string): SettleForm {
  return settleForm({ from: entry.from, to: entry.to, amount: entry.amount, currency: entry.currency, separator });
}

/**
 * The edited settlement from the sheet — validated like a new one; keeps the
 * entry's id, date, currency and rate (sent with the version it was based on).
 */
export function editedSettlement(
  entry: Settlement,
  form: SettleForm,
  members: readonly Pick<Member, 'id'>[],
): ParsedSettleForm {
  const parsed = parseSettleForm(form, { id: entry.id, date: entry.date, currency: entry.currency, members });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { ...parsed.value, rateToBase: entry.rateToBase } };
}
