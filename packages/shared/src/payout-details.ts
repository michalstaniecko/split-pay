import { z } from 'zod';

/**
 * An optional text field: separators (spaces, hyphens) removed, upper-cased;
 * empty = not given (`null`), otherwise it must match `pattern`.
 */
const optionalCode = (pattern: RegExp, message: string) =>
  z
    .string()
    .max(64)
    .nullable()
    .transform((value) => {
      const normalized = (value ?? '').replace(/[\s-]/g, '').toUpperCase();
      return normalized === '' ? null : normalized;
    })
    .pipe(z.string().regex(pattern, message).nullable());

/**
 * Payout details (GLOSSARY) of a user: where others can send a settlement.
 * Both optional. Stored without separators; visible only to members of a
 * group shared with the user. No payment integration — the app only shows them.
 */
export const PayoutDetails = z.object({
  /** A bank account number: a Polish NRB (26 digits) or an IBAN. */
  bankAccount: optionalCode(/^([A-Z]{2}\d{2})?[A-Z0-9]{10,30}$/, 'invalid bank account number'),
  /** A phone number registered for BLIK transfers, optionally with a `+` country code. */
  blikPhone: optionalCode(/^\+?\d{9,15}$/, 'invalid phone number'),
});
export type PayoutDetails = z.output<typeof PayoutDetails>;

export const hasPayoutDetails = (details: PayoutDetails): boolean =>
  details.bankAccount !== null || details.blikPhone !== null;

/**
 * A stored account number as people read it: a Polish NRB as `2 + 6×4`
 * digits, anything else (IBAN) in groups of four.
 */
export function formatBankAccount(account: string): string {
  const groups = (s: string) => s.match(/.{1,4}/g)?.join(' ') ?? s;
  return /^\d{26}$/.test(account) ? `${account.slice(0, 2)} ${groups(account.slice(2))}` : groups(account);
}
