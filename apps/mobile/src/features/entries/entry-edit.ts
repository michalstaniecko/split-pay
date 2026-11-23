import {
  type CurrencyCode,
  Entry,
  type Expense,
  LocalDate,
  type Member,
  type MinorAmount,
  minorUnitDigits,
  participantsOnDateChange,
} from '@split-pay/shared';
import { DetailedError } from 'hono/client';
import { type ExpenseForm, type ExpenseGroup, type ParsedExpenseForm, parseExpenseForm } from './expense-draft';

/** Minor units as plain decimal text ("123.45", "100"), no grouping. */
function decimalText(minor: MinorAmount, digits: number, separator: string): string {
  if (digits === 0) return String(minor);
  const text = String(minor).padStart(digits + 1, '0');
  const whole = text.slice(0, -digits);
  const fraction = text.slice(-digits).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}${separator}${fraction}`;
}

/** The largest payer — the one the form's single "Zapłacił(a)" shows. */
const mainPayer = (entry: Expense) =>
  [...entry.payers].sort((a, b) => b.amount - a.amount || (a.memberId < b.memberId ? -1 : 1))[0]!.memberId;

/** The full expense form opened by "Edytuj": the entry as entered (the category counts as chosen). */
export function expenseFormFromEntry(entry: Expense): ExpenseForm {
  return {
    amount: decimalText(entry.amount, minorUnitDigits(entry.currency), '.'),
    title: entry.title,
    payerMemberId: mainPayer(entry),
    date: entry.date,
    category: entry.category,
    categoryChosen: true,
  };
}

/**
 * The edited expense from the form (sent as the whole entry, with the version
 * it was based on). Validates like a new expense, then keeps what the form
 * doesn't show: the receipt, the split participants (snapshot, ADR-0016 —
 * defaults follow a changed date via `participantsOnDateChange`, hand-picked
 * ones stay; other split modes are kept as they are) and several payers while
 * the amount and the payer are untouched.
 * TODO(#12, #13, #14): split modes, income and the entry currency in the form.
 */
export function editedExpense(
  entry: Expense,
  form: ExpenseForm,
  context: { group: ExpenseGroup; members: readonly Member[] },
): ParsedExpenseForm {
  const parsed = parseExpenseForm(form, { id: entry.id, group: context.group, members: context.members });
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const split = editedSplit(entry, value.date, context.members);
  const payersKept = value.amount === entry.amount && form.payerMemberId === mainPayer(entry);
  return {
    ok: true,
    value: { ...value, receiptPhotoId: entry.receiptPhotoId, split, payers: payersKept ? entry.payers : value.payers },
  };
}

/**
 * The edited entry's split for the form's date: an equal split's participants
 * follow a new date while they are that day's defaults (hand-picked ones
 * stay); other modes are kept.
 */
export function editedSplit(entry: Expense, date: string, members: readonly Member[]): Expense['split'] {
  if (entry.split.mode !== 'equal') return entry.split;
  if (date === entry.date || !LocalDate.safeParse(date).success) return entry.split;
  return { mode: 'equal', memberIds: participantsOnDateChange(members, entry.split.memberIds, entry.date, date) };
}

/** "Kopiuj kwotę":the bare number in the locale's decimal format, no currency, no grouping. */
export function amountForClipboard(minor: MinorAmount, currency: CurrencyCode, locale: string): string {
  const separator = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
  const digits = minorUnitDigits(currency);
  if (digits === 0) return String(minor);
  const text = String(minor).padStart(digits + 1, '0');
  return `${text.slice(0, -digits)}${separator}${text.slice(-digits)}`;
}

/** The server's current entry when a change was rejected as a version conflict (409), else `null`. */
export function versionConflictEntry(error: unknown): Entry | null {
  if (!(error instanceof DetailedError) || error.statusCode !== 409) return null;
  const data = (error.detail as { data?: unknown } | undefined)?.data as { error?: unknown; entry?: unknown } | undefined;
  if (data?.error !== 'version_conflict') return null;
  const entry = Entry.safeParse(data.entry);
  return entry.success ? entry.data : null;
}

export type EntryAction = 'edit' | 'delete' | 'history' | 'copyAmount';

/**
 * A bubble's long-press actions in menu order (SPEC: Edytuj, Usuń, Historia,
 * Kopiuj kwotę). An archived group is read-only: only Historia and Kopiuj
 * kwotę. "Edytuj" only for kinds the full form can edit (expenses so far;
 * TODO(#10, #13): settlements and incomes).
 */
export function entryActions(entry: Pick<Entry, 'kind'>, group: { archivedAt: string | null }): EntryAction[] {
  if (group.archivedAt !== null) return ['history', 'copyAmount'];
  return [...(isEditableInForm(entry) ? (['edit'] as const) : []), 'delete', 'history', 'copyAmount'];
}

/** The full expense form can edit this entry. */
export const isEditableInForm = (entry: Pick<Entry, 'kind'>): boolean => entry.kind === 'expense';
