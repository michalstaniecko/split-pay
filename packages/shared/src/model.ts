import { z } from 'zod';
import { CurrencyCode, ExchangeRate, MinorAmount, PositiveMinorAmount, isUnitRate } from './money';

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
export function nextDay(date: LocalDate): LocalDate {
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

/**
 * Turns any list of valid ranges (any order, overlapping or touching — e.g.
 * built from the per-day grid) into canonical attendance covering the same
 * days. Call before saving. An empty input stays empty, which the schema
 * rejects: zero days is not an attendance.
 */
export function normalizeAttendance(ranges: readonly AttendanceRange[]): AttendanceRange[] {
  const sorted = [...ranges].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const result: AttendanceRange[] = [];
  for (const range of sorted) {
    const last = result.at(-1);
    if (last && range.from <= nextDay(last.to)) {
      if (range.to > last.to) last.to = range.to;
    } else {
      result.push({ from: range.from, to: range.to });
    }
  }
  return result;
}

/** A member's name as typed by people (adding, renaming, joining). */
export const MemberName = z.string().trim().min(1).max(60);

export const Member = z.object({
  id: Id,
  groupId: Id,
  /**
   * `null` = the name was removed when its user deleted their account
   * (ADR-0019): a marker each viewer shows as "Deleted user" in their own
   * language (`memberName`). Renaming replaces it with text.
   */
  displayName: MemberName.nullable(),
  /** `null` = member without account. */
  userId: Id.nullable(),
  attendance: Attendance.nullable(),
});
export type Member = z.infer<typeof Member>;

/**
 * Adding a member without an account (ADR-0007): a client-generated id and a
 * name. Attendance is optional (`null`/missing = whole trip). There is no
 * `userId` — an account is linked only by claiming.
 */
export const NewMember = Member.pick({ id: true }).extend({
  displayName: MemberName,
  attendance: Attendance.nullable().optional(),
});
export type NewMember = z.infer<typeof NewMember>;

/** Renaming a member. */
export const MemberRename = z.object({ displayName: MemberName });
export type MemberRename = z.infer<typeof MemberRename>;

/**
 * Any member can rename a member without an account (ADR-0008) and their own
 * member; a member with an account can't be renamed by others.
 */
export function canRenameMember(member: Pick<Member, 'userId'>, userId: Id): boolean {
  return member.userId === null || member.userId === userId;
}

const GroupFields = z.object({
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
});

type GroupDates = { startDate: LocalDate | null; endDate: LocalDate | null };

function checkGroupDates(g: GroupDates, ctx: z.RefinementCtx) {
  if ((g.startDate === null) !== (g.endDate === null)) {
    ctx.addIssue({ code: 'custom', path: [g.startDate === null ? 'startDate' : 'endDate'], message: 'Provide both dates or neither' });
  } else if (g.startDate !== null && g.endDate !== null && g.startDate > g.endDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Start date after end date' });
  }
}

export const Group = GroupFields.superRefine(checkGroupDates);
export type Group = z.infer<typeof Group>;

/**
 * What a user sends to create a group (form and API). The id is generated by
 * the client so retries are idempotent (ADR-0005); settings and archiving
 * start at their defaults on the server.
 */
export const NewGroup = GroupFields.pick({
  id: true,
  name: true,
  emoji: true,
  color: true,
  baseCurrency: true,
  startDate: true,
  endDate: true,
}).superRefine(checkGroupDates);
export type NewGroup = z.infer<typeof NewGroup>;

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
  /**
   * The member who added the entry ("added by", ADR-0019): survives account
   * deletion and shows that member's current name. `null` only when unknown
   * (entries whose author's account was gone before this was recorded).
   */
  createdByMember: Id.nullable(),
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

const SettlementFields = z.object({
  kind: z.literal('settlement'),
  ...EntryMeta,
  ...MoneyFields,
  from: Id,
  to: Id,
});

/** Settlement: `from` handed money over to `to`. */
export const Settlement = SettlementFields.refine((s) => s.from !== s.to, 'Settlement to oneself');
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

/** Fields the server owns: the group comes from the URL, the rest from the request and the clock. */
const serverOwned = {
  groupId: true,
  version: true,
  createdBy: true,
  createdByMember: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/**
 * What a client sends to create an entry: an `Entry` without the server-owned
 * fields. The id is generated by the client so a retried create is idempotent
 * (ADR-0005). Only the shape is checked here; `entryFromNew` completes it and
 * runs every `Entry` rule.
 */
export const NewEntry = z.discriminatedUnion('kind', [
  Expense.omit(serverOwned),
  Income.omit(serverOwned),
  SettlementFields.omit(serverOwned),
]);
export type NewEntry = z.infer<typeof NewEntry>;

/**
 * Completes a new entry into version 1 of an `Entry` and validates it with the
 * `Entry` schema (sums, split vs amount, settlement to oneself). Check the
 * result against the group with `validateEntryInGroup`.
 */
export function entryFromNew(
  input: NewEntry,
  meta: { groupId: Id; createdBy: Id; createdByMember: Id | null; now: string },
): z.ZodSafeParseResult<Entry> {
  return Entry.safeParse({
    ...input,
    groupId: meta.groupId,
    version: 1,
    createdBy: meta.createdBy,
    createdByMember: meta.createdByMember,
    createdAt: meta.now,
    updatedAt: meta.now,
    deletedAt: null,
  });
}

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

// ── Quick bill ───────────────────────────────────────────────────────────────

/**
 * Quick bill (GLOSSARY): a group with a single expense, created in one step.
 * The group is named after the title and gets the 🧾 emoji; each person
 * becomes a member without an account; the expense is paid by the caller and
 * split equally among everyone. Ids are client-generated (idempotent retry).
 */
export const NewQuickBill = z
  .object({
    groupId: Id,
    expenseId: Id,
    /** Group name and expense title. */
    title: z.string().trim().min(1).max(80),
    amount: PositiveMinorAmount,
    /** The new group's base currency, also the expense currency. */
    currency: CurrencyCode,
    /** The caller's today. */
    date: LocalDate,
    color: GroupFields.shape.color,
    /** "Z kim": the others, as members without an account. */
    people: z.array(NewMember.pick({ id: true, displayName: true })).min(1).max(50),
  })
  .refine((q) => uniqueIds([q.groupId, q.expenseId, ...q.people.map((p) => p.id)]), 'Duplicate id');
export type NewQuickBill = z.infer<typeof NewQuickBill>;

/** Emoji of every quick bill group. */
export const QUICK_BILL_EMOJI = '🧾';

/** Validates an entry against its group: members, base currency, archiving. */
export function validateEntryInGroup(entry: Entry, group: Group, members: readonly Member[]): string[] {
  const errors: string[] = [];
  if (entry.groupId !== group.id) errors.push('Entry belongs to another group');
  if (group.archivedAt !== null) errors.push('Group is archived');
  if (entry.currency === group.baseCurrency && !isUnitRate(entry.rateToBase)) {
    errors.push('Rate for the base currency must be 1');
  }
  const known = new Set(members.filter((m) => m.groupId === group.id).map((m) => m.id));
  for (const id of referencedMemberIds(entry)) {
    if (!known.has(id)) errors.push(`Unknown member: ${id}`);
  }
  return errors;
}
