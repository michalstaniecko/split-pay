import {
  type Category,
  type CurrencyCode,
  defaultEntryDate,
  defaultParticipants,
  equalExpenseDefaults,
  type Group,
  LocalDate,
  type Member,
  minorUnitDigits,
  type NewExpense,
  NewEntry,
  participantsOnDateChange,
  suggestCategory,
} from '@split-pay/shared';
import { parseAmountInput } from './amount-input';

/** What the group needs to provide for building an expense. */
export type ExpenseGroup = Pick<Group, 'id' | 'startDate' | 'endDate'> & { baseCurrency: CurrencyCode };

/** The composer's two fields, as typed (form fields mirror the data model, ADR-0017). */
export interface ComposerDraft {
  amount: string;
  title: string;
}

export const emptyComposerDraft: ComposerDraft = { amount: '', title: '' };

/** The device's local calendar date, "YYYY-MM-DD". */
export function todayLocalDate(now: Date = new Date()): LocalDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Send is enabled when the amount is > 0 and the title is not empty. */
export function canSendComposer(draft: ComposerDraft, digits: number): boolean {
  return parseAmountInput(draft.amount, digits) !== null && draft.title.trim() !== '';
}

/**
 * The expense the composer's send creates: paid by me, on the default date
 * (today, clamped to the trip), split equally among the members present that
 * day, category suggested from the title. `null` when it can't be sent.
 */
export function composerExpense(input: {
  draft: ComposerDraft;
  id: string;
  group: ExpenseGroup;
  members: readonly Member[];
  myMemberId: string | null;
  today: LocalDate;
}): NewExpense | null {
  const amount = parseAmountInput(input.draft.amount, minorUnitDigits(input.group.baseCurrency));
  if (amount === null || input.draft.title.trim() === '' || input.myMemberId === null) return null;
  return equalExpenseDefaults({
    id: input.id,
    title: input.draft.title,
    amount,
    currency: input.group.baseCurrency,
    date: defaultEntryDate(input.today, input.group),
    payerMemberId: input.myMemberId,
    members: input.members,
  });
}

/**
 * The full expense form while editing. This slice exposes payer, date and
 * category with an equal split in the base currency; later slices add their
 * fields here (split modes #12, income #13, currency #14) and to `parseExpenseForm`.
 */
export interface ExpenseForm {
  amount: string;
  title: string;
  payerMemberId: string;
  /** "YYYY-MM-DD" as typed. */
  date: string;
  category: Category;
  /** The user picked a category — stop suggesting it from the title. */
  categoryChosen: boolean;
  /**
   * Equal-split participants. They start as the members present on the date
   * and follow attendance when it changes, unless hand-picked (#15). Empty =
   * nobody present that day, which saves as everyone.
   */
  participantIds: string[];
  /** The last valid date `participantIds` were resolved for (`date` may be half-typed). */
  participantsDate: LocalDate;
}

export type ExpenseFormField = 'amount' | 'title' | 'payer' | 'date';
const FIELDS: readonly ExpenseFormField[] = ['amount', 'title', 'payer', 'date'];

/**
 * The form opened by "+": the composer's values, me as payer, the default
 * date, the members present that day, the suggested category.
 */
export function expenseFormFromComposer(input: {
  draft: ComposerDraft;
  group: ExpenseGroup;
  members: readonly Member[];
  myMemberId: string | null;
  today: LocalDate;
}): ExpenseForm {
  const date = defaultEntryDate(input.today, input.group);
  return {
    amount: input.draft.amount,
    title: input.draft.title,
    payerMemberId: input.myMemberId ?? '',
    date,
    category: suggestCategory(input.draft.title),
    categoryChosen: false,
    participantIds: defaultParticipants(input.members, date),
    participantsDate: date,
  };
}

/**
 * Changes the date as typed. Once it is a valid date, participants follow
 * attendance on it unless they were hand-picked (`participantsOnDateChange`).
 */
export function withDate(form: ExpenseForm, date: string, members: readonly Member[]): ExpenseForm {
  const next = date.trim();
  if (!LocalDate.safeParse(next).success || next === form.participantsDate) return { ...form, date };
  return {
    ...form,
    date,
    participantIds: participantsOnDateChange(members, form.participantIds, form.participantsDate, next),
    participantsDate: next,
  };
}

/** Changes the title; the category follows the title until the user picks one. */
export function withTitle(form: ExpenseForm, title: string): ExpenseForm {
  return { ...form, title, category: form.categoryChosen ? form.category : suggestCategory(title) };
}

export type ParsedExpenseForm = { ok: true; value: NewExpense } | { ok: false; errors: ExpenseFormField[] };

/** Validates the form and builds the equal-split expense among the form's participants. */
export function parseExpenseForm(
  form: ExpenseForm,
  context: { id: string; group: ExpenseGroup; members: readonly Member[] },
): ParsedExpenseForm {
  const errors = new Set<ExpenseFormField>();
  const amount = parseAmountInput(form.amount, minorUnitDigits(context.group.baseCurrency));
  if (amount === null) errors.add('amount');
  if (form.title.trim() === '') errors.add('title');
  if (!context.members.some((m) => m.id === form.payerMemberId)) errors.add('payer');
  const date = form.date.trim();
  if (!LocalDate.safeParse(date).success) errors.add('date');
  if (errors.size > 0 || amount === null) return { ok: false, errors: FIELDS.filter((f) => errors.has(f)) };

  const value = equalExpenseDefaults({
    id: context.id,
    title: form.title,
    amount,
    currency: context.group.baseCurrency,
    date,
    payerMemberId: form.payerMemberId,
    members: context.members,
    category: form.category,
  });
  // Nobody present that day: everyone takes part, as in `equalExpenseDefaults`.
  const memberIds = form.participantIds.length > 0 ? form.participantIds : context.members.map((m) => m.id);
  value.split = { mode: 'equal', memberIds: [...memberIds] };
  // Same schema as the API; catches limits like the title length.
  const checked = NewEntry.safeParse(value);
  if (!checked.success) {
    const invalid = new Set(checked.error.issues.map((i) => i.path[0]));
    return { ok: false, errors: FIELDS.filter((f) => invalid.has(f === 'payer' ? 'payers' : f)) };
  }
  return { ok: true, value };
}
