import type { Entry, Member } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import type { CachedGroup, EntryPreview } from './local-schema';
import {
  applyGroupChanges,
  enqueueCreate,
  readEntries,
  readGroupDetail,
  readGroupList,
  saveGroupList,
} from './local-store';
import { nodeLocalDb } from './testing/node-local-db';

const G1 = '00000000-0000-4000-8000-000000000001';
const G2 = '00000000-0000-4000-8000-000000000002';
const ANIA = '00000000-0000-4000-8000-0000000000a1';
const BARTEK = '00000000-0000-4000-8000-0000000000b1';
const USER = '00000000-0000-4000-8000-0000000000f1';

const group = (id: string, overrides: Partial<CachedGroup> = {}): CachedGroup => ({
  id,
  name: `Grupa ${id.slice(-1)}`,
  emoji: '⛵',
  color: '#1E88E5',
  baseCurrency: 'PLN',
  startDate: null,
  endDate: null,
  simplifyDebts: true,
  archivedAt: null,
  ownerMemberId: ANIA,
  createdAt: '2026-07-01T10:00:00.000Z',
  lastActivityAt: '2026-07-01T10:00:00.000Z',
  ...overrides,
});

const member = (id: string, groupId: string, displayName: string): Member => ({
  id,
  groupId,
  displayName,
  userId: null,
  attendance: null,
});

let n = 0;
const entry = (groupId: string, overrides: Partial<Entry> = {}): Entry => {
  n += 1;
  return {
    kind: 'expense',
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    groupId,
    version: 1,
    createdBy: USER,
    createdAt: `2026-07-02T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
    updatedAt: `2026-07-02T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
    deletedAt: null,
    date: '2026-07-02',
    title: `Wpis ${n}`,
    amount: 1_000,
    currency: 'PLN',
    rateToBase: '1',
    category: 'food',
    receiptPhotoId: null,
    payers: [{ memberId: ANIA, amount: 1_000 }],
    split: { mode: 'equal', memberIds: [ANIA] },
    ...overrides,
  } as Entry;
};

const preview = (e: Entry): EntryPreview => ({
  id: e.id,
  kind: e.kind,
  title: e.kind === 'settlement' ? null : e.title,
  amount: e.amount,
  currency: e.currency,
  createdAt: e.createdAt,
});

describe('local store: inbox', () => {
  it('caches the group list and reads it back, most recent activity first', async () => {
    const db = await nodeLocalDb();
    const older = { ...group(G1, { lastActivityAt: '2026-07-01T10:00:00.000Z' }), lastEntry: null };
    const newer = { ...group(G2, { lastActivityAt: '2026-07-03T10:00:00.000Z' }), lastEntry: null };

    await saveGroupList(db, [older, newer]);

    expect(await readGroupList(db)).toEqual([newer, older]);
  });

  it('drops groups the server no longer lists, with their members and entries', async () => {
    const db = await nodeLocalDb();
    await saveGroupList(db, [
      { ...group(G1), lastEntry: null },
      { ...group(G2), lastEntry: null },
    ]);
    await applyGroupChanges(db, {
      group: { ...group(G1), members: [member(ANIA, G1, 'Ania')] },
      entries: [entry(G1)],
      cursor: '2026-07-02T10:00:00.000Z',
    });

    await saveGroupList(db, [{ ...group(G2), lastEntry: null }]);

    expect((await readGroupList(db)).map((g) => g.id)).toEqual([G2]);
    expect(await readGroupDetail(db, G1)).toBeUndefined();
    expect(await readEntries(db, G1)).toEqual([]);
  });

  it("previews the server's last entry until the group's entries are cached, then the local newest", async () => {
    const db = await nodeLocalDb();
    const serverLast = entry(G1, { title: 'Z serwera' });
    await saveGroupList(db, [{ ...group(G1), lastEntry: preview(serverLast) }]);
    expect((await readGroupList(db))[0]?.lastEntry).toEqual(preview(serverLast));

    const deleted = { ...serverLast, deletedAt: '2026-07-03T10:00:00.000Z' };
    const live = entry(G1, { createdAt: '2026-07-01T09:00:00.000Z', title: 'Starszy' });
    await applyGroupChanges(db, {
      group: { ...group(G1), members: [member(ANIA, G1, 'Ania')] },
      entries: [deleted, live],
      cursor: '2026-07-03T10:00:00.000Z',
    });

    expect((await readGroupList(db))[0]?.lastEntry).toEqual(preview(live));
  });

  it('an entry waiting in the outbox moves its group up and becomes the preview', async () => {
    const db = await nodeLocalDb();
    await saveGroupList(db, [
      { ...group(G1, { lastActivityAt: '2026-07-01T10:00:00.000Z' }), lastEntry: null },
      { ...group(G2, { lastActivityAt: '2026-07-03T10:00:00.000Z' }), lastEntry: null },
    ]);
    const queued = entry(G1, { createdAt: '2026-07-04T08:00:00.000Z', updatedAt: '2026-07-04T08:00:00.000Z' });

    await enqueueCreate(db, queued);

    const [first] = await readGroupList(db);
    expect(first?.id).toBe(G1);
    expect(first?.lastActivityAt).toBe('2026-07-04T08:00:00.000Z');
    expect(first?.lastEntry).toEqual(preview(queued));
  });
});

describe('local store: group and entries', () => {
  it('delta sync stores the group with its members in server order', async () => {
    const db = await nodeLocalDb();
    const members = [member(BARTEK, G1, 'Bartek'), member(ANIA, G1, 'Ania')];
    await applyGroupChanges(db, { group: { ...group(G1), members }, entries: [], cursor: null });

    expect(await readGroupDetail(db, G1)).toEqual({ ...group(G1), members });
  });

  it('replaces the member list on every sync (removed members disappear)', async () => {
    const db = await nodeLocalDb();
    await applyGroupChanges(db, {
      group: { ...group(G1), members: [member(ANIA, G1, 'Ania'), member(BARTEK, G1, 'Bartek')] },
      entries: [],
      cursor: null,
    });
    await applyGroupChanges(db, {
      group: { ...group(G1), members: [member(ANIA, G1, 'Ania K.')] },
      entries: [],
      cursor: null,
    });

    expect((await readGroupDetail(db, G1))?.members).toEqual([member(ANIA, G1, 'Ania K.')]);
  });

  it('lists live entries in Conversation order: date, then creation time', async () => {
    const db = await nodeLocalDb();
    const late = entry(G1, { date: '2026-07-05', createdAt: '2026-07-01T08:00:00.000Z' });
    const earlySecond = entry(G1, { date: '2026-07-02', createdAt: '2026-07-02T12:00:00.000Z' });
    const earlyFirst = entry(G1, { date: '2026-07-02', createdAt: '2026-07-02T09:00:00.000Z' });
    const otherGroup = entry(G2);
    await applyGroupChanges(db, {
      group: { ...group(G1), members: [] },
      entries: [late, earlySecond, earlyFirst],
      cursor: null,
    });
    await applyGroupChanges(db, { group: { ...group(G2), members: [] }, entries: [otherGroup], cursor: null });

    expect(await readEntries(db, G1)).toEqual([earlyFirst, earlySecond, late]);
  });

  it('applies later deltas: changed entries replaced, soft-deleted ones leave the list', async () => {
    const db = await nodeLocalDb();
    const pizza = entry(G1, { title: 'Pizza' });
    const beer = entry(G1, { title: 'Piwo' });
    await applyGroupChanges(db, { group: { ...group(G1), members: [] }, entries: [pizza, beer], cursor: 'c1' });

    const editedPizza = { ...pizza, title: 'Pizza i cola', version: 2, updatedAt: '2026-07-03T10:00:00.000Z' };
    const deletedBeer = { ...beer, deletedAt: '2026-07-03T10:00:00.000Z', updatedAt: '2026-07-03T10:00:00.000Z' };
    await applyGroupChanges(db, { group: { ...group(G1), members: [] }, entries: [editedPizza, deletedBeer], cursor: 'c2' });

    expect(await readEntries(db, G1)).toEqual([editedPizza]);
  });

  it('a queued entry is listed right away and is not overwritten by a delta while it waits', async () => {
    const db = await nodeLocalDb();
    await applyGroupChanges(db, { group: { ...group(G1), members: [] }, entries: [], cursor: null });
    const queued = entry(G1, { title: 'Moje' });
    await enqueueCreate(db, queued);
    expect(await readEntries(db, G1)).toEqual([queued]);

    await applyGroupChanges(db, {
      group: { ...group(G1), members: [] },
      entries: [{ ...queued, title: 'Ktoś inny?' } as Entry],
      cursor: null,
    });
    expect(await readEntries(db, G1)).toEqual([queued]);
  });
});
