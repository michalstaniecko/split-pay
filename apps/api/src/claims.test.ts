import { randomUUID } from 'node:crypto';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

const newGroup = () => ({
  id: randomUUID(),
  name: 'Mazury',
  emoji: '⛵',
  color: '#1E88E5',
  baseCurrency: 'PLN',
  startDate: '2026-07-10',
  endDate: '2026-07-14',
});

describe('claiming a member without an account', () => {
  const { signIn, client } = createTestApp();

  /** Ania's group with Tomek (member without an account) and its group link token. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const groupId = group.id;
    const addMember = async (displayName: string) =>
      parseResponse(
        client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName } }),
      );
    const tomek = await addMember('Tomek');
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    const detail = async (session = ania) => parseResponse(client(session).groups[':groupId'].$get({ param: { groupId } }));
    const claims = async (session = ania) =>
      parseResponse(client(session).groups[':groupId'].claims.$get({ param: { groupId } }));
    return { ania, group, groupId, tomek, token, addMember, detail, claims };
  }

  const link = (session: { cookie: string }) => client(session).links[':token'];

  it('the join screen lists the members without an account', async () => {
    const { token, tomek } = await setup();
    const bartek = await signIn('bartek@example.com');

    const preview = await parseResponse(link(bartek).$get({ param: { token } }));
    expect(preview).toMatchObject({
      memberCount: 2,
      isMember: false,
      claimable: [{ id: tomek.id, displayName: 'Tomek' }],
      claimFor: null,
    });
  });

  it('claiming links the member, with their history, to the user', async () => {
    const { groupId, tomek, token, detail, claims } = await setup();
    const tomasz = await signIn('tomasz@example.com');

    const res = await link(tomasz).claim.$post({ param: { token }, json: { memberId: tomek.id } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ groupId, memberId: tomek.id });

    // Same member, same name — now with an account; the group has no extra member.
    const members = (await detail()).members;
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.id === tomek.id)).toEqual({ ...tomek, userId: tomasz.userId });
    expect((await detail(tomasz)).id).toBe(groupId);
    expect(await parseResponse(link(tomasz).$get({ param: { token } }))).toMatchObject({ isMember: true, claimable: [] });

    // The claim is a system message every member sees.
    expect(await claims()).toEqual([
      {
        id: expect.any(String),
        memberId: tomek.id,
        memberName: 'Tomek',
        userId: tomasz.userId,
        claimerName: 'tomasz',
        claimedAt: expect.any(String),
        undoneAt: null,
      },
    ]);
  });

  it('a member that already has an account cannot be claimed', async () => {
    const { ania, group, tomek, token } = await setup();
    const tomasz = await signIn('tomasz@example.com');
    await parseResponse(link(tomasz).claim.$post({ param: { token }, json: { memberId: tomek.id } }));

    const bartek = await signIn('bartek@example.com');
    const taken = await link(bartek).claim.$post({ param: { token }, json: { memberId: tomek.id } });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'already_claimed' });

    const owner = await link(bartek).claim.$post({ param: { token }, json: { memberId: group.ownerMemberId } });
    expect(owner.status).toBe(409);

    // Claiming again my own member is a harmless retry.
    const again = await link(tomasz).claim.$post({ param: { token }, json: { memberId: tomek.id } });
    expect(again.status).toBe(200);
    expect(await parseResponse(client(ania).groups[':groupId'].claims.$get({ param: { groupId: group.id } }))).toHaveLength(1);
  });

  it("a user can't claim a second member in the same group", async () => {
    const { tomek, token, addMember, detail } = await setup();
    const zosia = await addMember('Zosia');
    const tomasz = await signIn('tomasz@example.com');
    await parseResponse(link(tomasz).claim.$post({ param: { token }, json: { memberId: tomek.id } }));

    const second = await link(tomasz).claim.$post({ param: { token }, json: { memberId: zosia.id } });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'already_member' });

    // Neither after joining as a new person.
    const bartek = await signIn('bartek@example.com');
    await parseResponse(link(bartek).join.$post({ param: { token } }));
    expect((await link(bartek).claim.$post({ param: { token }, json: { memberId: zosia.id } })).status).toBe(409);

    expect((await detail()).members.find((m) => m.id === zosia.id)?.userId).toBeNull();
  });

  it('two concurrent claims of different members by one user claim only one', async () => {
    const { tomek, token, addMember, detail, claims } = await setup();
    const zosia = await addMember('Zosia');
    const tomasz = await signIn('tomasz@example.com');
    const results = await Promise.all(
      [tomek, zosia].map((m) => link(tomasz).claim.$post({ param: { token }, json: { memberId: m.id } })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await detail()).members.filter((m) => m.userId === tomasz.userId)).toHaveLength(1);
    expect(await claims()).toHaveLength(1);
  });

  it('unknown members, foreign members and invalid tokens answer 404', async () => {
    const { token } = await setup();
    const other = await setup2();
    const tomasz = await signIn('tomasz@example.com');
    const claim = (memberId: string, t = token) => link(tomasz).claim.$post({ param: { token: t }, json: { memberId } });
    expect((await claim(randomUUID())).status).toBe(404);
    expect((await claim(other.memberId)).status).toBe(404);
    expect((await claim(randomUUID(), 'nope')).status).toBe(404);
    expect((await link(tomasz).claim.$post({ param: { token }, json: { memberId: 'x' } })).status).toBe(400);
    expect((await client().links[':token'].claim.$post({ param: { token }, json: { memberId: randomUUID() } })).status).toBe(401);
  });

  /** A second group (Celina's) with a member without an account. */
  async function setup2() {
    const celina = await signIn('celina@example.com');
    const group = await parseResponse(client(celina).groups.$post({ json: newGroup() }));
    const member = await parseResponse(
      client(celina).groups[':groupId'].members.$post({
        param: { groupId: group.id },
        json: { id: randomUUID(), displayName: 'Olek' },
      }),
    );
    return { celina, group, memberId: member.id };
  }

  describe('undo', () => {
    async function claimed() {
      const ctx = await setup();
      const tomasz = await signIn('tomasz@example.com');
      await parseResponse(link(tomasz).claim.$post({ param: { token: ctx.token }, json: { memberId: ctx.tomek.id } }));
      const [claim] = await ctx.claims();
      if (!claim) throw new Error('no claim');
      const undo = (session: { cookie: string }, claimId = claim.id) =>
        client(session).groups[':groupId'].claims[':claimId'].undo.$post({ param: { groupId: ctx.groupId, claimId } });
      return { ...ctx, tomasz, claim, undo };
    }

    it('any member undoes a claim; the member is without an account again', async () => {
      const { ania, tomasz, tomek, claim, undo, detail, claims, groupId, token } = await claimed();

      const res = await undo(ania);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: claim.id, undoneAt: expect.any(String) });

      expect((await detail()).members.find((m) => m.id === tomek.id)).toEqual(tomek);
      expect((await claims())[0]?.undoneAt).toEqual(expect.any(String));
      // Tomasz lost access with the profile...
      expect((await client(tomasz).groups[':groupId'].$get({ param: { groupId } })).status).toBe(404);
      // ...and the profile can be claimed again.
      expect(await parseResponse(link(tomasz).$get({ param: { token } }))).toMatchObject({
        isMember: false,
        claimable: [{ id: tomek.id }],
      });
      expect((await link(tomasz).claim.$post({ param: { token }, json: { memberId: tomek.id } })).status).toBe(201);
      expect(await claims()).toHaveLength(2);
    });

    it('the claimer may undo their own claim; undoing twice is harmless', async () => {
      const { tomasz, ania, undo, detail, tomek } = await claimed();
      expect((await undo(tomasz)).status).toBe(200);
      expect((await undo(ania)).status).toBe(200);
      expect((await detail()).members.find((m) => m.id === tomek.id)?.userId).toBeNull();
    });

    it('only members of the group can undo, and only its own claims', async () => {
      const { ania, undo } = await claimed();
      const bartek = await signIn('bartek@example.com');
      expect((await undo(bartek)).status).toBe(404);
      expect((await undo(ania, randomUUID())).status).toBe(404);
      expect((await undo(ania, 'nope')).status).toBe(404);
    });
  });

  describe('personal claim link', () => {
    async function personal() {
      const ctx = await setup();
      const res = await client(ctx.ania).groups[':groupId'].members[':memberId']['claim-link'].$get({
        param: { groupId: ctx.groupId, memberId: ctx.tomek.id },
      });
      expect(res.status).toBe(200);
      const { token } = (await res.json()) as { token: string };
      return { ...ctx, personalToken: token };
    }

    it('any member gets a stable personal link for a member without an account', async () => {
      const { ania, groupId, tomek, token, personalToken } = await personal();
      expect(personalToken).toMatch(/^[\w-]{32,}$/);
      expect(personalToken).not.toBe(token);
      const again = await parseResponse(
        client(ania).groups[':groupId'].members[':memberId']['claim-link'].$get({ param: { groupId, memberId: tomek.id } }),
      );
      expect(again.token).toBe(personalToken);
    });

    it('lands directly on claiming that member', async () => {
      const { group, groupId, tomek, personalToken, addMember, detail } = await personal();
      await addMember('Zosia');
      const tomasz = await signIn('tomasz@example.com');

      const preview = await parseResponse(link(tomasz).$get({ param: { token: personalToken } }));
      expect(preview).toEqual({
        group: { id: groupId, name: group.name, emoji: group.emoji, color: group.color },
        memberCount: 3,
        isMember: false,
        claimable: [{ id: tomek.id, displayName: 'Tomek' }],
        claimFor: tomek.id,
      });

      const res = await link(tomasz).claim.$post({ param: { token: personalToken }, json: { memberId: tomek.id } });
      expect(res.status).toBe(201);
      expect((await detail()).members.find((m) => m.id === tomek.id)?.userId).toBe(tomasz.userId);
      expect(await parseResponse(link(tomasz).$get({ param: { token: personalToken } }))).toMatchObject({
        isMember: true,
        claimable: [],
      });
    });

    it('once its member is claimed, acts as a group link', async () => {
      const { groupId, tomek, personalToken, addMember, detail } = await personal();
      const zosia = await addMember('Zosia');
      const tomasz = await signIn('tomasz@example.com');
      await parseResponse(link(tomasz).claim.$post({ param: { token: personalToken }, json: { memberId: tomek.id } }));

      const bartek = await signIn('bartek@example.com');
      expect(await parseResponse(link(bartek).$get({ param: { token: personalToken } }))).toMatchObject({
        isMember: false,
        claimable: [{ id: zosia.id, displayName: 'Zosia' }],
        claimFor: null,
      });

      const res = await link(bartek).claim.$post({ param: { token: personalToken }, json: { memberId: zosia.id } });
      expect(res.status).toBe(201);
      expect((await detail()).members.find((m) => m.id === zosia.id)?.userId).toBe(bartek.userId);

      const kasia = await signIn('kasia@example.com');
      const joined = await link(kasia).join.$post({ param: { token: personalToken } });
      expect(joined.status).toBe(201);
      expect(await joined.json()).toMatchObject({ groupId });
    });

    it("can't be used to claim another member", async () => {
      const { personalToken, addMember } = await personal();
      const zosia = await addMember('Zosia');
      const tomasz = await signIn('tomasz@example.com');
      const res = await link(tomasz).claim.$post({ param: { token: personalToken }, json: { memberId: zosia.id } });
      expect(res.status).toBe(404);
    });

    it('only for members without an account, and only for members of the group', async () => {
      const { ania, group, groupId, tomek } = await personal();
      const claimLink = (session: { cookie: string }, memberId: string) =>
        client(session).groups[':groupId'].members[':memberId']['claim-link'].$get({ param: { groupId, memberId } });

      const owner = await claimLink(ania, group.ownerMemberId);
      expect(owner.status).toBe(409);
      expect(await owner.json()).toEqual({ error: 'has_account' });

      const bartek = await signIn('bartek@example.com');
      expect((await claimLink(bartek, tomek.id)).status).toBe(404);
      expect((await claimLink(ania, randomUUID())).status).toBe(404);
      expect((await claimLink(ania, 'nope')).status).toBe(404);
    });
  });
});
