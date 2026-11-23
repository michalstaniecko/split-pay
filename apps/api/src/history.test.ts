import { randomUUID } from 'node:crypto';
import { type Change, type Entry, type NewEntry, toNewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('change history', () => {
  const { signIn, client } = createTestApp();

  /** Ania's trip with Bartek (joined through the group link) and Tomek (without an account). */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: {
          id: randomUUID(),
          name: 'Mazury',
          emoji: '⛵',
          color: '#1E88E5',
          baseCurrency: 'PLN',
          startDate: '2026-07-10',
          endDate: '2026-07-14',
        },
      }),
    );
    const groupId = group.id;
    const me = group.ownerMemberId;
    const g = (session = ania) => client(session).groups[':groupId'];
    const { token } = await parseResponse(g().link.$get({ param: { groupId } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const tomek = await parseResponse(
      g().members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }),
    );

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
    const addEntry = async (entry: NewEntry = input) =>
      parseResponse(g().entries.$post({ param: { groupId }, json: entry }));
    const entryApi = (entryId: string, session = ania) => {
      const param = { groupId, entryId };
      const api = g(session).entries[':entryId'];
      return {
        edit: (entry: NewEntry, baseVersion: number) => api.$put({ param, json: { baseVersion, entry } }),
        remove: (baseVersion: number) => api.$delete({ param, query: { baseVersion: String(baseVersion) } }),
        restore: (baseVersion: number) => api.restore.$post({ param, json: { baseVersion } }),
      };
    };
    const entries = (session = ania) => parseResponse(g(session).entries.$get({ param: { groupId } }));
    const history = async (session = ania, query: { entryId?: string } = {}) =>
      (await parseResponse(g(session).changes.$get({ param: { groupId }, query }))) as Change[];
    const undo = (changeId: string, session = ania) =>
      g(session).changes[':changeId'].undo.$post({ param: { groupId, changeId } });
    return { ania, bartek, groupId, me, bartekId, tomek, token, g, input, addEntry, entryApi, entries, history, undo };
  }

  it('records group creation, joins and added members, newest first, with who did it', async () => {
    const { history, me, bartekId, tomek, groupId } = await setup();

    const changes = await history();
    expect(changes.map((c) => [c.kind, c.targetId, c.actorMemberId])).toEqual([
      ['member.add', tomek.id, me],
      ['member.join', bartekId, bartekId],
      ['group.create', groupId, me],
    ]);
    expect(changes[0]).toMatchObject({
      groupId,
      before: null,
      after: { displayName: 'Tomek' },
      undoesChangeId: null,
      undoneByChangeId: null,
      createdAt: expect.any(String),
    });
    expect(changes[2]?.after).toEqual({ name: 'Mazury', emoji: '⛵' });
  });

  it('a quick bill records the group, its people and the expense', async () => {
    const ania = await signIn('ania@example.com');
    const people = [
      { id: randomUUID(), displayName: 'Kasia' },
      { id: randomUUID(), displayName: 'Tomek' },
    ];
    const input = {
      groupId: randomUUID(),
      expenseId: randomUUID(),
      title: 'Pizza',
      amount: 12_001,
      currency: 'PLN',
      date: '2026-11-23',
      color: '#1E88E5',
      people,
    };
    const { group } = await parseResponse(client(ania)['quick-bills'].$post({ json: input }));
    const changes = (await parseResponse(
      client(ania).groups[':groupId'].changes.$get({ param: { groupId: group.id }, query: {} }),
    )) as Change[];
    expect(changes.map((c) => [c.kind, c.targetId, c.actorMemberId])).toEqual([
      ['entry.create', input.expenseId, group.ownerMemberId],
      ['member.add', people[1]!.id, group.ownerMemberId],
      ['member.add', people[0]!.id, group.ownerMemberId],
      ['group.create', group.id, group.ownerMemberId],
    ]);
  });

  it('records every entry change with the entry before and after', async () => {
    const { bartek, bartekId, addEntry, entryApi, history } = await setup();
    const created = await addEntry();
    const edited = await parseResponse(
      entryApi(created.id, bartek).edit({ ...toNewEntry(created), title: 'Pizza i napoje' } as NewEntry, 1),
    );
    const deleted = await parseResponse(entryApi(created.id).remove(2));
    const restored = await parseResponse(entryApi(created.id).restore(2));

    const changes = await history(undefined, { entryId: created.id });
    expect(changes.map((c) => [c.kind, c.before, c.after])).toEqual([
      ['entry.restore', deleted, restored],
      ['entry.delete', edited, deleted],
      ['entry.edit', created, edited],
      ['entry.create', null, created],
    ]);
    expect(changes[2]?.actorMemberId).toBe(bartekId);
  });

  it('records renames, attendance and settings changes', async () => {
    const { g, groupId, tomek, history } = await setup();
    await parseResponse(
      g().members[':memberId'].$patch({ param: { groupId, memberId: tomek.id }, json: { displayName: 'Tomasz' } }),
    );
    const attendance = [{ from: '2026-07-12', to: '2026-07-14' }];
    await parseResponse(
      g().members[':memberId'].attendance.$put({ param: { groupId, memberId: tomek.id }, json: { attendance } }),
    );
    await parseResponse(g().settings.$patch({ param: { groupId }, json: { simplifyDebts: false } }));

    const [settings, presence, rename] = await history();
    expect(rename).toMatchObject({
      kind: 'member.rename',
      targetId: tomek.id,
      before: { displayName: 'Tomek' },
      after: { displayName: 'Tomasz' },
    });
    expect(presence).toMatchObject({ kind: 'member.attendance', before: { attendance: null }, after: { attendance } });
    expect(settings).toMatchObject({
      kind: 'settings.update',
      targetId: groupId,
      before: { simplifyDebts: true },
      after: { simplifyDebts: false },
    });
  });

  it('records archiving, unarchiving and leaving the group; an archived group is not undone', async () => {
    const { bartek, bartekId, me, g, groupId, history, undo } = await setup();
    await parseResponse(g().settings.$patch({ param: { groupId }, json: { simplifyDebts: false } }));
    const [settings] = await history();
    await parseResponse(g().archive.$put({ param: { groupId } }));
    await parseResponse(g().archive.$put({ param: { groupId } }));

    const archived = await undo(settings!.id);
    expect(archived.status).toBe(409);
    expect(await archived.json()).toEqual({ error: 'archived' });

    await parseResponse(g().archive.$delete({ param: { groupId } }));
    await parseResponse(g(bartek).leave.$post({ param: { groupId } }));
    expect((await history()).slice(0, 3).map((c) => [c.kind, c.targetId, c.actorMemberId])).toEqual([
      ['member.leave', bartekId, bartekId],
      ['group.unarchive', groupId, me],
      ['group.archive', groupId, me],
    ]);
  });

  it('a rejected change records nothing', async () => {
    const { addEntry, entryApi, history, input } = await setup();
    const created = await addEntry();
    const before = await history();

    expect((await entryApi(created.id).edit({ ...input, title: 'Stale' }, 7)).status).toBe(409);
    expect((await entryApi(created.id).edit({ ...input, amount: -1 }, 1)).status).toBe(400);
    // An already deleted entry deleted again (idempotent retry) changes nothing either.
    await parseResponse(entryApi(created.id).remove(1));
    await parseResponse(entryApi(created.id).remove(1));
    expect((await history()).length).toBe(before.length + 1);
  });

  it('undoing an edit brings the old content back as a new version', async () => {
    const { bartek, addEntry, entryApi, entries, history, undo } = await setup();
    const created = await addEntry();
    await parseResponse(
      entryApi(created.id).edit({ ...toNewEntry(created), title: 'Sushi', date: '2026-07-12' } as NewEntry, 1),
    );
    const [edit] = await history();

    const res = await undo(edit!.id, bartek);
    expect(res.status).toBe(200);
    const [entry] = await entries();
    expect(entry).toMatchObject({ title: 'Pizza', date: '2026-07-11', version: 3 });

    const [undoChange, original] = await history();
    expect(undoChange).toMatchObject({ kind: 'entry.edit', undoesChangeId: edit!.id, after: entry });
    expect(await res.json()).toEqual(undoChange);
    expect(original).toMatchObject({ id: edit!.id, undoneByChangeId: undoChange!.id });
  });

  it('undoing a delete restores the entry; undoing a create deletes it', async () => {
    const { addEntry, entryApi, entries, history, undo } = await setup();
    const created = await addEntry();
    await parseResponse(entryApi(created.id).remove(1));
    const [deletion, creation] = await history();

    expect((await undo(deletion!.id)).status).toBe(200);
    expect((await entries()).map((e) => e.id)).toEqual([created.id]);
    expect((await history())[0]).toMatchObject({ kind: 'entry.restore', undoesChangeId: deletion!.id });

    expect((await undo(creation!.id)).status).toBe(200);
    expect(await entries()).toEqual([]);
    expect((await history())[0]).toMatchObject({ kind: 'entry.delete', undoesChangeId: creation!.id });
  });

  it('an undo can itself be undone', async () => {
    const { addEntry, entryApi, entries, history, undo } = await setup();
    const created = await addEntry();
    await parseResponse(entryApi(created.id).remove(1));
    const [deletion] = await history();
    const restore = (await (await undo(deletion!.id)).json()) as Change;

    expect((await undo(restore.id)).status).toBe(200);
    expect(await entries()).toEqual([]);
  });

  it('undo respects versioning: an entry changed since then is a conflict', async () => {
    const { addEntry, entryApi, history, undo } = await setup();
    const created = await addEntry();
    const v2 = await parseResponse(entryApi(created.id).edit({ ...toNewEntry(created), title: 'Sushi' } as NewEntry, 1));
    const [firstEdit] = await history();
    const v3 = await parseResponse(entryApi(created.id).edit({ ...toNewEntry(v2), title: 'Ramen' } as NewEntry, 2));
    const count = (await history()).length;

    const res = await undo(firstEdit!.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'version_conflict', entry: v3 });
    expect((await history()).length).toBe(count);

    // A deleted entry can't have an edit undone either.
    await parseResponse(entryApi(created.id).remove(3));
    const [, lastEdit] = await history();
    const deleted = await undo(lastEdit!.id);
    expect(deleted.status).toBe(409);
    expect(((await deleted.json()) as { entry: Entry }).entry.deletedAt).not.toBeNull();
  });

  it('undoing the same change twice answers the first undo', async () => {
    const { addEntry, entryApi, history, undo } = await setup();
    const created = await addEntry();
    await parseResponse(entryApi(created.id).remove(1));
    const [deletion] = await history();

    const first = await parseResponse(undo(deletion!.id));
    const again = await undo(deletion!.id);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    expect((await history()).filter((c) => c.undoesChangeId === deletion!.id)).toHaveLength(1);
  });

  it('undoing a rename restores the name unless it changed again', async () => {
    const { g, groupId, tomek, history, undo } = await setup();
    const rename = (displayName: string) =>
      parseResponse(g().members[':memberId'].$patch({ param: { groupId, memberId: tomek.id }, json: { displayName } }));
    const detail = async () => parseResponse(g().$get({ param: { groupId } }));

    await rename('Tomasz');
    const [first] = await history();
    await rename('Tomcio');
    const stale = await undo(first!.id);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'changed_since' });

    const [second] = await history();
    expect((await undo(second!.id)).status).toBe(200);
    expect((await detail()).members.find((m) => m.id === tomek.id)?.displayName).toBe('Tomasz');
    expect((await history())[0]).toMatchObject({
      kind: 'member.rename',
      before: { displayName: 'Tomcio' },
      after: { displayName: 'Tomasz' },
      undoesChangeId: second!.id,
    });
  });

  it('undoing attendance and settings changes', async () => {
    const { g, groupId, tomek, history, undo } = await setup();
    await parseResponse(
      g().members[':memberId'].attendance.$put({
        param: { groupId, memberId: tomek.id },
        json: { attendance: [{ from: '2026-07-12', to: '2026-07-14' }] },
      }),
    );
    await parseResponse(g().settings.$patch({ param: { groupId }, json: { simplifyDebts: false } }));
    const [settings, presence] = await history();

    expect((await undo(settings!.id)).status).toBe(200);
    expect((await undo(presence!.id)).status).toBe(200);
    const group = await parseResponse(g().$get({ param: { groupId } }));
    expect(group.simplifyDebts).toBe(true);
    expect(group.members.find((m) => m.id === tomek.id)?.attendance).toBeNull();
  });

  it('claims are in the history and can be undone from it', async () => {
    const { g, groupId, tomek, token, history, undo } = await setup();
    const tomasz = await signIn('tomasz@example.com');
    await parseResponse(client(tomasz).links[':token'].claim.$post({ param: { token }, json: { memberId: tomek.id } }));
    const [claim] = await history();
    const [claimMessage] = await parseResponse(g().claims.$get({ param: { groupId } }));
    expect(claim).toMatchObject({
      kind: 'claim',
      id: claimMessage!.id,
      targetId: tomek.id,
      actorMemberId: tomek.id,
      after: { claimId: claimMessage!.id },
    });

    const res = await undo(claim!.id);
    expect(res.status).toBe(200);
    const [undoChange, claimAgain] = await history();
    expect(undoChange).toMatchObject({ kind: 'claim.undo', targetId: tomek.id, undoesChangeId: claim!.id });
    expect(claimAgain?.undoneByChangeId).toBe(undoChange!.id);
    expect((await parseResponse(g().claims.$get({ param: { groupId } })))[0]?.undoneAt).not.toBeNull();
    expect((await client(tomasz).groups[':groupId'].$get({ param: { groupId } })).status).toBe(404);
  });

  it('undoing a claim from its system message is recorded too', async () => {
    const { g, groupId, tomek, token, history } = await setup();
    const tomasz = await signIn('tomasz@example.com');
    await parseResponse(client(tomasz).links[':token'].claim.$post({ param: { token }, json: { memberId: tomek.id } }));
    const [claim] = await parseResponse(g().claims.$get({ param: { groupId } }));

    await parseResponse(g().claims[':claimId'].undo.$post({ param: { groupId, claimId: claim!.id } }));
    expect((await history())[0]).toMatchObject({ kind: 'claim.undo', undoesChangeId: claim!.id });
  });

  it('creating the group or adding a member cannot be undone', async () => {
    const { history, undo } = await setup();
    const [addMember] = await history();
    const res = await undo(addMember!.id);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'not_undoable' });
  });

  it('only members see and undo the history; unknown changes are 404', async () => {
    const { groupId, history, undo, g } = await setup();
    const cezary = await signIn('cezary@example.com');
    const [change] = await history();

    expect((await g(cezary).changes.$get({ param: { groupId }, query: {} })).status).toBe(404);
    expect((await undo(change!.id, cezary)).status).toBe(404);
    expect((await undo(randomUUID())).status).toBe(404);
    expect((await undo('nope')).status).toBe(404);
    expect((await client().groups[':groupId'].changes.$get({ param: { groupId }, query: {} })).status).toBe(401);
  });

  it('deleting an account removes its names from the history', async () => {
    const { bartek, bartekId, g, groupId, history } = await setup();
    await parseResponse(
      g(bartek).members[':memberId'].$patch({ param: { groupId, memberId: bartekId }, json: { displayName: 'Bartłomiej K.' } }),
    );
    await parseResponse(client(bartek).me.$delete({ json: { locale: 'pl' } }));

    const names = (await history())
      .filter((c) => c.targetId === bartekId)
      .flatMap((c) => [JSON.stringify(c.before), JSON.stringify(c.after)]);
    expect(names.join(' ')).not.toMatch(/bart/i);
  });
});
