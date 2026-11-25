import type { Entry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { localEntries, localGroups, localMembers, localOutbox } from './local-schema';
import { entryRow } from './local-store';
import {
  addLocalMember,
  createLocalGroup,
  deleteLocalGroup,
  type NewLocalGroup,
  readLocalBalances,
  readLocalEntries,
  readLocalGroup,
  readLocalGroupList,
  renameLocalMember,
  updateLocalGroupSettings,
} from './local-group-store';
import { nodeLocalDb } from './testing/node-local-db';

const G1 = '00000000-0000-4000-8000-000000000001';
const G2 = '00000000-0000-4000-8000-000000000002';
const ME = '00000000-0000-4000-8000-0000000000e1';
const ME2 = '00000000-0000-4000-8000-0000000000e2';
const ANIA = '00000000-0000-4000-8000-0000000000a1';
const BARTEK = '00000000-0000-4000-8000-0000000000b1';
const CELINA = '00000000-0000-4000-8000-0000000000c1';
const E1 = '00000000-0000-4000-8000-0000000001e1';
const E2 = '00000000-0000-4000-8000-0000000001e2';

const NOW = new Date('2026-11-25T10:00:00.000Z');

const newGroup = (overrides: Partial<NewLocalGroup> = {}): NewLocalGroup => ({
  id: G1,
  name: 'Pizza',
  emoji: '🍕',
  color: '#E53935',
  baseCurrency: 'EUR',
  deviceMember: { id: ME, displayName: 'Michał' },
  people: [
    { id: ANIA, displayName: 'Ania' },
    { id: BARTEK, displayName: 'Bartek' },
  ],
  ...overrides,
});

const member = (id: string, displayName: string) => ({ id, groupId: G1, displayName, userId: null, attendance: null });

describe('local group store: creating a group', () => {
  it('creates the group with its device member first, then the people typed in', async () => {
    const db = await nodeLocalDb();

    await createLocalGroup(db, newGroup(), NOW);

    expect(await readLocalGroup(db, G1)).toEqual({
      id: G1,
      name: 'Pizza',
      emoji: '🍕',
      color: '#E53935',
      baseCurrency: 'EUR',
      startDate: null,
      endDate: null,
      simplifyDebts: true,
      archivedAt: null,
      ownerMemberId: ME,
      deviceMemberId: ME,
      createdAt: '2026-11-25T10:00:00.000Z',
      lastActivityAt: '2026-11-25T10:00:00.000Z',
      local: true,
      members: [member(ME, 'Michał'), member(ANIA, 'Ania'), member(BARTEK, 'Bartek')],
    });
  });
});

describe('local group store: members', () => {
  it('adds a member at the end of the list', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup({ people: [{ id: ANIA, displayName: 'Ania' }] }), NOW);

    await addLocalMember(db, G1, { id: CELINA, displayName: 'Celina' });

    expect((await readLocalGroup(db, G1))?.members).toEqual([
      member(ME, 'Michał'),
      member(ANIA, 'Ania'),
      member(CELINA, 'Celina'),
    ]);
  });

  it('renames a member', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup({ people: [{ id: ANIA, displayName: 'Anai' }] }), NOW);

    await renameLocalMember(db, G1, ANIA, { displayName: 'Ania' });

    expect((await readLocalGroup(db, G1))?.members).toEqual([member(ME, 'Michał'), member(ANIA, 'Ania')]);
  });

  it('renames the device member only in its own group', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup({ people: [] }), NOW);
    await createLocalGroup(db, newGroup({ id: G2, deviceMember: { id: ME2, displayName: 'Michał' }, people: [] }), NOW);

    await renameLocalMember(db, G1, ME, { displayName: 'Misiek' });

    expect((await readLocalGroup(db, G1))?.members.map((m) => m.displayName)).toEqual(['Misiek']);
    expect((await readLocalGroup(db, G2))?.members.map((m) => m.displayName)).toEqual(['Michał']);
  });
});

describe('local group store: inbox', () => {
  it('lists local groups, most recent activity first, marked as local', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup({ name: 'Starsza' }), new Date('2026-11-01T10:00:00.000Z'));
    await createLocalGroup(
      db,
      newGroup({ id: G2, name: 'Nowsza', deviceMember: { id: ME2, displayName: 'Michał' }, people: [] }),
      new Date('2026-11-20T10:00:00.000Z'),
    );

    const list = await readLocalGroupList(db);

    expect(list.map((g) => [g.name, g.local, g.lastActivityAt, g.lastEntry, g.lastEntryByOthersAt])).toEqual([
      ['Nowsza', true, '2026-11-20T10:00:00.000Z', null, null],
      ['Starsza', true, '2026-11-01T10:00:00.000Z', null, null],
    ]);
  });
});

describe('local group store: device database only', () => {
  it('a new local group has an empty Conversation', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);

    expect(await readLocalEntries(db, G1)).toEqual([]);
  });

  it('never writes to the outbox or a sync cursor', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);
    await addLocalMember(db, G1, { id: CELINA, displayName: 'Celina' });
    await renameLocalMember(db, G1, ME, { displayName: 'Ja' });

    expect(await db.select().from(localOutbox)).toEqual([]);
    expect(await db.select({ cursor: localGroups.cursor, syncedAt: localGroups.syncedAt }).from(localGroups)).toEqual([
      { cursor: null, syncedAt: null },
    ]);
  });

  it('reads no synced group as a local one', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);
    await db.update(localGroups).set({ local: false });

    expect(await readLocalGroup(db, G1)).toBeUndefined();
    expect(await readLocalGroupList(db)).toEqual([]);
  });
});

describe('local group store: settings', () => {
  it('turns debt simplification off, which the balances honor', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);

    await updateLocalGroupSettings(db, G1, { simplifyDebts: false });

    expect((await readLocalGroup(db, G1))?.simplifyDebts).toBe(false);
    expect((await readLocalBalances(db, G1))?.simplifyDebts).toBe(false);
  });
});

describe('local group store: deleting a group', () => {
  const expense = (id: string, groupId: string, payer: string): Entry => ({
    kind: 'expense',
    id,
    groupId,
    version: 1,
    createdBy: payer,
    createdByMember: payer,
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    deletedAt: null,
    date: '2026-11-25',
    title: 'Pizza',
    amount: 3_000,
    currency: 'EUR',
    rateToBase: '1',
    category: 'food',
    receiptPhotoId: null,
    payers: [{ memberId: payer, amount: 3_000 }],
    split: { mode: 'equal', memberIds: [payer] },
  }) as Entry;

  it('removes the group with its members and entries, and leaves other groups alone', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);
    await createLocalGroup(db, newGroup({ id: G2, deviceMember: { id: ME2, displayName: 'Michał' }, people: [] }), NOW);
    // Entries come from the entry slice (#70); written as rows here.
    await db.insert(localEntries).values([
      entryRow(expense(E1, G1, ME)),
      entryRow(expense(E2, G2, ME2)),
    ]);

    await deleteLocalGroup(db, G1);

    expect(await readLocalGroup(db, G1)).toBeUndefined();
    expect(await db.select({ id: localMembers.id }).from(localMembers)).toEqual([{ id: ME2 }]);
    expect(await db.select({ id: localEntries.id }).from(localEntries)).toEqual([{ id: E2 }]);
    expect((await readLocalGroupList(db)).map((g) => g.id)).toEqual([G2]);
  });

  it('never deletes a synced group', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);
    await db.update(localGroups).set({ local: false });

    await deleteLocalGroup(db, G1);

    expect(await db.select({ id: localGroups.id }).from(localGroups)).toEqual([{ id: G1 }]);
    expect(await db.select({ id: localMembers.id }).from(localMembers)).toHaveLength(3);
  });
});

describe('local group store: balances', () => {
  it('a new local group has every member at zero and nothing to settle', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);

    expect(await readLocalBalances(db, G1)).toEqual({
      baseCurrency: 'EUR',
      simplifyDebts: true,
      balances: [
        { memberId: ME, amount: 0 },
        { memberId: ANIA, amount: 0 },
        { memberId: BARTEK, amount: 0 },
      ],
      transfers: [],
    });
  });
});
