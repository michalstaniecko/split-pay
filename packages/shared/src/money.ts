import { z } from 'zod';

/**
 * Kwoty są zawsze liczbami całkowitymi w najmniejszej jednostce waluty
 * (grosze, centy…). Patrz docs/adr/0003-kwoty-w-jednostkach-minimalnych.md.
 */
export const MinorAmount = z.number().int().refine(Number.isSafeInteger, 'Kwota poza bezpiecznym zakresem');
export type MinorAmount = z.infer<typeof MinorAmount>;

export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, 'Kod waluty ISO 4217');
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/** Liczba miejsc po przecinku waluty (np. PLN → 2, JPY → 0, KWD → 3). */
export function minorUnitDigits(currency: CurrencyCode): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

export interface WeightedShare {
  memberId: string;
  weight: number;
}

export interface Allocation {
  memberId: string;
  amount: MinorAmount;
}

/**
 * Dzieli kwotę proporcjonalnie do wag tak, by suma udziałów była dokładnie
 * równa kwocie. Reszta (pojedyncze grosze) trafia do członków z największą
 * częścią ułamkową, a przy remisie — według rosnącego `memberId`.
 * Wynik jest deterministyczny i niezależny od kolejności wejścia.
 * Ujemna kwota (wpływ) jest dzielona symetrycznie.
 */
export function allocate(total: MinorAmount, shares: readonly WeightedShare[]): Allocation[] {
  if (!Number.isSafeInteger(total)) throw new RangeError('Kwota musi być bezpieczną liczbą całkowitą');
  if (shares.length === 0) throw new RangeError('Brak członków do podziału');
  if (new Set(shares.map((s) => s.memberId)).size !== shares.length) {
    throw new RangeError('Zduplikowany memberId');
  }
  for (const s of shares) {
    if (!Number.isFinite(s.weight) || s.weight < 0) throw new RangeError(`Niepoprawna waga dla ${s.memberId}`);
  }
  const weightSum = shares.reduce((acc, s) => acc + s.weight, 0);
  if (weightSum <= 0) throw new RangeError('Suma wag musi być dodatnia');

  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);

  const sorted = [...shares].sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
  const parts = sorted.map((s) => {
    const exact = (abs * s.weight) / weightSum;
    const floor = Math.floor(exact);
    return { memberId: s.memberId, floor, fraction: exact - floor };
  });

  let remainder = abs - parts.reduce((acc, p) => acc + p.floor, 0);
  const order = parts
    .map((p, index) => ({ index, fraction: p.fraction }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    parts[index]!.floor += 1;
    remainder -= 1;
  }

  return parts.map((p) => ({ memberId: p.memberId, amount: sign * p.floor || 0 }));
}

/** Podział po równo — szczególny przypadek `allocate` z wagami 1. */
export function splitEvenly(total: MinorAmount, memberIds: readonly string[]): Allocation[] {
  return allocate(
    total,
    memberIds.map((memberId) => ({ memberId, weight: 1 })),
  );
}
