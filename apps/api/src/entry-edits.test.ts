import { randomUUID } from 'node:crypto';
import { type Entry, type NewEntry, toNewEntry } from '@split-pay/shared';
import { eq } from 'drizzle-orm';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { groups } from './db/schema';
import { createTestApp } from '../test/app';
import { testDb } from '../test/db';

describe('editing and deleting entries', () => {
  const { app, signIn, client } = createTestApp();

  /** Ania's trip with Bartek (joined through the group link) and one expense of Ania's. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const me = group.ownerMemberId;
    const api = (session = ania) => client(session).groups[':groupId'].entries;
    const input: NewEntry = {
      kind: 'expense',
      id: randomUUID(),
      date: '2026-07-11',
      title: 'Pizza',
      amount: 10_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'food',
      receiptPhotoId: null,
      payers: [{ memberId: me, amount: 10_000 }],
      split: { mode: 'equal', memberIds: [me, bartekId] },
    };
    const created = await parseResponse(api().$post({ param: { groupId: group.id }, json: input }));
    const param = { groupId: group.id, entryId: created.id };
    const edit = (entry: NewEntry, baseVersion: number, session = ania) =>
      api(session)[':entryId'].$put({ param, json: { baseVersion, entry } });
    const remove = (baseVersion: number, session = ania) =>
      api(session)[':entryId'].$delete({ param, query: { baseVersion: String(baseVersion) } });
    const restore = (baseVersion: number, session = ania) =>
      api(session)[':entryId'].restore.$post({ param, json: { baseVersion } });
    const list = (session = ania) => parseResponse(api(session).$get({ param: { groupId: group.id } }));
    return { ania, bartek, bartekId, group, me, created, edit, remove, restore, list };
  }

  it('any member edits an entry: new content, version + 1, author kept', async () => {
    const { ania, bartek, bartekId, created, edit, list } = await setup();
    const changed: NewEntry = {
      ...toNewEntry(created),
      title: 'Pizza i napoje',
      amount: 12_000,
      payers: [{ memberId: bartekId, amount: 12_000 }],
    } as NewEntry;

    const res = await edit(changed, 1, bartek);
    expect(res.status).toBe(200);
    const edited = (await res.json()) as Entry;
    expect(edited).toEqual({
      ...changed,
      groupId: created.groupId,
      version: 2,
      createdBy: ania.userId,
      createdAt: created.createdAt,
      updatedAt: expect.any(String),
      deletedAt: null,
    });
    expect(edited.updatedAt > created.updatedAt).toBe(true);
    expect(await list()).toEqual([edited]);
  });

  it('an edit can turn an expense into an income', async () => {
    const { created, edit, list } = await setup();
    const { payers, ...fields } = toNewEntry(created) as Extract<NewEntry, { kind: 'expense' }>;

    const income = await parseResponse(edit({ ...fields, kind: 'income', recipients: payers }, 1));
    expect(income).toMatchObject({ kind: 'income', recipients: payers, version: 2 });
    expect(income).not.toHaveProperty('payers');
    expect(await list()).toEqual([income]);
  });

  it('an edit based on a stale version is rejected with 409 and the current entry', async () => {
    const { bartek, created, edit, list } = await setup();
    const theirs = await parseResponse(edit({ ...toNewEntry(created), title: 'Kolacja' } as NewEntry, 1, bartek));

    const res = await edit({ ...toNewEntry(created), title: 'Obiad' } as NewEntry, 1);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'version_conflict', entry: theirs });
    expect(await list()).toEqual([theirs]);
  });

  it('rejects an invalid edit, an edit of another id and members outside the group', async () => {
    const { created, edit } = await setup();
    const res = await edit({ ...toNewEntry(created), amount: 9_000 } as NewEntry, 1);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_entry' });

    expect((await edit({ ...toNewEntry(created), id: randomUUID() }, 1)).status).toBe(400);

    const stranger = randomUUID();
    const foreign = { ...toNewEntry(created), split: { mode: 'equal', memberIds: [stranger] } } as NewEntry;
    expect((await edit(foreign, 1)).status).toBe(400);
  });

  it('edits bump the inbox order', async () => {
    const { ania, group, created, edit } = await setup();
    const other = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Later', emoji: '🍕', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    expect((await parseResponse(client(ania).groups.$get()))[0]?.id).toBe(other.id);

    await parseResponse(edit({ ...toNewEntry(created), title: 'Kolacja' } as NewEntry, 1));
    expect((await parseResponse(client(ania).groups.$get()))[0]?.id).toBe(group.id);
  });

  it('delete is soft: the entry leaves the Conversation, keeps its version and can be restored', async () => {
    const { bartek, created, remove, restore, list } = await setup();

    const res = await remove(1, bartek);
    expect(res.status).toBe(200);
    const deleted = (await res.json()) as Entry;
    expect(deleted).toMatchObject({ id: created.id, version: 1, deletedAt: expect.any(String) });
    expect(await list()).toEqual([]);

    const restored = await restore(1);
    expect(restored.status).toBe(200);
    const back = (await restored.json()) as Entry;
    expect(back).toMatchObject({ id: created.id, title: 'Pizza', version: 1, deletedAt: null });
    expect(back.updatedAt > deleted.updatedAt).toBe(true);
    expect(await list()).toEqual([back]);
  });

  it('a deleted entry no longer counts in balances; restoring brings it back', async () => {
    const { ania, group, me, bartekId, remove, restore } = await setup();
    const balances = async () => {
      const body = await parseResponse(client(ania).groups[':groupId'].balances.$get({ param: { groupId: group.id } }));
      return Object.fromEntries(body.balances.map((b) => [b.memberId, b.amount]));
    };
    expect(await balances()).toEqual({ [me]: 5_000, [bartekId]: -5_000 });

    await parseResponse(remove(1));
    expect(await balances()).toEqual({ [me]: 0, [bartekId]: 0 });

    await parseResponse(restore(1));
    expect(await balances()).toEqual({ [me]: 5_000, [bartekId]: -5_000 });
  });

  it('delete and restore are idempotent', async () => {
    const { remove, restore } = await setup();
    const first = await parseResponse(remove(1));
    const again = await remove(1);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);

    await parseResponse(restore(1));
    expect((await restore(1)).status).toBe(200);
  });

  it('delete and restore based on a stale version are conflicts', async () => {
    const { created, edit, remove, restore } = await setup();
    const edited = await parseResponse(edit({ ...toNewEntry(created), title: 'Kolacja' } as NewEntry, 1));

    const staleDelete = await remove(1);
    expect(staleDelete.status).toBe(409);
    expect(await staleDelete.json()).toEqual({ error: 'version_conflict', entry: edited });

    const deleted = await parseResponse(remove(2));
    expect(deleted.deletedAt).not.toBeNull();
    const staleRestore = await restore(1);
    expect(staleRestore.status).toBe(409);
    expect(await staleRestore.json()).toEqual({ error: 'version_conflict', entry: deleted });
  });

  it('a deleted entry cannot be edited: conflict with the deleted entry', async () => {
    const { created, edit, remove } = await setup();
    const deleted = await parseResponse(remove(1));

    const res = await edit({ ...toNewEntry(created), title: 'Kolacja' } as NewEntry, 1);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'version_conflict', entry: deleted });
  });

  it('an archived group is read-only (409 archived, #25)', async () => {
    const { group, created, edit, remove, restore } = await setup();
    await testDb.db.update(groups).set({ archivedAt: new Date() }).where(eq(groups.id, group.id));

    for (const res of [
      await edit({ ...toNewEntry(created), title: 'Kolacja' } as NewEntry, 1),
      await remove(1),
      await restore(1),
    ]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'archived' });
    }
  });

  it('is scoped to members of the group: 404 otherwise', async () => {
    const { group, created, edit, remove, restore } = await setup();
    const zosia = await signIn('zosia@example.com');
    expect((await edit(toNewEntry(created), 1, zosia)).status).toBe(404);
    expect((await remove(1, zosia)).status).toBe(404);
    expect((await restore(1, zosia)).status).toBe(404);

    const ania = await signIn('ania@example.com');
    const unknown = await app.request(`/groups/${group.id}/entries/${randomUUID()}?baseVersion=1`, {
      method: 'DELETE',
      headers: { cookie: ania.cookie },
    });
    expect(unknown.status).toBe(404);
    const notUuid = await app.request(`/groups/${group.id}/entries/nope?baseVersion=1`, {
      method: 'DELETE',
      headers: { cookie: ania.cookie },
    });
    expect(notUuid.status).toBe(404);
  });

  it('an entry of another group is not found through this group', async () => {
    const { ania, created } = await setup();
    const other = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Other', emoji: '🍕', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const res = await client(ania).groups[':groupId'].entries[':entryId'].$put({
      param: { groupId: other.id, entryId: created.id },
      json: { baseVersion: 1, entry: toNewEntry(created) },
    });
    expect(res.status).toBe(404);
  });
});
