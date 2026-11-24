import type { Entry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import type { LocalDb } from '../offline/local-db';
import type { CachedGroup } from '../offline/local-schema';
import { applyGroupDelta, saveGroupList } from '../offline/local-store';
import { enqueueDelete } from '../offline/offline-changes';
import { nodeLocalDb } from '../offline/testing/node-local-db';
import { searchInbox } from './inbox-search';

const G1 = '00000000-0000-4000-8000-000000000001';
const G2 = '00000000-0000-4000-8000-000000000002';
const ANIA = '00000000-0000-4000-8000-0000000000a1';

const group = (id: string, name: string, overrides: Partial<CachedGroup> = {}): CachedGroup => ({
  id,
  name,
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

let n = 0;
const entry = (groupId: string, title: string, overrides: Partial<Entry> = {}): Entry => {
  n += 1;
  const at = `2026-07-02T10:00:${String(n % 60).padStart(2, '0')}.000Z`;
  return {
    kind: 'expense',
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    groupId,
    version: 1,
    createdBy: ANIA,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    date: '2026-07-02',
    title,
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

/** Caches these groups (as `GET /groups` listed them) and their entries (as delta sync pulled them). */
async function cache(db: LocalDb, groups: [CachedGroup, Entry[]][]): Promise<void> {
  await saveGroupList(db, groups.map(([g]) => ({ ...g, lastEntry: null, lastEntryByOthersAt: null })));
  for (const [g, entries] of groups) {
    await applyGroupDelta(db, { group: { ...g, members: [] }, entries, cursor: null });
  }
}

describe('inbox search', () => {
  it('matches group names, ignoring case', async () => {
    const db = await nodeLocalDb();
    await saveGroupList(db, [
      { ...group(G1, 'Mazury 2026'), lastEntry: null, lastEntryByOthersAt: null },
      { ...group(G2, 'Mieszkanie'), lastEntry: null, lastEntryByOthersAt: null },
    ]);

    const results = await searchInbox(db, 'mazu');

    expect(results.groups.map((g) => g.id)).toEqual([G1]);
  });

  it('matches entry titles across all groups, with the group to open', async () => {
    const db = await nodeLocalDb();
    const pizza = entry(G1, 'Pizza');
    const pizzaAgain = entry(G2, 'Pizza na wynos');
    await cache(db, [
      [group(G1, 'Mazury'), [pizza, entry(G1, 'Paliwo')]],
      [group(G2, 'Mieszkanie'), [pizzaAgain]],
    ]);

    const results = await searchInbox(db, 'PIZZ');

    expect(results.groups).toEqual([]);
    expect(results.entries.map((e) => [e.entryId, e.groupId, e.title])).toEqual(
      expect.arrayContaining([
        [pizza.id, G1, 'Pizza'],
        [pizzaAgain.id, G2, 'Pizza na wynos'],
      ]),
    );
    expect(results.entries).toHaveLength(2);
  });

  it("doesn't match deleted entries, whether deleted on the server or on this device", async () => {
    const db = await nodeLocalDb();
    const live = entry(G1, 'Pizza');
    const deletedOffline = entry(G1, 'Pizza 2');
    await cache(db, [
      [group(G1, 'Mazury'), [live, deletedOffline, entry(G1, 'Pizza 3', { deletedAt: '2026-07-03T10:00:00.000Z' })]],
    ]);
    await enqueueDelete(db, deletedOffline, '2026-07-03T11:00:00.000Z');

    const results = await searchInbox(db, 'pizza');

    expect(results.entries.map((e) => e.entryId)).toEqual([live.id]);
  });

  it("only finds my groups: a group I left (no longer in GET /groups) and its entries don't match", async () => {
    const db = await nodeLocalDb();
    const mine = entry(G1, 'Pizza');
    await cache(db, [
      [group(G1, 'Pizzeria Mazury'), [mine]],
      [group(G2, 'Pizzeria Kraków'), [entry(G2, 'Pizza')]],
    ]);

    await saveGroupList(db, [{ ...group(G1, 'Pizzeria Mazury'), lastEntry: null, lastEntryByOthersAt: null }]);
    const results = await searchInbox(db, 'pizz');

    expect(results.groups.map((g) => g.id)).toEqual([G1]);
    expect(results.entries.map((e) => e.entryId)).toEqual([mine.id]);
  });

  it('finds nothing for a blank query', async () => {
    const db = await nodeLocalDb();
    await cache(db, [[group(G1, 'Mazury'), [entry(G1, 'Pizza')]]]);

    expect(await searchInbox(db, '  ')).toEqual({ groups: [], entries: [] });
  });

  it('ignores Polish diacritics both ways, so a query typed without them still matches', async () => {
    const db = await nodeLocalDb();
    const zabka = entry(G1, 'Żabka');
    await cache(db, [[group(G1, 'Łódź'), [zabka]]]);

    expect((await searchInbox(db, 'lodz')).groups.map((g) => g.id)).toEqual([G1]);
    expect((await searchInbox(db, 'zabka')).entries.map((e) => e.entryId)).toEqual([zabka.id]);
    expect((await searchInbox(db, 'ŻAB')).entries.map((e) => e.entryId)).toEqual([zabka.id]);
  });
});
