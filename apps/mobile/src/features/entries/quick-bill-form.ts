import { type CurrencyCode, type LocalDate, minorUnitDigits, NewQuickBill } from '@split-pay/shared';
import { BASE_CURRENCIES } from '../groups/new-group-form';
import { cleanAmountInput, parseAmountInput } from './amount-input';

/** The "Szybki rachunek" sheet: amount, title and "Z kim" chips. */
export interface QuickBillDraft {
  amount: string;
  title: string;
  /** The name being typed in "Z kim". */
  personName: string;
  /** Chips; each becomes a member without an account. Ids are generated when the chip is added. */
  people: { id: string; displayName: string }[];
}

export type QuickBillField = 'amount' | 'title' | 'people';
const FIELDS: readonly QuickBillField[] = ['amount', 'title', 'people'];

export const initialQuickBillDraft = (): QuickBillDraft => ({ amount: '', title: '', personName: '', people: [] });

/** Turns the typed name into a chip (no-op for an empty name). */
export function addPerson(draft: QuickBillDraft, id: string): QuickBillDraft {
  const displayName = draft.personName.trim().slice(0, 60);
  if (displayName === '') return draft;
  return { ...draft, personName: '', people: [...draft.people, { id, displayName }] };
}

export function removePerson(draft: QuickBillDraft, id: string): QuickBillDraft {
  return { ...draft, people: draft.people.filter((p) => p.id !== id) };
}

/** Used when the device region's currency is unknown or not offered. */
export const FALLBACK_QUICK_BILL_CURRENCY: CurrencyCode = 'PLN';

/**
 * The quick bill's default currency: the device region's currency
 * (`expo-localization` → `getLocales()[0].currencyCode`) when it is one of the
 * base currencies offered, otherwise PLN. No per-user default currency.
 */
export function defaultQuickBillCurrency(regionCurrency: string | null | undefined): CurrencyCode {
  return BASE_CURRENCIES.find((c) => c === regionCurrency) ?? FALLBACK_QUICK_BILL_CURRENCY;
}

/** Changing the currency trims the typed amount to its minor digits. */
export function withQuickBillCurrency(draft: QuickBillDraft, currency: CurrencyCode): QuickBillDraft {
  return { ...draft, amount: cleanAmountInput(draft.amount, minorUnitDigits(currency)) };
}

export type ParsedQuickBill = { ok: true; value: NewQuickBill } | { ok: false; errors: QuickBillField[] };

/**
 * Validates the sheet with the shared `NewQuickBill` schema (the API's). A
 * name still typed in "Z kim" counts as a chip (`pendingPersonId` is its id).
 */
export function parseQuickBillDraft(
  draft: QuickBillDraft,
  context: {
    groupId: string;
    expenseId: string;
    currency: CurrencyCode;
    color: string;
    today: LocalDate;
    pendingPersonId?: string;
  },
): ParsedQuickBill {
  const withPending = context.pendingPersonId ? addPerson(draft, context.pendingPersonId) : draft;
  const amount = parseAmountInput(draft.amount, minorUnitDigits(context.currency));
  const result = NewQuickBill.safeParse({
    groupId: context.groupId,
    expenseId: context.expenseId,
    title: draft.title,
    amount: amount ?? 0,
    currency: context.currency,
    date: context.today,
    color: context.color,
    people: withPending.people,
  });
  if (result.success) return { ok: true, value: result.data };
  const invalid = new Set(result.error.issues.map((i) => i.path[0]));
  if (amount === null) invalid.add('amount');
  return { ok: false, errors: FIELDS.filter((f) => invalid.has(f)) };
}
