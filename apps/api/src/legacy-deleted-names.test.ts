import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Change } from '@split-pay/shared';
import { eq, sql } from 'drizzle-orm';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { changes, claims, members } from './db/schema';
import { createTestApp } from '../test/app';
import { testDb } from '../test/db';

/** The statements of the migration that turns pre-#47 "deleted user" names into the null marker (run again on old rows). */
const migration = readFileSync(new URL('../drizzle/0012_legacy_deleted_names.sql', import.meta.url), 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);
const runMigration = async () => {
  for (const statement of migration) await testDb.db.execute(sql.raw(statement));
};

describe('names left by deletions before #47 become the null marker (ADR-0019)', () => {
  const { signIn, client } = createTestApp();

  /** Ania's trip; Bartek joined and Tomasz claimed Tomek, then both deleted their accounts. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const tomasz = await signIn('tomasz@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const g = (session = ania) => client(session).groups[':groupId'];
    const { token } = await parseResponse(g().link.$get({ param: { groupId } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const tomek = await parseResponse(g().members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }));
    await parseResponse(client(tomasz).links[':token'].claim.$post({ param: { token }, json: { memberId: tomek.id } }));
    await parseResponse(client(bartek).me.$delete({ json: {} }));
    await parseResponse(client(tomasz).me.$delete({ json: {} }));
    const detail = () => parseResponse(g().$get({ param: { groupId } }));
    const claimList = () => parseResponse(g().claims.$get({ param: { groupId } }));
    const history = async () => (await parseResponse(g().changes.$get({ param: { groupId }, query: {} }))) as Change[];
    return { ania, groupId, aniaId: group.ownerMemberId, bartekId, tomekId: tomek.id, detail, claimList, history };
  }

  /** What the pre-#47 deletion wrote: the name in the deleting user's language, in members, claims and history. */
  async function legacyDeletion(memberId: string, name: string) {
    await testDb.db.update(members).set({ displayName: name }).where(eq(members.id, memberId));
    await testDb.db.update(claims).set({ claimerName: name }).where(sql`${claims.userId} is null`);
    const named = (column: typeof changes.before | typeof changes.after) =>
      sql`case when ${column} is null then null else jsonb_build_object('displayName', ${name}::text) end`;
    await testDb.db
      .update(changes)
      .set({ before: named(changes.before), after: named(changes.after) })
      .where(sql`${changes.targetId} = ${memberId} and ${changes.kind} in ('member.add', 'member.join', 'member.rename')`);
  }

  const memberNames = (history: Change[], memberId: string) =>
    history
      .filter((c) => c.targetId === memberId && c.kind.startsWith('member.'))
      .flatMap((c) => [c.before, c.after])
      .filter((d): d is { displayName: string | null } => d !== null && typeof d === 'object' && 'displayName' in d)
      .map((d) => d.displayName);

  it('in members, claims and the change history, in Polish and English', async () => {
    const { bartekId, tomekId, detail, claimList, history } = await setup();
    await legacyDeletion(bartekId, 'Usunięty użytkownik');
    await legacyDeletion(tomekId, 'Deleted user');

    await runMigration();

    const after = (await detail()).members;
    expect(after.find((m) => m.id === bartekId)?.displayName).toBeNull();
    expect(after.find((m) => m.id === tomekId)?.displayName).toBeNull();
    expect((await claimList()).map((c) => c.claimerName)).toEqual([null]);
    const log = await history();
    expect(memberNames(log, bartekId).length).toBeGreaterThan(0);
    expect(memberNames(log, bartekId).every((n) => n === null)).toBe(true);
  });

  it('leaves real names alone, and a member with an account keeps even that literal name', async () => {
    const { ania, groupId, aniaId, bartekId, detail, history } = await setup();
    await parseResponse(
      client(ania).groups[':groupId'].members[':memberId'].$patch({
        param: { groupId, memberId: aniaId },
        json: { displayName: 'Deleted user' },
      }),
    );

    await runMigration();

    const after = (await detail()).members;
    expect(after.find((m) => m.id === aniaId)?.displayName).toBe('Deleted user');
    expect(after.find((m) => m.id === bartekId)?.displayName).toBe('bartek');
    expect(memberNames(await history(), aniaId)).toContain('Deleted user');
  });
});
