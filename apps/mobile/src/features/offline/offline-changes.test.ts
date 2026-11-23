import { type Entry, toNewEntry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { applyGroupDelta, enqueueCreate, readEntries } from './local-store';
import {
  enqueueDelete,
  enqueueEdit,
  enqueueRestore,
  keepMine,
  keepTheirs,
  OutboxBlockedError,
  readConflict,
} from './offline-changes';
import { flushOutbox, markConflict, type OutboxOp, readOutboxState, type SendOutcome } from './outbox';
import { nodeLocalDb } from './testing/node-local-db';

const G1 = '00000000-0000-4000-8000-000000000001';
const ANIA = '00000000-0000-4000-8000-0000000000a1';
const NOW = '2026-07-03T12:00:00.000Z';

let n = 0;
const entry = (overrides: Partial<Entry> = {}): Entry => {
  n += 1;
  const at = `2026-07-02T10:00:${String(n % 60).padStart(2, '0')}.000Z`;
  return {
    kind: 'expense',
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    groupId: G1,
    version: 1,
    createdBy: ANIA,
    createdAt: at,
    updatedAt: at,
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

/** The entered fields of `e` with another title — what the edit form sends. */
const retitled = (e: Entry, title: string) => ({ ...toNewEntry(e), title }) as ReturnType<typeof toNewEntry>;

/** A local database with group G1 cached, holding `entries` as synced from the server. */
async function setup(entries: Entry[] = []) {
  const db = await nodeLocalDb();
  await applyGroupDelta(db, {
    group: {
      id: G1,
      name: 'Mazury',
      emoji: '⛵',
      color: '#1E88E5',
      baseCurrency: 'PLN',
      startDate: null,
      endDate: null,
      simplifyDebts: true,
      archivedAt: null,
      ownerMemberId: ANIA,
      createdAt: '2026-07-01T00:00:00.000Z',
      lastActivityAt: '2026-07-01T00:00:00.000Z',
      members: [],
    },
    entries,
    cursor: null,
  });
  return db;
}

/**
 * A fake server holding `entries`: applies edits/deletes/restores with the
 * API's version rules (edit bumps the version, a stale base is a conflict)
 * and records what was sent.
 */
function server(entries: Entry[]) {
  const stored = new Map(entries.map((e) => [e.id, e]));
  const sent: Pick<OutboxOp, 'change' | 'baseVersion' | 'payload'>[] = [];
  const send = async (op: OutboxOp): Promise<SendOutcome> => {
    sent.push({ change: op.change, baseVersion: op.baseVersion, payload: op.payload });
    const current = stored.get(op.entryId);
    if (op.change === 'create') {
      const created = { ...op.payload, groupId: G1, version: 1, createdBy: ANIA, createdAt: NOW, updatedAt: NOW, deletedAt: null } as Entry;
      stored.set(created.id, created);
      return { type: 'sent', entry: created };
    }
    if (!current) return { type: 'failed', error: 'not_found' };
    if (op.change === 'delete' && current.deletedAt !== null) return { type: 'sent', entry: current };
    if (op.change === 'restore' && current.deletedAt === null) return { type: 'sent', entry: current };
    if (op.baseVersion !== current.version || (op.change === 'edit' && current.deletedAt !== null)) {
      return { type: 'conflict', current };
    }
    const next: Entry =
      op.change === 'edit'
        ? ({ ...current, ...op.payload, version: current.version + 1, updatedAt: NOW } as Entry)
        : { ...current, deletedAt: op.change === 'delete' ? NOW : null, updatedAt: NOW };
    stored.set(next.id, next);
    return { type: 'sent', entry: next };
  };
  return { send, sent, stored };
}

describe('offline edit of my entry', () => {
  it('shows the edit at once (🕓) and sends it based on the version I saw', async () => {
    const mine = entry({ version: 2 });
    const db = await setup([mine]);

    await enqueueEdit(db, mine, retitled(mine, 'Pizza'), NOW);

    expect((await readEntries(db, G1)).map((e) => e.title)).toEqual(['Pizza']);
    expect((await readOutboxState(db, G1)).get(mine.id)).toMatchObject({ change: 'edit', status: 'queued' });

    const api = server([mine]);
    await flushOutbox(db, api.send);
    expect(api.sent).toEqual([{ change: 'edit', baseVersion: 2, payload: retitled(mine, 'Pizza') }]);
    expect(await readEntries(db, G1)).toEqual([api.stored.get(mine.id)]);
    expect((await readOutboxState(db, G1)).size).toBe(0);
  });

  it('editing an entry whose create is still queued just rewrites what will be created', async () => {
    const db = await setup();
    const added = entry();
    await enqueueCreate(db, added);

    await enqueueEdit(db, added, retitled(added, 'Pizza'), NOW);

    const api = server([]);
    await flushOutbox(db, api.send);
    expect(api.sent).toEqual([{ change: 'create', baseVersion: null, payload: retitled(added, 'Pizza') }]);
  });

  it('two edits before sending go as one, based on the version I first saw', async () => {
    const mine = entry();
    const db = await setup([mine]);
    const first = await enqueueEdit(db, mine, retitled(mine, 'Pizza'), NOW);
    await enqueueEdit(db, first, retitled(mine, 'Pizza i cola'), NOW);

    const api = server([mine]);
    await flushOutbox(db, api.send);
    expect(api.sent).toEqual([{ change: 'edit', baseVersion: 1, payload: retitled(mine, 'Pizza i cola') }]);
    expect(api.stored.get(mine.id)?.version).toBe(2);
  });

  it('an entry with a refused change (red "!") cannot be changed again until resolved', async () => {
    const mine = entry();
    const db = await setup([mine]);
    await enqueueEdit(db, mine, retitled(mine, 'Pizza'), NOW);
    await flushOutbox(db, server([{ ...mine, version: 2 }]).send);

    await expect(enqueueEdit(db, mine, retitled(mine, 'Cola'), NOW)).rejects.toBeInstanceOf(OutboxBlockedError);
    await expect(enqueueDelete(db, mine, NOW)).rejects.toBeInstanceOf(OutboxBlockedError);
  });

  it('an edit accepted while a later change still waits keeps my local copy', async () => {
    const mine = entry();
    const db = await setup([mine]);
    const edited = await enqueueEdit(db, mine, retitled(mine, 'Pizza'), NOW);
    await enqueueDelete(db, edited, NOW);

    const api = server([mine]);
    // The edit goes, then the connection drops before the delete.
    let calls = 0;
    await flushOutbox(db, async (op) => (++calls === 1 ? api.send(op) : { type: 'retry_later' }));

    expect(await readEntries(db, G1)).toEqual([]);
    await flushOutbox(db, api.send);
    expect(api.sent.map((s) => [s.change, s.baseVersion])).toEqual([
      ['edit', 1],
      ['delete', 2],
    ]);
    expect(api.stored.get(mine.id)?.deletedAt).toBe(NOW);
  });

  it('an edit made while its create was being sent is sent afterwards as an edit', async () => {
    const db = await setup();
    const added = entry();
    await enqueueCreate(db, added);
    const api = server([]);

    await flushOutbox(db, async (op) => {
      const outcome = await api.send(op);
      if (op.change === 'create') await enqueueEdit(db, added, retitled(added, 'Pizza'), NOW);
      return outcome;
    });
    expect((await readOutboxState(db, G1)).get(added.id)).toMatchObject({ change: 'edit', status: 'queued' });
    expect((await readEntries(db, G1)).map((e) => e.title)).toEqual(['Pizza']);

    await flushOutbox(db, api.send);
    expect(api.sent.at(-1)).toEqual({ change: 'edit', baseVersion: 1, payload: retitled(added, 'Pizza') });
    expect(api.stored.get(added.id)?.title).toBe('Pizza');
  });
});

describe('offline delete of my entry', () => {
  it('leaves the list at once and is sent based on the version I saw', async () => {
    const mine = entry({ version: 3 });
    const db = await setup([mine]);

    const deleted = await enqueueDelete(db, mine, NOW);

    expect(deleted).toEqual({ ...mine, deletedAt: NOW, updatedAt: NOW });
    expect(await readEntries(db, G1)).toEqual([]);
    const api = server([mine]);
    await flushOutbox(db, api.send);
    expect(api.sent).toEqual([{ change: 'delete', baseVersion: 3, payload: null }]);
  });

  it('deleting an entry that never reached the server just forgets it', async () => {
    const db = await setup();
    const added = entry();
    await enqueueCreate(db, added);

    await enqueueDelete(db, added, NOW);

    expect(await readEntries(db, G1)).toEqual([]);
    expect((await readOutboxState(db, G1)).size).toBe(0);
  });

  it('"Cofnij" before sending cancels the delete; nothing is sent', async () => {
    const mine = entry();
    const db = await setup([mine]);
    const deleted = await enqueueDelete(db, mine, NOW);

    await enqueueRestore(db, deleted, NOW);

    expect(await readEntries(db, G1)).toEqual([{ ...mine, updatedAt: NOW }]);
    const api = server([mine]);
    await flushOutbox(db, api.send);
    expect(api.sent).toEqual([]);
  });

  it('"Cofnij" of a never-sent entry adds it back to the queue', async () => {
    const db = await setup();
    const added = entry();
    await enqueueCreate(db, added);
    const deleted = await enqueueDelete(db, added, NOW);

    await enqueueRestore(db, deleted, NOW);

    expect((await readEntries(db, G1)).map((e) => e.id)).toEqual([added.id]);
    const api = server([]);
    await flushOutbox(db, api.send);
    expect(api.sent).toEqual([{ change: 'create', baseVersion: null, payload: toNewEntry(added) }]);
  });

  it('"Cofnij" of a delete the server already has is sent as a restore', async () => {
    const mine = entry({ version: 2, deletedAt: NOW });
    const db = await setup([mine]);

    await enqueueRestore(db, mine, NOW);

    expect((await readEntries(db, G1)).map((e) => e.id)).toEqual([mine.id]);
    const api = server([mine]);
    await flushOutbox(db, api.send);
    expect(api.sent).toEqual([{ change: 'restore', baseVersion: 2, payload: null }]);
  });
});

describe('resolving a version conflict', () => {
  type Db = Awaited<ReturnType<typeof setup>>;
  /** My entry edited offline (then `then`), while someone else changed it to `theirs` on the server. */
  async function conflicted(theirs: (mine: Entry) => Entry, then?: (db: Db, edited: Entry) => Promise<unknown>) {
    const mine = entry({ version: 2 });
    const db = await setup([mine]);
    const edited = await enqueueEdit(db, mine, retitled(mine, 'Moja wersja'), NOW);
    if (then) await then(db, edited);
    const api = server([theirs(mine)]);
    await flushOutbox(db, api.send);
    return { db, api, mine };
  }

  it('the conflict sheet gets both versions: my change and the current one', async () => {
    const { db, mine } = await conflicted((m) => ({ ...m, version: 3, title: 'Ich wersja' }));

    expect(await readConflict(db, mine.id)).toEqual({
      change: 'edit',
      mine: retitled(mine, 'Moja wersja'),
      current: { ...mine, version: 3, title: 'Ich wersja' },
    });
    expect(await readConflict(db, entry().id)).toBeNull();
  });

  it('"keep mine" resubmits my edit against the current version', async () => {
    const { db, api, mine } = await conflicted((m) => ({ ...m, version: 3, title: 'Ich wersja' }));

    await keepMine(db, mine.id);
    expect((await readOutboxState(db, G1)).get(mine.id)).toMatchObject({ change: 'edit', status: 'queued' });
    await flushOutbox(db, api.send);

    expect(api.sent.at(-1)).toEqual({ change: 'edit', baseVersion: 3, payload: retitled(mine, 'Moja wersja') });
    expect(api.stored.get(mine.id)).toMatchObject({ version: 4, title: 'Moja wersja' });
    expect(await readEntries(db, G1)).toEqual([api.stored.get(mine.id)]);
    expect((await readOutboxState(db, G1)).size).toBe(0);
  });

  it('"keep mine" of an edit the other person deleted brings the entry back with my content', async () => {
    const { db, api, mine } = await conflicted((m) => ({ ...m, deletedAt: NOW }));

    await keepMine(db, mine.id);
    await flushOutbox(db, api.send);

    expect(api.sent.slice(-2).map((s) => [s.change, s.baseVersion])).toEqual([
      ['restore', 2],
      ['edit', 2],
    ]);
    expect(api.stored.get(mine.id)).toMatchObject({ deletedAt: null, title: 'Moja wersja', version: 3 });
  });

  it('"keep mine" also resends my later changes of the entry, rebased', async () => {
    const { db, api, mine } = await conflicted(
      (m) => ({ ...m, version: 5 }),
      (db, edited) => enqueueDelete(db, edited, NOW),
    );

    await keepMine(db, mine.id);
    await flushOutbox(db, api.send);

    expect(api.sent.slice(-2).map((s) => [s.change, s.baseVersion])).toEqual([
      ['edit', 5],
      ['delete', 6],
    ]);
    expect(api.stored.get(mine.id)?.deletedAt).toBe(NOW);
  });

  it('"keep mine" of a delete deletes the current version', async () => {
    const mine = entry();
    const db = await setup([mine]);
    await enqueueDelete(db, mine, NOW);
    const api = server([{ ...mine, version: 2, title: 'Ich wersja' }]);
    await flushOutbox(db, api.send);

    await keepMine(db, mine.id);
    await flushOutbox(db, api.send);

    expect(api.sent.at(-1)).toEqual({ change: 'delete', baseVersion: 2, payload: null });
    expect(await readEntries(db, G1)).toEqual([]);
  });

  it('"keep mine" of an online change recorded as a conflict (#11) sends it again', async () => {
    const mine = entry();
    const db = await setup([mine]);
    const theirs = { ...mine, version: 2, title: 'Ich wersja' };
    await markConflict(db, { groupId: G1, entryId: mine.id, change: 'edit', baseVersion: 1, payload: retitled(mine, 'Moja wersja'), current: theirs });

    await keepMine(db, mine.id);
    const api = server([theirs]);
    await flushOutbox(db, api.send);

    expect(api.sent).toEqual([{ change: 'edit', baseVersion: 2, payload: retitled(mine, 'Moja wersja') }]);
    expect((await readEntries(db, G1)).map((e) => e.title)).toEqual(['Moja wersja']);
  });

  it('"keep theirs" drops my changes and shows the current version', async () => {
    const { db, api, mine } = await conflicted(
      (m) => ({ ...m, version: 3, title: 'Ich wersja' }),
      (db, edited) => enqueueDelete(db, edited, NOW),
    );

    await keepTheirs(db, mine.id);

    expect(await readEntries(db, G1)).toEqual([{ ...mine, version: 3, title: 'Ich wersja' }]);
    expect((await readOutboxState(db, G1)).size).toBe(0);
    const sentBefore = api.sent.length;
    await flushOutbox(db, api.send);
    expect(api.sent.length).toBe(sentBefore);
  });
});
