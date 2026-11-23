import { z } from 'zod';
import { CurrencyCode, ExchangeRate, MinorAmount, PositiveMinorAmount } from './money';

/**
 * Model danych wpisów grupy (wydatek, wpływ, spłata).
 * Słownictwo: GLOSSARY.md. Decyzje: ADR-0002, 0003, 0004, 0016.
 */

export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** Data kalendarzowa wyjazdu bez strefy czasowej: "YYYY-MM-DD". */
export const LocalDate = z.iso.date();
export type LocalDate = z.infer<typeof LocalDate>;

// ── Grupa i członkowie ───────────────────────────────────────────────────────

/** Obecność: zakres dni (włącznie). `null` = obecny przez cały wyjazd. */
export const Attendance = z
  .object({ from: LocalDate, to: LocalDate })
  .refine((a) => a.from <= a.to, 'Początek obecności po jej końcu');
export type Attendance = z.infer<typeof Attendance>;

export const Member = z.object({
  id: Id,
  groupId: Id,
  displayName: z.string().trim().min(1).max(60),
  /** `null` = członek bez konta. */
  userId: Id.nullable(),
  attendance: Attendance.nullable(),
});
export type Member = z.infer<typeof Member>;

export const Group = z
  .object({
    id: Id,
    name: z.string().trim().min(1).max(80),
    emoji: z.string().min(1).max(16),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    baseCurrency: CurrencyCode,
    /** Zakres dat — grupa z datami to wyjazd. */
    startDate: LocalDate.nullable(),
    endDate: LocalDate.nullable(),
    simplifyDebts: z.boolean(),
    archivedAt: z.iso.datetime().nullable(),
  })
  .refine((g) => (g.startDate === null) === (g.endDate === null), 'Podaj obie daty albo żadną')
  .refine((g) => g.startDate === null || g.endDate === null || g.startDate <= g.endDate, 'Data początku po dacie końca');
export type Group = z.infer<typeof Group>;

// ── Kategorie ────────────────────────────────────────────────────────────────

export const Category = z.enum([
  'groceries',
  'food',
  'transport',
  'fuel',
  'accommodation',
  'alcohol',
  'entertainment',
  'other',
]);
export type Category = z.infer<typeof Category>;

// ── Podział ──────────────────────────────────────────────────────────────────

const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;

const MemberAmount = z.object({ memberId: Id, amount: PositiveMinorAmount });
export type MemberAmount = z.infer<typeof MemberAmount>;

/**
 * Tryb podziału — przechowujemy to, co wpisał użytkownik, a udziały są
 * wyliczane deterministycznie (ADR-0016).
 */
export const Split = z.discriminatedUnion('mode', [
  /** Po równo między wybranych członków. */
  z.object({
    mode: z.literal('equal'),
    memberIds: z.array(Id).min(1).refine(uniqueIds, 'Zduplikowany członek'),
  }),
  /** Dokładne kwoty — muszą sumować się do kwoty wpisu. */
  z.object({
    mode: z.literal('exact'),
    amounts: z
      .array(MemberAmount)
      .min(1)
      .refine((xs) => uniqueIds(xs.map((x) => x.memberId)), 'Zduplikowany członek'),
  }),
  /** Udziały / wagi, np. 2:1:1. */
  z.object({
    mode: z.literal('shares'),
    weights: z
      .array(z.object({ memberId: Id, weight: z.number().int().min(1).max(1000) }))
      .min(1)
      .refine((xs) => uniqueIds(xs.map((x) => x.memberId)), 'Zduplikowany członek'),
  }),
  /**
   * Wspólne + osobiste: pozycje osobiste trafiają w całości do wskazanych
   * członków, reszta jest dzielona po równo między `commonMemberIds`.
   */
  z.object({
    mode: z.literal('commonPlusPersonal'),
    commonMemberIds: z.array(Id).refine(uniqueIds, 'Zduplikowany członek'),
    personal: z.array(MemberAmount).min(1),
  }),
]);
export type Split = z.infer<typeof Split>;
export type SplitMode = Split['mode'];

// ── Wpisy ────────────────────────────────────────────────────────────────────

const EntryMeta = {
  id: Id,
  groupId: Id,
  /** Numer wersji do wykrywania konfliktów przy synchronizacji (ADR-0005). */
  version: z.number().int().min(1),
  /** Użytkownik, który utworzył wpis — offline może go edytować tylko on. */
  createdBy: Id,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
};

const MoneyFields = {
  date: LocalDate,
  /** Kwota w walucie wpisu, zawsze dodatnia — kierunek wynika z rodzaju wpisu. */
  amount: PositiveMinorAmount,
  currency: CurrencyCode,
  /** Zamrożony kurs: jednostki waluty bazowej grupy za 1 jednostkę `currency`. */
  rateToBase: ExchangeRate,
};

const SplitFields = {
  title: z.string().trim().min(1).max(120),
  category: Category,
  split: Split,
  receiptPhotoId: Id.nullable(),
};

const payersField = z
  .array(MemberAmount)
  .min(1)
  .refine((xs) => uniqueIds(xs.map((x) => x.memberId)), 'Zduplikowany członek');

/** Wydatek: płatnicy zapłacili, uczestnicy podziału konsumują. */
export const Expense = z.object({
  kind: z.literal('expense'),
  ...EntryMeta,
  ...MoneyFields,
  ...SplitFields,
  payers: payersField,
});
export type Expense = z.infer<typeof Expense>;

/** Wpływ: odbiorcy dostali pieniądze należące do uczestników podziału. */
export const Income = z.object({
  kind: z.literal('income'),
  ...EntryMeta,
  ...MoneyFields,
  ...SplitFields,
  recipients: payersField,
});
export type Income = z.infer<typeof Income>;

/** Spłata: `from` przekazał pieniądze `to`. */
export const Settlement = z
  .object({
    kind: z.literal('settlement'),
    ...EntryMeta,
    ...MoneyFields,
    from: Id,
    to: Id,
  })
  .refine((s) => s.from !== s.to, 'Spłata do samego siebie');
export type Settlement = z.infer<typeof Settlement>;

const sumAmounts = (xs: readonly { amount: number }[]) => xs.reduce((acc, x) => acc + x.amount, 0);

function checkSplitAgainstAmount(split: Split, amount: MinorAmount, ctx: z.RefinementCtx) {
  if (split.mode === 'exact' && sumAmounts(split.amounts) !== amount) {
    ctx.addIssue({ code: 'custom', path: ['split'], message: 'Kwoty podziału nie sumują się do kwoty wpisu' });
  }
  if (split.mode === 'commonPlusPersonal') {
    const personal = sumAmounts(split.personal);
    if (personal > amount) {
      ctx.addIssue({ code: 'custom', path: ['split'], message: 'Pozycje osobiste przekraczają kwotę wpisu' });
    } else if (personal < amount && split.commonMemberIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['split'], message: 'Brak członków do podziału części wspólnej' });
    }
  }
}

export const Entry = z
  .discriminatedUnion('kind', [Expense, Income, Settlement])
  .superRefine((entry, ctx) => {
    if (entry.kind === 'settlement') return;
    const holders = entry.kind === 'expense' ? entry.payers : entry.recipients;
    if (sumAmounts(holders) !== entry.amount) {
      ctx.addIssue({
        code: 'custom',
        path: [entry.kind === 'expense' ? 'payers' : 'recipients'],
        message: 'Suma płatników nie równa się kwocie wpisu',
      });
    }
    checkSplitAgainstAmount(entry.split, entry.amount, ctx);
  });
export type Entry = z.infer<typeof Entry>;
export type EntryKind = Entry['kind'];

/** Wszyscy członkowie, do których odwołuje się wpis. */
export function referencedMemberIds(entry: Entry): Set<Id> {
  if (entry.kind === 'settlement') return new Set([entry.from, entry.to]);
  const holders = entry.kind === 'expense' ? entry.payers : entry.recipients;
  const ids = holders.map((h) => h.memberId);
  const split = entry.split;
  switch (split.mode) {
    case 'equal':
      ids.push(...split.memberIds);
      break;
    case 'exact':
      ids.push(...split.amounts.map((a) => a.memberId));
      break;
    case 'shares':
      ids.push(...split.weights.map((w) => w.memberId));
      break;
    case 'commonPlusPersonal':
      ids.push(...split.commonMemberIds, ...split.personal.map((p) => p.memberId));
      break;
  }
  return new Set(ids);
}

/** Sprawdza wpis względem grupy: członkowie, waluta bazowa, archiwizacja. */
export function validateEntryInGroup(entry: Entry, group: Group, members: readonly Member[]): string[] {
  const errors: string[] = [];
  if (entry.groupId !== group.id) errors.push('Wpis należy do innej grupy');
  if (group.archivedAt !== null) errors.push('Grupa jest zarchiwizowana');
  if (entry.currency === group.baseCurrency && Number(entry.rateToBase) !== 1) {
    errors.push('Kurs dla waluty bazowej musi wynosić 1');
  }
  const known = new Set(members.filter((m) => m.groupId === group.id).map((m) => m.id));
  for (const id of referencedMemberIds(entry)) {
    if (!known.has(id)) errors.push(`Nieznany członek: ${id}`);
  }
  return errors;
}
