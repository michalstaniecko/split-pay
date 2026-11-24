import { z } from 'zod';

/**
 * Amounts are always integers in the currency's minor unit (grosze, cents…).
 * See docs/adr/0003-amounts-in-minor-units.md.
 */
export const MinorAmount = z.number().int().refine(Number.isSafeInteger, 'Amount out of safe integer range');
export type MinorAmount = z.infer<typeof MinorAmount>;

export const PositiveMinorAmount = MinorAmount.refine((n) => n > 0, 'Amount must be positive');

export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 currency code');
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/**
 * Exchange rate: units of the base currency per 1 unit of the entry currency,
 * stored as a decimal string (e.g. "4.2715") to avoid floats.
 */
export const ExchangeRate = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,10})?$/, 'Rate must be a decimal string, e.g. "4.2715"')
  .refine((s) => /[1-9]/.test(s), 'Rate must be positive');
export type ExchangeRate = z.infer<typeof ExchangeRate>;

/** Whether a rate is exactly 1 ("1", "1.00", "01"…), compared as a decimal string, never as a float. */
export function isUnitRate(rate: ExchangeRate): boolean {
  return /^0*1(\.0+)?$/.test(rate);
}

/** Number of decimal places of a currency (e.g. PLN → 2, JPY → 0, KWD → 3). */
export function minorUnitDigits(currency: CurrencyCode): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Integer division rounding halves away from zero. */
function divRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}

function toSafeNumber(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError('Result out of safe integer range');
  return n;
}

/**
 * Converts an amount between currencies. `rate` = units of the target currency
 * per 1 unit of the source currency. Rounding: halves away from zero.
 */
export function convert(
  amount: MinorAmount,
  rate: ExchangeRate,
  from: CurrencyCode,
  to: CurrencyCode,
): MinorAmount {
  if (from === to) {
    if (!isUnitRate(rate)) throw new RangeError('Rate for the same currency must be 1');
    return amount;
  }
  ExchangeRate.parse(rate);
  const [intPart, fracPart = ''] = rate.split('.');
  const rateScaled = BigInt(`${intPart}${fracPart}`);
  const digitShift = minorUnitDigits(to) - minorUnitDigits(from);
  let numerator = BigInt(amount) * rateScaled;
  let denominator = 10n ** BigInt(fracPart.length);
  if (digitShift >= 0) numerator *= 10n ** BigInt(digitShift);
  else denominator *= 10n ** BigInt(-digitShift);
  return toSafeNumber(divRoundHalfAwayFromZero(numerator, denominator));
}

export interface WeightedShare {
  memberId: string;
  /** Non-negative integer. */
  weight: number;
}

export interface Allocation {
  memberId: string;
  amount: MinorAmount;
}

/**
 * Splits an amount proportionally to weights so that the shares add up to
 * exactly the amount. The remainder (single minor units) goes to the members
 * with the largest division remainder, ties broken by ascending `memberId`.
 * Integer-only arithmetic (BigInt), so the result is identical on every
 * platform and independent of input order. The result is sorted by
 * `memberId`. A negative amount (e.g. income) is split symmetrically.
 *
 * NOTE: changing this algorithm changes the balances of historical entries (ADR-0016).
 */
export function allocate(total: MinorAmount, shares: readonly WeightedShare[]): Allocation[] {
  if (!Number.isSafeInteger(total)) throw new RangeError('Amount must be a safe integer');
  if (shares.length === 0) throw new RangeError('No members to split between');
  if (new Set(shares.map((s) => s.memberId)).size !== shares.length) {
    throw new RangeError('Duplicate memberId');
  }
  for (const s of shares) {
    if (!Number.isSafeInteger(s.weight) || s.weight < 0) {
      throw new RangeError(`Weight must be a non-negative integer (${s.memberId})`);
    }
  }
  const weightSum = shares.reduce((acc, s) => acc + BigInt(s.weight), 0n);
  if (weightSum === 0n) throw new RangeError('Sum of weights must be positive');

  const sign = total < 0 ? -1n : 1n;
  const abs = BigInt(Math.abs(total));

  const parts = [...shares]
    .sort((a, b) => compareIds(a.memberId, b.memberId))
    .map((s) => {
      const product = abs * BigInt(s.weight);
      return { memberId: s.memberId, amount: product / weightSum, rest: product % weightSum };
    });

  let remainder = abs - parts.reduce((acc, p) => acc + p.amount, 0n);
  const order = parts
    .map((p, index) => ({ index, rest: p.rest }))
    .sort((a, b) => (a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1));
  for (const { index } of order) {
    if (remainder === 0n) break;
    parts[index]!.amount += 1n;
    remainder -= 1n;
  }

  return parts.map((p) => ({ memberId: p.memberId, amount: toSafeNumber(sign * p.amount) || 0 }));
}

/** Equal split — a special case of `allocate` with all weights equal to 1. */
export function splitEvenly(total: MinorAmount, memberIds: readonly string[]): Allocation[] {
  return allocate(
    total,
    memberIds.map((memberId) => ({ memberId, weight: 1 })),
  );
}

/**
 * Converts a list of allocations to another currency so that the result adds
 * up to exactly the converted total (convert the total first, then split it
 * proportionally to the original amounts).
 */
export function convertAllocations(
  allocations: readonly Allocation[],
  rate: ExchangeRate,
  from: CurrencyCode,
  to: CurrencyCode,
): Allocation[] {
  if (from === to) return allocations.map((a) => ({ ...a }));
  const total = allocations.reduce((acc, a) => acc + a.amount, 0);
  if (allocations.some((a) => Math.sign(a.amount) * Math.sign(total) < 0)) {
    throw new RangeError('Allocations must all have the same sign');
  }
  if (total === 0) return allocations.map((a) => ({ memberId: a.memberId, amount: 0 }));
  return allocate(
    convert(total, rate, from, to),
    allocations.map((a) => ({ memberId: a.memberId, weight: Math.abs(a.amount) })),
  );
}
