import {
  type CurrencyCode,
  Entry,
  type Expense,
  type Income,
  type MemberAmount,
  type Member,
  type MinorAmount,
  minorUnitDigits,
} from '@split-pay/shared';
import { DetailedError } from 'hono/client';
import { decimalSeparator } from '../../i18n/locale';
import { type ExpenseForm, type ExpenseGroup, type ParsedExpenseForm, parseExpenseForm } from './expense-draft';
import { initialPayersForm, initialSplitForm, type SplitForm } from './split-form';

/** An entry the full form edits (expense or income). */
export type FormEntry = Expense | Income;

/** Minor units as plain decimal text ("123.45", "100"), no grouping — what the amount fields accept. */
function decimalText(minor: MinorAmount, digits: number, separator: string): string {
  if (digits === 0) return String(minor);
  const text = String(minor).padStart(digits + 1, '0');
  const whole = text.slice(0, -digits);
  const fraction = text.slice(-digits).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}${separator}${fraction}`;
}

const holders = (entry: FormEntry) => (entry.kind === 'expense' ? entry.payers : entry.recipients);

/** The largest payer (income: recipient) — the form's single person choice. */
const mainHolder = (entry: FormEntry) =>
  [...holders(entry)].sort((a, b) => b.amount - a.amount || (a.memberId < b.memberId ? -1 : 1))[0]!.memberId;

/**
 * The full form opened by "Edytuj" (#11): the entry as entered — kind,
 * payers/recipients (several → the multiple-payers option), split mode with
 * its typed values, participants; the category counts as chosen.
 */
export function expenseFormFromEntry(entry: FormEntry): ExpenseForm {
  const digits = minorUnitDigits(entry.currency);
  const typed = (list: readonly MemberAmount[]) =>
    Object.fromEntries(list.map((x) => [x.memberId, decimalText(x.amount, digits, '.')]));
  const split = entry.split;
  let splitForm: SplitForm;
  let participantIds: string[];
  switch (split.mode) {
    case 'equal':
      splitForm = initialSplitForm;
      participantIds = [...split.memberIds];
      break;
    case 'exact':
      splitForm = { ...initialSplitForm, mode: 'exact', exact: typed(split.amounts) };
      participantIds = split.amounts.map((a) => a.memberId);
      break;
    case 'shares':
      splitForm = {
        ...initialSplitForm,
        mode: 'shares',
        weights: Object.fromEntries(split.weights.map((w) => [w.memberId, String(w.weight)])),
      };
      participantIds = split.weights.map((w) => w.memberId);
      break;
    case 'commonPlusPersonal':
      splitForm = { ...initialSplitForm, mode: 'commonPlusPersonal', personal: typed(split.personal) };
      participantIds = [...split.commonMemberIds];
      break;
  }
  const several = holders(entry).length > 1;
  return {
    amount: decimalText(entry.amount, digits, '.'),
    title: entry.title,
    payerMemberId: mainHolder(entry),
    date: entry.date,
    category: entry.category,
    categoryChosen: true,
    currency: entry.currency,
    // The frozen rate stays (ADR-0016): marked as typed so the ECB rate isn't prefilled over it.
    rate: entry.rateToBase,
    rateEdited: true,
    // The saved snapshot (ADR-0016): a new date moves them only while they are that day's defaults.
    participantIds,
    participantsDate: entry.date,
    split: splitForm,
    payers: several ? { multiple: true, amounts: typed(holders(entry)) } : initialPayersForm,
    kind: entry.kind,
  };
}

/**
 * The edited entry from the form — the whole entry, sent with the version it
 * was based on. Validated like a new one; keeps the id and the receipt (not
 * in the form yet, #26).
 */
export function editedEntry(
  entry: FormEntry,
  form: ExpenseForm,
  context: { group: ExpenseGroup; members: readonly Member[] },
): ParsedExpenseForm {
  const parsed = parseExpenseForm(form, { id: entry.id, group: context.group, members: context.members });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { ...parsed.value, receiptPhotoId: entry.receiptPhotoId } };
}

/** "Kopiuj kwotę": the bare number in the locale's decimal format, no currency, no grouping. */
export function amountForClipboard(minor: MinorAmount, currency: CurrencyCode, locale: string): string {
  const separator = decimalSeparator(locale);
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
 * An entry's long-press actions in menu order (SPEC: Edytuj, Usuń, Historia,
 * Kopiuj kwotę) — bubbles and settlement system messages alike ("Edytuj" on
 * a settlement opens the settle sheet). An archived group is read-only: only
 * Historia and Kopiuj kwotę. Offline, the same holds for entries I didn't add (`lockedOffline`).
 */
export function entryActions(
  entry: Entry,
  group: { archivedAt: string | null },
  device?: { offline: boolean; userId: string | undefined },
): EntryAction[] {
  if (group.archivedAt !== null || (device && lockedOffline(entry, device))) return ['history', 'copyAmount'];
  return ['edit', 'delete', 'history', 'copyAmount'];
}

/**
 * Offline, only entries I added can be edited or deleted; others' are
 * read-only until the connection is back (ADR-0005, #23) — that keeps
 * conflicts to my own entries.
 */
export function lockedOffline(entry: Pick<Entry, 'createdBy'>, device: { offline: boolean; userId: string | undefined }): boolean {
  return device.offline && entry.createdBy !== device.userId;
}

/** Where "Edytuj" opens with `?entryId=`: the settle sheet for a settlement, else the full form. */
export const editScreen = (entry: Entry) =>
  entry.kind === 'settlement' ? ('/groups/[groupId]/settle' as const) : ('/groups/[groupId]/expense-form' as const);

/** The full expense form can edit this entry. */
export const isEditableInForm = (entry: Entry): entry is FormEntry => entry.kind !== 'settlement';
