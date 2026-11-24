import { formatBankAccount, PayoutDetails } from '@split-pay/shared';

/** The Profile's payout details fields as typed. */
export interface PayoutDetailsForm {
  bankAccount: string;
  blikPhone: string;
}
export type PayoutDetailsField = keyof PayoutDetailsForm;

/** The form filled with stored details (account number grouped for reading). */
export const payoutDetailsForm = (details: PayoutDetails): PayoutDetailsForm => ({
  bankAccount: details.bankAccount ? formatBankAccount(details.bankAccount) : '',
  blikPhone: details.blikPhone ?? '',
});

/** Validates and normalizes the form with the shared schema; empty fields clear the detail. */
export function parsePayoutDetailsForm(
  form: PayoutDetailsForm,
): { ok: true; value: PayoutDetails } | { ok: false; errors: PayoutDetailsField[] } {
  const parsed = PayoutDetails.safeParse(form);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fields = new Set(parsed.error.issues.map((i) => i.path[0]));
  return { ok: false, errors: (['bankAccount', 'blikPhone'] as const).filter((f) => fields.has(f)) };
}
