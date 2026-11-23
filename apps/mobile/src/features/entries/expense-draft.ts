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
   * Expense (default) or income (#13): for an income `payerMemberId` is the
   * recipient — the person chips read "Otrzymał(a)" instead of "Zapłacił(a)".
   */
  kind?: ExpenseFormKind;
}

/** What the full form saves; settlements have their own sheet. */
export type ExpenseFormKind = 'expense' | 'income';

/** A new income, as the full form sends it. */
export type NewIncome = Extract<NewEntry, { kind: 'income' }>;

/** The same entry as an income: payers become recipients, everything else stays (a reversed expense). */
export function asIncome(expense: NewExpense): NewIncome {
  const { kind: _kind, payers, ...fields } = expense;
  return { kind: 'income', ...fields, recipients: payers };
}

export type ExpenseFormField = 'amount' | 'title' | 'payer' | 'date';
const FIELDS: readonly ExpenseFormField[] = ['amount', 'title', 'payer', 'date'];

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
  };
}

/** Changes the title; the category follows the title until the user picks one. */
export function withTitle(form: ExpenseForm, title: string): ExpenseForm {
  return { ...form, title, category: form.categoryChosen ? form.category : suggestCategory(title) };
}

export type ParsedExpenseForm = { ok: true; value: NewExpense | NewIncome } | { ok: false; errors: ExpenseFormField[] };

/**
 * Validates the form and builds the equal-split expense — or income, with the
 * payer as its recipient (participants: present on the form's date).
 */
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

  const expense = equalExpenseDefaults({
    id: context.id,
    title: form.title,
    amount,
    currency: context.group.baseCurrency,
    date,
    payerMemberId: form.payerMemberId,
    members: context.members,
    category: form.category,
  });
  const value = form.kind === 'income' ? asIncome(expense) : expense;
  // Same schema as the API; catches limits like the title length.
  const checked = NewEntry.safeParse(value);
  if (!checked.success) {
    const invalid = new Set(checked.error.issues.map((i) => i.path[0]));
    return { ok: false, errors: FIELDS.filter((f) => invalid.has(f === 'payer' ? (value.kind === 'income' ? 'recipients' : 'payers') : f)) };
  }
  return { ok: true, value };
}
