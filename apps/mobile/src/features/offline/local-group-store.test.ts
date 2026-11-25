import type { NewEntry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { localGroups, localOutbox } from './local-schema';
import {
  addLocalEntry,
  addLocalMember,
  createLocalGroup,
  deleteLocalEntry,
  editLocalEntry,
  type NewLocalGroup,
  readLocalBalances,
  readLocalEntries,
  readLocalGroup,
  readInbox,
  readLocalGroupList,
  renameLocalMember,
  restoreLocalEntry,
} from './local-group-store';
import { saveGroupList } from './local-store';
import { nodeLocalDb } from './testing/node-local-db';

const G1 = '00000000-0000-4000-8000-000000000001';
const G2 = '00000000-0000-4000-8000-000000000002';
const ME = '00000000-0000-4000-8000-0000000000e1';
const ME2 = '00000000-0000-4000-8000-0000000000e2';
const ANIA = '00000000-0000-4000-8000-0000000000a1';
const BARTEK = '00000000-0000-4000-8000-0000000000b1';
const CELINA = '00000000-0000-4000-8000-0000000000c1';

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

const synced = (id: string, name: string, lastActivityAt: string) => ({
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
  createdAt: '2026-10-01T10:00:00.000Z',
  lastActivityAt,
  lastEntry: null,
  lastEntryByOthersAt: null,
});

describe('local group store: the signed-in inbox', () => {
  const S1 = '00000000-0000-4000-8000-000000000011';
  const S2 = '00000000-0000-4000-8000-000000000012';

  it("merges local groups with the account's groups by last activity, local ones marked", async () => {
    const device = await nodeLocalDb();
    const user = await nodeLocalDb();
    await createLocalGroup(device, newGroup({ name: 'Pizza' }), new Date('2026-11-10T10:00:00.000Z'));
    await saveGroupList(user, [
      synced(S1, 'Mazury', '2026-11-20T10:00:00.000Z'),
      synced(S2, 'Mieszkanie', '2026-11-01T10:00:00.000Z'),
    ]);

    const inbox = await readInbox({ user, device });

    expect(inbox.map((g) => [g.name, g.local])).toEqual([
      ['Mazury', false],
      ['Pizza', true],
      ['Mieszkanie', false],
    ]);
  });

  it('signed out, lists only the local groups', async () => {
    const device = await nodeLocalDb();
    await createLocalGroup(device, newGroup({ name: 'Pizza' }), NOW);

    expect((await readInbox({ user: null, device })).map((g) => [g.name, g.local])).toEqual([['Pizza', true]]);
  });

  it('without a device database (web), lists only the account\'s groups', async () => {
    const user = await nodeLocalDb();
    await saveGroupList(user, [synced(S1, 'Mazury', '2026-11-20T10:00:00.000Z')]);

    expect((await readInbox({ user, device: null })).map((g) => [g.name, g.local])).toEqual([['Mazury', false]]);
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
    const added = await addLocalEntry(db, G1, pizza(), NOW);
    const edited = await editLocalEntry(db, added, pizza({ title: 'Pizza na mieście' }), NOW);
    await restoreLocalEntry(db, await deleteLocalEntry(db, edited, NOW), NOW);

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

const E1 = '00000000-0000-4000-8000-0000000000f1';
const E2 = '00000000-0000-4000-8000-0000000000f2';

/** Pizza for 3000 paid by me, split equally among the three of us. */
const pizza = (overrides: Partial<NewEntry> = {}): NewEntry =>
  ({
    id: E1,
    kind: 'expense',
    date: '2026-11-25',
    currency: 'EUR',
    rateToBase: '1',
    title: 'Pizza',
    category: 'food',
    receiptPhotoId: null,
    amount: 3000,
    payers: [{ memberId: ME, amount: 3000 }],
    split: { mode: 'equal', memberIds: [ME, ANIA, BARTEK] },
    ...overrides,
  }) as NewEntry;

describe('local group store: entries', () => {
  it('adds an expense, added by the device member, and reads it back', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);

    await addLocalEntry(db, G1, pizza(), new Date('2026-11-25T12:00:00.000Z'));

    expect(await readLocalEntries(db, G1)).toEqual([
      {
        ...pizza(),
        groupId: G1,
        version: 1,
        createdBy: ME,
        createdByMember: ME,
        createdAt: '2026-11-25T12:00:00.000Z',
        updatedAt: '2026-11-25T12:00:00.000Z',
        deletedAt: null,
      },
    ]);
  });

  it('refuses an entry for someone outside the group, storing nothing', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);

    await expect(
      addLocalEntry(db, G1, pizza({ split: { mode: 'equal', memberIds: [ME, CELINA] } } as Partial<NewEntry>), NOW),
    ).rejects.toThrow(`Unknown member: ${CELINA}`);
    expect(await readLocalEntries(db, G1)).toEqual([]);
  });

  it('edits an entry: the whole content is replaced, author and creation time stay', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);
    const added = await addLocalEntry(db, G1, pizza(), NOW);

    const exact = pizza({
      title: 'Pizza i napoje',
      amount: 3600,
      payers: [
        { memberId: ME, amount: 2000 },
        { memberId: ANIA, amount: 1600 },
      ],
      split: {
        mode: 'exact',
        amounts: [
          { memberId: ME, amount: 1000 },
          { memberId: BARTEK, amount: 2600 },
        ],
      },
    } as Partial<NewEntry>);
    await editLocalEntry(db, added, exact, new Date('2026-11-25T13:00:00.000Z'));

    expect(await readLocalEntries(db, G1)).toEqual([
      {
        ...exact,
        groupId: G1,
        version: 2,
        createdBy: ME,
        createdByMember: ME,
        createdAt: '2026-11-25T10:00:00.000Z',
        updatedAt: '2026-11-25T13:00:00.000Z',
        deletedAt: null,
      },
    ]);
  });

  it('deletes an entry: it leaves the Conversation', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);
    const added = await addLocalEntry(db, G1, pizza(), NOW);
    await addLocalEntry(db, G1, pizza({ id: E2, title: 'Napoje' }), NOW);

    await deleteLocalEntry(db, added, NOW);

    expect((await readLocalEntries(db, G1)).map((e) => e.id)).toEqual([E2]);
  });

  it('"Cofnij" brings a deleted entry back as it was', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);
    const added = await addLocalEntry(db, G1, pizza(), NOW);
    const deleted = await deleteLocalEntry(db, added, NOW);

    await restoreLocalEntry(db, deleted, NOW);

    expect(await readLocalEntries(db, G1)).toEqual([added]);
  });
});

describe('local group store: inbox after entries', () => {
  const inboxRow = async (db: Awaited<ReturnType<typeof nodeLocalDb>>) => {
    const [row] = await readLocalGroupList(db);
    return { lastActivityAt: row?.lastActivityAt, lastEntry: row?.lastEntry, lastEntryByOthersAt: row?.lastEntryByOthersAt };
  };

  it('a new entry becomes the preview and moves the group up, never marking it unread', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);

    await addLocalEntry(db, G1, pizza(), new Date('2026-11-25T12:00:00.000Z'));

    expect(await inboxRow(db)).toEqual({
      lastActivityAt: '2026-11-25T12:00:00.000Z',
      lastEntry: {
        id: E1,
        kind: 'expense',
        title: 'Pizza',
        amount: 3000,
        currency: 'EUR',
        createdAt: '2026-11-25T12:00:00.000Z',
      },
      lastEntryByOthersAt: null,
    });
  });

  it('deleting the newest entry brings back the previous preview; "Cofnij" restores it', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);
    await addLocalEntry(db, G1, pizza(), new Date('2026-11-25T11:00:00.000Z'));
    const drinks = await addLocalEntry(db, G1, pizza({ id: E2, title: 'Napoje' }), new Date('2026-11-25T12:00:00.000Z'));

    const deleted = await deleteLocalEntry(db, drinks, new Date('2026-11-25T13:00:00.000Z'));
    expect((await inboxRow(db)).lastEntry?.title).toBe('Pizza');

    await restoreLocalEntry(db, deleted, new Date('2026-11-25T14:00:00.000Z'));
    expect((await inboxRow(db)).lastEntry?.title).toBe('Napoje');
    expect((await inboxRow(db)).lastActivityAt).toBe('2026-11-25T12:00:00.000Z');
  });
});

describe('local group store: entries in the balances', () => {
  const E3 = '00000000-0000-4000-8000-0000000000f3';

  it('counts every split mode, multiple payers and incomes', async () => {
    const db = await nodeLocalDb();
    await createLocalGroup(db, newGroup(), NOW);

    // Shares 1:2, paid by me: I consume 1000, Ania 2000.
    await addLocalEntry(
      db,
      G1,
      pizza({
        split: {
          mode: 'shares',
          weights: [
            { memberId: ME, weight: 1 },
            { memberId: ANIA, weight: 2 },
          ],
        },
      } as Partial<NewEntry>),
      NOW,
    );
    // Income 1200 received by Ania, split equally: 400 each.
    await addLocalEntry(
      db,
      G1,
      {
        id: E2,
        kind: 'income',
        date: '2026-11-25',
        currency: 'EUR',
        rateToBase: '1',
        title: 'Zwrot kaucji',
        category: 'other',
        receiptPhotoId: null,
        amount: 1200,
        recipients: [{ memberId: ANIA, amount: 1200 }],
        split: { mode: 'equal', memberIds: [ME, ANIA, BARTEK] },
      },
      NOW,
    );
    // Common 1500 for me and Bartek + Bartek's own 500; paid by Bartek 1000 and me 1000.
    await addLocalEntry(
      db,
      G1,
      pizza({
        id: E3,
        amount: 2000,
        payers: [
          { memberId: BARTEK, amount: 1000 },
          { memberId: ME, amount: 1000 },
        ],
        split: { mode: 'commonPlusPersonal', commonMemberIds: [ME, BARTEK], personal: [{ memberId: BARTEK, amount: 500 }] },
      } as Partial<NewEntry>),
      NOW,
    );

    expect((await readLocalBalances(db, G1))?.balances).toEqual([
      { memberId: ME, amount: 2000 + 400 + 250 },
      { memberId: ANIA, amount: -2000 - 800 },
      { memberId: BARTEK, amount: 400 - 250 },
    ]);
  });
});
