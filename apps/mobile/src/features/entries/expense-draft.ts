import {
  type Category,
  type CurrencyCode,
  defaultEntryDate,
  equalExpenseDefaults,
  type Group,
  LocalDate,
  type Member,
  minorUnitDigits,
  type NewExpense,
  NewEntry,
  suggestCategory,
} from '@split-pay/shared';
import { parseAmountInput } from './amount-input';
import {
  buildPayers,
  buildSplit,
  initialPayersForm,
  initialSplitForm,
  type PayersForm,
  type SplitForm,
  withSplitDate,
} from './split-form';

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
  /** Split mode and its values (#12). */
  split: SplitForm;
  /** Multiple payers behind an advanced option; `payerMemberId` is the single payer (#12). */
  payers: PayersForm;
}

export type ExpenseFormField = 'amount' | 'title' | 'payer' | 'payerAmounts' | 'date' | 'split';
const FIELDS: readonly ExpenseFormField[] = ['amount', 'title', 'payer', 'payerAmounts', 'date', 'split'];

/** The form opened by "+": the composer's values, me as payer, the default date, the suggested category. */
export function expenseFormFromComposer(input: {
  draft: ComposerDraft;
  group: ExpenseGroup;
  myMemberId: string | null;
  today: LocalDate;
}): ExpenseForm {
  return {
    amount: input.draft.amount,
    title: input.draft.title,
    payerMemberId: input.myMemberId ?? '',
    date: defaultEntryDate(input.today, input.group),
    category: suggestCategory(input.draft.title),
    categoryChosen: false,
    split: initialSplitForm,
    payers: initialPayersForm,
  };
}

/** Changes the title; the category follows the title until the user picks one. */
export function withTitle(form: ExpenseForm, title: string): ExpenseForm {
  return { ...form, title, category: form.categoryChosen ? form.category : suggestCategory(title) };
}

/** Changes the date; participants follow who is present that day unless picked by hand. */
export function withDate(form: ExpenseForm, date: string, members: readonly Member[]): ExpenseForm {
  return { ...form, date, split: withSplitDate(form.split, members, form.date, date) };
}

export type ParsedExpenseForm = { ok: true; value: NewExpense } | { ok: false; errors: ExpenseFormField[] };

/** Validates the form and builds the expense with the form's split mode and payers. */
export function parseExpenseForm(
  form: ExpenseForm,
  context: { id: string; group: ExpenseGroup; members: readonly Member[] },
): ParsedExpenseForm {
  const errors = new Set<ExpenseFormField>();
  const amount = parseAmountInput(form.amount, minorUnitDigits(context.group.baseCurrency));
  if (amount === null) errors.add('amount');
  if (form.title.trim() === '') errors.add('title');
  if (!form.payers.multiple && !context.members.some((m) => m.id === form.payerMemberId)) errors.add('payer');
  const digits = minorUnitDigits(context.group.baseCurrency);
  const payers = buildPayers(form.payerMemberId, form.payers, { amount, digits });
  if (form.payers.multiple && !payers.ok) errors.add('payerAmounts');
  const date = form.date.trim();
  if (!LocalDate.safeParse(date).success) errors.add('date');
  const split = buildSplit(form.split, { amount, digits, members: context.members, date });
  if (amount !== null && !split.ok) errors.add('split');
  if (errors.size > 0 || amount === null || !payers.ok || !split.ok) {
    return { ok: false, errors: FIELDS.filter((f) => errors.has(f)) };
  }

  const defaults = equalExpenseDefaults({
    id: context.id,
    title: form.title,
    amount,
    currency: context.group.baseCurrency,
    date,
    payerMemberId: form.payerMemberId,
    members: context.members,
    category: form.category,
  });
  const value: NewExpense = { ...defaults, payers: payers.payers, split: split.split };
  // Same schema as the API; catches limits like the title length.
  const checked = NewEntry.safeParse(value);
  if (!checked.success) {
    const invalid = new Set(checked.error.issues.map((i) => i.path[0]));
    const payersField = form.payers.multiple ? 'payerAmounts' : 'payer';
    const pathOf = (f: ExpenseFormField) => (f === payersField ? 'payers' : f);
    return { ok: false, errors: FIELDS.filter((f) => invalid.has(pathOf(f))) };
  }
  return { ok: true, value };
}
