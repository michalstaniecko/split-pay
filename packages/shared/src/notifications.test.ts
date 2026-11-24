import { describe, expect, it } from 'vitest';
import type { Member } from './model';
import {
  canNudge,
  groupPushBursts,
  nextNudgeAt,
  notificationRecipients,
  type PendingPush,
  pushMessageBody,
} from './notifications';
import { ANIA, BARTEK, expense, income, KASIA, members as baseMembers, settlement, TOMEK, uuid, ZOSIA } from './test-fixtures';

// Ania, Bartek and Kasia have accounts; Tomek and Zosia don't.
const ANIA_USER = uuid(301);
const BARTEK_USER = uuid(302);
const KASIA_USER = uuid(303);
const accounts: Record<string, string> = { [ANIA]: ANIA_USER, [BARTEK]: BARTEK_USER, [KASIA]: KASIA_USER };
const members: Member[] = baseMembers.map((m) => ({ ...m, userId: accounts[m.id] ?? null }));

describe('notificationRecipients', () => {
  it('a new expense notifies the members taking part who have an account, not the author', () => {
    const pizza = expense({
      amount: 9000,
      payers: [{ memberId: ANIA, amount: 9000 }],
      split: { mode: 'equal', memberIds: [ANIA, BARTEK, TOMEK] },
    });
    expect(notificationRecipients({ type: 'entryCreated', entry: pizza }, members, ANIA_USER)).toEqual([BARTEK_USER]);
  });

  it('a payer who is not among the participants takes part too', () => {
    const gift = expense({
      amount: 5000,
      payers: [{ memberId: KASIA, amount: 5000 }],
      split: { mode: 'shares', weights: [{ memberId: BARTEK, weight: 1 }] },
    });
    expect(notificationRecipients({ type: 'entryCreated', entry: gift }, members, ANIA_USER)).toEqual([
      KASIA_USER,
      BARTEK_USER,
    ]);
  });

  it('an income notifies its recipients and participants', () => {
    const refund = income({
      amount: 3000,
      recipients: [{ memberId: BARTEK, amount: 3000 }],
      split: { mode: 'equal', memberIds: [BARTEK, KASIA, ZOSIA] },
    });
    expect(notificationRecipients({ type: 'entryDeleted', entry: refund }, members, BARTEK_USER)).toEqual([KASIA_USER]);
  });

  it('a new settlement notifies only the member it is in favour of', () => {
    const payback = settlement({ amount: 3000, from: BARTEK, to: KASIA });
    expect(notificationRecipients({ type: 'entryCreated', entry: payback }, members, ANIA_USER)).toEqual([KASIA_USER]);
    expect(notificationRecipients({ type: 'entryCreated', entry: payback }, members, KASIA_USER)).toEqual([]);
  });

  it('editing notifies members taking part before or after the edit', () => {
    const before = expense({
      amount: 9000,
      payers: [{ memberId: ANIA, amount: 9000 }],
      split: { mode: 'equal', memberIds: [ANIA, BARTEK] },
    });
    const after = { ...before, split: { mode: 'equal' as const, memberIds: [ANIA, KASIA] } };
    expect(notificationRecipients({ type: 'entryEdited', before, after }, members, ANIA_USER)).toEqual([
      BARTEK_USER,
      KASIA_USER,
    ]);
  });

  it('a claim notifies every other member with an account', () => {
    expect(notificationRecipients({ type: 'claim', memberId: TOMEK }, members, KASIA_USER)).toEqual([
      ANIA_USER,
      BARTEK_USER,
    ]);
  });

  it('a nudge notifies the member who owes, only if they have an account', () => {
    expect(notificationRecipients({ type: 'nudge', toMemberId: BARTEK }, members, ANIA_USER)).toEqual([BARTEK_USER]);
    expect(notificationRecipients({ type: 'nudge', toMemberId: TOMEK }, members, ANIA_USER)).toEqual([]);
  });
});

describe('nudge limit (one per member per group per 24 h)', () => {
  it('a member never nudged can be nudged', () => {
    expect(canNudge(null, '2026-07-12T10:00:00.000Z')).toBe(true);
    expect(nextNudgeAt(null)).toBeNull();
  });

  it('is blocked for 24 hours after the last nudge', () => {
    const last = '2026-07-12T10:00:00.000Z';
    expect(canNudge(last, '2026-07-12T10:00:00.000Z')).toBe(false);
    expect(canNudge(last, '2026-07-13T09:59:59.999Z')).toBe(false);
    expect(nextNudgeAt(last)).toBe('2026-07-13T10:00:00.000Z');
  });

  it('is allowed again once 24 hours have passed', () => {
    expect(canNudge('2026-07-12T10:00:00.000Z', '2026-07-13T10:00:00.000Z')).toBe(true);
  });
});

describe('groupPushBursts', () => {
  const GROUP_A = uuid(400);
  const GROUP_B = uuid(401);
  let seq = 0;
  const push = (fields: Partial<PendingPush> & Pick<PendingPush, 'createdAt'>): PendingPush => ({
    id: `p${seq++}`,
    recipientUserId: BARTEK_USER,
    groupId: GROUP_A,
    kind: 'entryCreated',
    actorUserId: KASIA_USER,
    entryKind: 'expense',
    ...fields,
  });
  const options = { quietMs: 60_000, maxWaitMs: 300_000 };
  const ids = (batches: PendingPush[][]) => batches.map((b) => b.map((p) => p.id));

  it('a burst of expenses by one author in one group becomes one notification once it goes quiet', () => {
    const burst = [
      push({ createdAt: '2026-07-12T10:00:00.000Z' }),
      push({ createdAt: '2026-07-12T10:00:20.000Z' }),
      push({ createdAt: '2026-07-12T10:00:40.000Z' }),
    ];
    expect(groupPushBursts(burst, '2026-07-12T10:01:00.000Z', options)).toEqual([]);
    expect(ids(groupPushBursts(burst, '2026-07-12T10:01:40.000Z', options))).toEqual([burst.map((p) => p.id)]);
  });

  it('a burst that never goes quiet is sent after the maximum wait', () => {
    const burst = [0, 50, 100, 150, 200, 250, 300].map((s) =>
      push({ createdAt: new Date(Date.parse('2026-07-12T10:00:00.000Z') + s * 1000).toISOString() }),
    );
    expect(ids(groupPushBursts(burst, '2026-07-12T10:05:00.000Z', options))).toEqual([burst.map((p) => p.id)]);
  });

  it('keeps recipients, groups, authors, kinds of change and kinds of entry apart', () => {
    const at = '2026-07-12T10:00:00.000Z';
    const pending = [
      push({ createdAt: at }),
      push({ createdAt: at, recipientUserId: ANIA_USER }),
      push({ createdAt: at, groupId: GROUP_B }),
      push({ createdAt: at, actorUserId: ANIA_USER }),
      push({ createdAt: at, kind: 'entryEdited' }),
      push({ createdAt: at, entryKind: 'income' }),
      push({ createdAt: at }),
    ];
    const batches = groupPushBursts(pending, '2026-07-12T11:00:00.000Z', options);
    expect(batches.map((b) => b.length).sort()).toEqual([1, 1, 1, 1, 1, 2]);
  });

  it('nudges and claims are never grouped and go out at once', () => {
    const at = '2026-07-12T10:00:00.000Z';
    const pending = [push({ createdAt: at, kind: 'nudge', entryKind: null }), push({ createdAt: at, kind: 'nudge', entryKind: null }), push({ createdAt: at, kind: 'claim', entryKind: null })];
    expect(groupPushBursts(pending, at, options)).toHaveLength(3);
  });

  it('silent sync pushes of one recipient and group collapse regardless of author', () => {
    const pending = [
      push({ createdAt: '2026-07-12T10:00:00.000Z', kind: 'sync', entryKind: null }),
      push({ createdAt: '2026-07-12T10:00:10.000Z', kind: 'sync', entryKind: null, actorUserId: ANIA_USER }),
    ];
    expect(groupPushBursts(pending, '2026-07-12T10:02:00.000Z', options)).toHaveLength(1);
  });
});

describe('pushMessageBody', () => {
  const plain = (s: string) => s.replace(/[  ]/g, ' ');
  const base = { actorName: 'Kasia', entryTitle: 'Pizza', amount: 4550, currency: 'PLN', memberName: null };

  it('one entry names it', () => {
    expect(pushMessageBody({ ...base, kind: 'entryCreated', entryKind: 'expense', count: 1 }, 'pl')).toBe(
      'Kasia: dodano wydatek „Pizza”',
    );
    expect(pushMessageBody({ ...base, kind: 'entryCreated', entryKind: 'expense', count: 1 }, 'en')).toBe(
      'Kasia added the expense “Pizza”',
    );
  });

  it('a burst is counted ("Kasia added 3 expenses") with Polish plural forms', () => {
    const burst = (count: number, locale: string) =>
      pushMessageBody({ ...base, kind: 'entryCreated', entryKind: 'expense', count }, locale);
    expect(burst(3, 'en')).toBe('Kasia added 3 expenses');
    expect(burst(3, 'pl')).toBe('Kasia: dodano 3 wydatki');
    expect(burst(5, 'pl')).toBe('Kasia: dodano 5 wydatków');
    expect(pushMessageBody({ ...base, kind: 'entryDeleted', entryKind: 'income', count: 2 }, 'pl')).toBe(
      'Kasia: usunięto 2 wpływy',
    );
    expect(pushMessageBody({ ...base, kind: 'entryEdited', entryKind: 'settlement', entryTitle: null, count: 1 }, 'pl')).toBe(
      'Kasia: zmieniono spłatę',
    );
  });

  it('a settlement in my favour shows the amount', () => {
    const msg = { ...base, kind: 'entryCreated' as const, entryKind: 'settlement' as const, entryTitle: null, count: 1 };
    expect(plain(pushMessageBody(msg, 'pl'))).toBe('Kasia: spłata dla Ciebie · 45,50 zł');
    expect(plain(pushMessageBody(msg, 'en'))).toBe('Kasia paid you back · PLN 45.50');
  });

  it('a nudge and a claim', () => {
    const nudge = { ...base, kind: 'nudge' as const, entryKind: null, entryTitle: null, count: 1 };
    expect(plain(pushMessageBody(nudge, 'pl'))).toBe('Kasia przypomina o zwrocie 45,50 zł');
    expect(plain(pushMessageBody(nudge, 'en'))).toBe('Kasia reminds you to pay back PLN 45.50');
    const claim = { ...base, kind: 'claim' as const, entryKind: null, entryTitle: null, memberName: 'Tomek', count: 1 };
    expect(pushMessageBody(claim, 'pl')).toBe('Przejęcie profilu Tomek: Kasia');
    expect(pushMessageBody({ ...claim, memberName: null }, 'pl')).toBe('Przejęcie profilu: Kasia');
    expect(pushMessageBody(claim, 'en')).toBe('Kasia claimed the Tomek profile');
  });

  it('names an author whose name was removed (null) "Deleted user" in the recipient’s language (ADR-0019)', () => {
    const msg = { ...base, actorName: null, kind: 'entryCreated' as const, entryKind: 'expense' as const, count: 2 };
    expect(pushMessageBody(msg, 'pl')).toBe('Usunięty użytkownik: dodano 2 wydatki');
    expect(pushMessageBody(msg, 'en')).toBe('Deleted user added 2 expenses');
  });

  it('falls back to English for other languages', () => {
    expect(pushMessageBody({ ...base, kind: 'entryCreated', entryKind: 'expense', count: 2 }, 'de')).toBe(
      'Kasia added 2 expenses',
    );
  });
});
