import { describe, expect, it } from 'vitest';
import { localGroups, localOutbox } from './local-schema';
import {
  addLocalMember,
  createLocalGroup,
  type NewLocalGroup,
  readLocalEntries,
  readLocalGroup,
  readLocalGroupList,
  renameLocalMember,
} from './local-group-store';
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
