import { z } from 'zod';
import { CurrencyCode, ExchangeRate, MinorAmount, PositiveMinorAmount } from './money';

/**
 * Data model of group entries (expense, income, settlement).
 * Vocabulary: GLOSSARY.md. Decisions: ADR-0002, 0003, 0004, 0016.
 *
 * Validation messages are developer-facing English; the UI maps issues to
 * translated copy via i18n.
 */

export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** Calendar date of the trip without a time zone: "YYYY-MM-DD". */
export const LocalDate = z.iso.date();
export type LocalDate = z.infer<typeof LocalDate>;

// ── Group and members ────────────────────────────────────────────────────────

/** The calendar day after `date`. */
function nextDay(date: LocalDate): LocalDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Inclusive range of days. */
export const AttendanceRange = z
  .object({ from: LocalDate, to: LocalDate })
  .refine((a) => a.from <= a.to, 'Attendance starts after it ends');
export type AttendanceRange = z.infer<typeof AttendanceRange>;

/**
 * Attendance: one or more ranges of days in canonical form — sorted, with no
 * overlapping or touching ranges (ADR-0018). Not checked against the trip
 * dates. `null` on a member = present for the whole trip.
 */
export const Attendance = z
  .array(AttendanceRange)
  .min(1, 'Attendance needs at least one range')
  .superRefine((ranges, ctx) => {
    for (let i = 1; i < ranges.length; i++) {
      // Canonical: each range starts at least two days after the previous one ends.
      if (ranges[i]!.from <= nextDay(ranges[i - 1]!.to)) {
        ctx.addIssue({
          code: 'custom',
          path: [i],
          message: 'Attendance ranges must be sorted, without overlapping or touching ranges',
        });
      }
    }
  });
export type Attendance = z.infer<typeof Attendance>;

export const Member = z.object({
  id: Id,
  groupId: Id,
  displayName: z.string().trim().min(1).max(60),
  /** `null` = member without account. */
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
    /** Date range — a group with dates is a trip. */
    startDate: LocalDate.nullable(),
    endDate: LocalDate.nullable(),
    simplifyDebts: z.boolean(),
    archivedAt: z.iso.datetime().nullable(),
  })
  .refine((g) => (g.startDate === null) === (g.endDate === null), 'Provide both dates or neither')
  .refine((g) => g.startDate === null || g.endDate === null || g.startDate <= g.endDate, 'Start date after end date');
export type Group = z.infer<typeof Group>;

// ── Categories ───────────────────────────────────────────────────────────────

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

// ── Split ────────────────────────────────────────────────────────────────────

const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;

const MemberAmount = z.object({ memberId: Id, amount: PositiveMinorAmount });
export type MemberAmount = z.infer<typeof MemberAmount>;

/**
 * Split mode — we store what the user entered; shares are derived
 * deterministically (ADR-0016).
 */
export const Split = z.discriminatedUnion('mode', [
  /** Equally between the selected members. */
  z.object({
    mode: z.literal('equal'),
    memberIds: z.array(Id).min(1).refine(uniqueIds, 'Duplicate member'),
  }),
  /** Exact amounts — must add up to the entry amount. */
  z.object({
    mode: z.literal('exact'),
    amounts: z
      .array(MemberAmount)
      .min(1)
      .refine((xs) => uniqueIds(xs.map((x) => x.memberId)), 'Duplicate member'),
  }),
  /** Shares / weights, e.g. 2:1:1. */
  z.object({
    mode: z.literal('shares'),
    weights: z
      .array(z.object({ memberId: Id, weight: z.number().int().min(1).max(1000) }))
      .min(1)
      .refine((xs) => uniqueIds(xs.map((x) => x.memberId)), 'Duplicate member'),
  }),
  /**
   * Common + personal: personal items go entirely to the given members, the
   * rest is split equally between `commonMemberIds`.
   */
  z.object({
    mode: z.literal('commonPlusPersonal'),
    commonMemberIds: z.array(Id).refine(uniqueIds, 'Duplicate member'),
    personal: z.array(MemberAmount).min(1),
  }),
]);
export type Split = z.infer<typeof Split>;
export type SplitMode = Split['mode'];

// ── Entries ──────────────────────────────────────────────────────────────────

const EntryMeta = {
  id: Id,
  groupId: Id,
  /** Version number for conflict detection during sync (ADR-0005). */
  version: z.number().int().min(1),
  /** User who created the entry — only they may edit it offline. */
  createdBy: Id,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
};

const MoneyFields = {
  date: LocalDate,
  /** Amount in the entry currency, always positive — direction follows from the entry kind. */
  amount: PositiveMinorAmount,
  currency: CurrencyCode,
  /** Frozen rate: units of the group's base currency per 1 unit of `currency`. */
  rateToBase: ExchangeRate,
};

const SplitFields = {
  title: z.string().trim().min(1).max(120),
  category: Category,
  split: Split,
  receiptPhotoId: Id.nullable(),
};

const holdersField = z
  .array(MemberAmount)
  .min(1)
  .refine((xs) => uniqueIds(xs.map((x) => x.memberId)), 'Duplicate member');

/** Expense: payers paid, split participants consume. */
export const Expense = z.object({
  kind: z.literal('expense'),
  ...EntryMeta,
  ...MoneyFields,
  ...SplitFields,
  payers: holdersField,
});
export type Expense = z.infer<typeof Expense>;

/** Income: recipients received money that belongs to the split participants. */
export const Income = z.object({
  kind: z.literal('income'),
  ...EntryMeta,
  ...MoneyFields,
  ...SplitFields,
  recipients: holdersField,
});
export type Income = z.infer<typeof Income>;

/** Settlement: `from` handed money over to `to`. */
export const Settlement = z
  .object({
    kind: z.literal('settlement'),
    ...EntryMeta,
    ...MoneyFields,
    from: Id,
    to: Id,
  })
  .refine((s) => s.from !== s.to, 'Settlement to oneself');
export type Settlement = z.infer<typeof Settlement>;

const sumAmounts = (xs: readonly { amount: number }[]) => xs.reduce((acc, x) => acc + x.amount, 0);

function checkSplitAgainstAmount(split: Split, amount: MinorAmount, ctx: z.RefinementCtx) {
  if (split.mode === 'exact' && sumAmounts(split.amounts) !== amount) {
    ctx.addIssue({ code: 'custom', path: ['split'], message: 'Split amounts do not add up to the entry amount' });
  }
  if (split.mode === 'commonPlusPersonal') {
    const personal = sumAmounts(split.personal);
    if (personal > amount) {
      ctx.addIssue({ code: 'custom', path: ['split'], message: 'Personal items exceed the entry amount' });
    } else if (personal < amount && split.commonMemberIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['split'], message: 'No members to split the common part between' });
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
        message: 'Payer amounts do not add up to the entry amount',
      });
    }
    checkSplitAgainstAmount(entry.split, entry.amount, ctx);
  });
export type Entry = z.infer<typeof Entry>;
export type EntryKind = Entry['kind'];

/** All members referenced by an entry. */
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

/** Validates an entry against its group: members, base currency, archiving. */
export function validateEntryInGroup(entry: Entry, group: Group, members: readonly Member[]): string[] {
  const errors: string[] = [];
  if (entry.groupId !== group.id) errors.push('Entry belongs to another group');
  if (group.archivedAt !== null) errors.push('Group is archived');
  if (entry.currency === group.baseCurrency && Number(entry.rateToBase) !== 1) {
    errors.push('Rate for the base currency must be 1');
  }
  const known = new Set(members.filter((m) => m.groupId === group.id).map((m) => m.id));
  for (const id of referencedMemberIds(entry)) {
    if (!known.has(id)) errors.push(`Unknown member: ${id}`);
  }
  return errors;
}
