import { z } from 'zod';

/**
 * Kwoty są zawsze liczbami całkowitymi w najmniejszej jednostce waluty
 * (grosze, centy…). Patrz docs/adr/0003-kwoty-w-jednostkach-minimalnych.md.
 */
export const MinorAmount = z.number().int().refine(Number.isSafeInteger, 'Kwota poza bezpiecznym zakresem');
export type MinorAmount = z.infer<typeof MinorAmount>;

export const PositiveMinorAmount = MinorAmount.refine((n) => n > 0, 'Kwota musi być dodatnia');

export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, 'Kod waluty ISO 4217');
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/**
 * Kurs przeliczenia: ile jednostek waluty bazowej za 1 jednostkę waluty wpisu,
 * zapisany jako dziesiętny string (np. "4.2715"), żeby uniknąć floatów.
 */
export const ExchangeRate = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,10})?$/, 'Kurs jako liczba dziesiętna, np. "4.2715"')
  .refine((s) => /[1-9]/.test(s), 'Kurs musi być dodatni');
export type ExchangeRate = z.infer<typeof ExchangeRate>;

/** Liczba miejsc po przecinku waluty (np. PLN → 2, JPY → 0, KWD → 3). */
export function minorUnitDigits(currency: CurrencyCode): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Dzielenie całkowite z zaokrągleniem połówek od zera. */
function divRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}

function toSafeNumber(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError('Wynik poza bezpiecznym zakresem');
  return n;
}

/**
 * Przelicza kwotę między walutami. `rate` = ile jednostek waluty docelowej
 * za 1 jednostkę waluty źródłowej. Zaokrąglenie: połówki od zera.
 */
export function convert(
  amount: MinorAmount,
  rate: ExchangeRate,
  from: CurrencyCode,
  to: CurrencyCode,
): MinorAmount {
  if (from === to) {
    if (rate !== '1' && !/^1\.0+$/.test(rate)) throw new RangeError('Kurs dla tej samej waluty musi wynosić 1');
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
  /** Nieujemna liczba całkowita. */
  weight: number;
}

export interface Allocation {
  memberId: string;
  amount: MinorAmount;
}

/**
 * Dzieli kwotę proporcjonalnie do wag tak, by suma udziałów była dokładnie
 * równa kwocie. Reszta (pojedyncze grosze) trafia do członków z największą
 * resztą z dzielenia, a przy remisie — według rosnącego `memberId`.
 * Arytmetyka wyłącznie całkowita (BigInt), więc wynik jest identyczny na
 * każdej platformie i niezależny od kolejności wejścia. Wynik jest
 * posortowany po `memberId`. Ujemna kwota (np. wpływ) dzielona symetrycznie.
 *
 * UWAGA: zmiana tego algorytmu zmienia salda historycznych wpisów (ADR-0016).
 */
export function allocate(total: MinorAmount, shares: readonly WeightedShare[]): Allocation[] {
  if (!Number.isSafeInteger(total)) throw new RangeError('Kwota musi być bezpieczną liczbą całkowitą');
  if (shares.length === 0) throw new RangeError('Brak członków do podziału');
  if (new Set(shares.map((s) => s.memberId)).size !== shares.length) {
    throw new RangeError('Zduplikowany memberId');
  }
  for (const s of shares) {
    if (!Number.isSafeInteger(s.weight) || s.weight < 0) {
      throw new RangeError(`Waga musi być nieujemną liczbą całkowitą (${s.memberId})`);
    }
  }
  const weightSum = shares.reduce((acc, s) => acc + BigInt(s.weight), 0n);
  if (weightSum === 0n) throw new RangeError('Suma wag musi być dodatnia');

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

/** Podział po równo — szczególny przypadek `allocate` z wagami 1. */
export function splitEvenly(total: MinorAmount, memberIds: readonly string[]): Allocation[] {
  return allocate(
    total,
    memberIds.map((memberId) => ({ memberId, weight: 1 })),
  );
}

/**
 * Przelicza listę alokacji na inną walutę tak, by suma wyniku była dokładnie
 * równa przeliczonej sumie (przeliczamy sumę, a potem dzielimy ją
 * proporcjonalnie do oryginalnych kwot).
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
    throw new RangeError('Alokacje muszą mieć ten sam znak');
  }
  if (total === 0) return allocations.map((a) => ({ memberId: a.memberId, amount: 0 }));
  return allocate(
    convert(total, rate, from, to),
    allocations.map((a) => ({ memberId: a.memberId, weight: Math.abs(a.amount) })),
  );
}
