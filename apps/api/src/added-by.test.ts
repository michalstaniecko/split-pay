import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';
import { testDb } from '../test/db';

/** The data statements of the migration that added `entries.created_by_member` (run again on old rows). */
const backfill = readFileSync(new URL('../drizzle/0011_deletion_keeps_name.sql', import.meta.url), 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter((s) => /^update /im.test(s));

describe('"added by" is the member who added the entry (ADR-0019)', () => {
  const { signIn, client } = createTestApp();

  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const expense = (payer: string): NewEntry => ({
      kind: 'expense',
      id: randomUUID(),
      date: '2026-07-11',
      title: 'Pizza',
      amount: 9_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'food',
      receiptPhotoId: null,
      payers: [{ memberId: payer, amount: 9_000 }],
      split: { mode: 'equal', memberIds: [group.ownerMemberId, bartekId] },
    });
    const add = (session: typeof ania, entry: NewEntry) =>
      parseResponse(client(session).groups[':groupId'].entries.$post({ param: { groupId }, json: entry }));
    const entries = () => parseResponse(client(ania).groups[':groupId'].entries.$get({ param: { groupId } }));
    return { ania, bartek, groupId, aniaId: group.ownerMemberId, bartekId, expense, add, entries };
  }

  it('is recorded when the entry is added, whoever paid', async () => {
    const { bartek, bartekId, aniaId, expense, add } = await setup();

    const created = await add(bartek, expense(aniaId));

    expect(created.createdByMember).toBe(bartekId);
    expect(created.createdBy).toBe(bartek.userId);
  });

  it('stays the same member when someone else edits the entry', async () => {
    const { ania, bartek, groupId, bartekId, aniaId, expense, add } = await setup();
    const created = await add(bartek, expense(aniaId));
    const { groupId: _g, version, createdBy: _c, createdByMember: _m, createdAt: _a, updatedAt: _u, deletedAt: _d, ...input } =
      created;

    const edited = await parseResponse(
      client(ania).groups[':groupId'].entries[':entryId'].$put({
        param: { groupId, entryId: created.id },
        json: { baseVersion: version, entry: { ...input, title: 'Pizza i cola' } as NewEntry },
      }),
    );

    expect(edited.createdByMember).toBe(bartekId);
  });

  it('the migration backfills existing entries from the author’s user; unknown when the author is gone', async () => {
    expect(backfill.length).toBeGreaterThan(0);
    const { ania, bartek, aniaId, bartekId, expense, add, entries } = await setup();
    const byAnia = await add(ania, expense(aniaId));
    const byBartek = await add(bartek, expense(bartekId));
    const byGone = await add(bartek, expense(bartekId));
    // As before the migration: no author member; one author's account is long gone.
    await testDb.pool.query('UPDATE entries SET created_by_member = NULL');
    await testDb.pool.query('UPDATE entries SET created_by = $1 WHERE id = $2', [randomUUID(), byGone.id]);

    for (const statement of backfill) await testDb.pool.query(statement);

    const byId = new Map((await entries()).map((e) => [e.id, e.createdByMember]));
    expect(byId.get(byAnia.id)).toBe(aniaId);
    expect(byId.get(byBartek.id)).toBe(bartekId);
    expect(byId.get(byGone.id)).toBeNull();
  });
});
