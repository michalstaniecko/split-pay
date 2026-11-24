import { randomUUID } from 'node:crypto';
import type { Entry, NewEntry } from '@split-pay/shared';
import { eq } from 'drizzle-orm';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { entries } from './db/schema';
import { DELTA_SYNC_OVERLAP_MS } from './routes/delta-sync';
import { createTestApp } from '../test/app';
import { testDb } from '../test/db';

describe('delta sync (GET /groups/:groupId/sync)', () => {
  const { app, signIn, client } = createTestApp();

  async function setup() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const me = group.ownerMemberId;
    const groupId = group.id;
    const entriesApi = client(ania).groups[':groupId'].entries;
    const add = (title: string) => {
      const input: NewEntry = {
        kind: 'expense',
        id: randomUUID(),
        date: '2026-07-11',
        title,
        amount: 1_000,
        currency: 'PLN',
        rateToBase: '1',
        category: 'food',
        receiptPhotoId: null,
        payers: [{ memberId: me, amount: 1_000 }],
        split: { mode: 'equal', memberIds: [me] },
      };
      return parseResponse(entriesApi.$post({ param: { groupId }, json: input }));
    };
    const remove = (entry: Entry) =>
      parseResponse(
        entriesApi[':entryId'].$delete({
          param: { groupId, entryId: entry.id },
          query: { baseVersion: String(entry.version) },
        }),
      );
    const changes = (since?: string, session = ania) =>
      client(session).groups[':groupId'].sync.$get({ param: { groupId }, query: since ? { since } : {} });
    /** Moves an entry's `updatedAt` into the past, as if it changed long ago. */
    const age = (entry: Entry, updatedAt: string) =>
      testDb.db.update(entries).set({ updatedAt: new Date(updatedAt) }).where(eq(entries.id, entry.id));
    return { ania, group, groupId, add, remove, changes, age };
  }

  it('without `since` returns the group with its members and every entry, deleted ones included', async () => {
    const { group, add, remove, changes } = await setup();
    const pizza = await add('Pizza');
    const beer = await add('Piwo');
    const deleted = await remove(beer);

    const res = await changes();
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.group).toEqual({ ...group, lastActivityAt: expect.any(String), members: [expect.objectContaining({ id: group.ownerMemberId })] });
    expect(body.entries).toHaveLength(2);
    expect(body.entries).toEqual(expect.arrayContaining([pizza, deleted]));
    expect(body.entries.find((e) => e.id === beer.id)?.deletedAt).not.toBeNull();
    expect(body.cursor).toBe([pizza.updatedAt, deleted.updatedAt].sort().at(-1));
  });

  it('with `since` returns only entries changed after it (minus the overlap window)', async () => {
    const { add, remove, changes, age } = await setup();
    const old = await add('Stare');
    const recentlyDeleted = await add('Usunięte');
    await age(old, '2026-01-01T10:00:00.000Z');
    await age(recentlyDeleted, '2026-01-01T10:00:00.000Z');
    const deleted = await remove(recentlyDeleted);
    const fresh = await add('Nowe');

    const body = await parseResponse(changes('2026-01-01T12:00:00.000Z'));
    expect(body.entries.map((e) => e.id).sort()).toEqual([deleted.id, fresh.id].sort());
    expect(body.entries.find((e) => e.id === deleted.id)?.deletedAt).not.toBeNull();
  });

  it('repeats changes from the overlap window before `since` (late commits are not missed)', async () => {
    const { add, changes, age } = await setup();
    const entry = await add('Pizza');
    const since = '2026-01-01T12:00:00.000Z';
    await age(entry, new Date(Date.parse(since) - DELTA_SYNC_OVERLAP_MS / 2).toISOString());

    const body = await parseResponse(changes(since));
    expect(body.entries.map((e) => e.id)).toEqual([entry.id]);
  });

  it('with nothing new keeps the cursor at `since`', async () => {
    const { changes } = await setup();
    const since = '2026-01-01T12:00:00.000Z';
    const body = await parseResponse(changes(since));
    expect(body.entries).toEqual([]);
    expect(body.cursor).toBe(since);
  });

  it('cursor is null for an empty group synced from scratch', async () => {
    const { changes } = await setup();
    expect((await parseResponse(changes())).cursor).toBeNull();
  });

  it('rejects a malformed `since` with 400', async () => {
    const { changes } = await setup();
    expect((await changes('yesterday')).status).toBe(400);
  });

  it("answers 404 for someone else's group and 401 without a session", async () => {
    const { changes, groupId } = await setup();
    const bartek = await signIn('bartek@example.com');
    expect((await changes(undefined, bartek)).status).toBe(404);
    expect((await app.request(`/groups/${groupId}/sync`)).status).toBe(401);
  });
});
