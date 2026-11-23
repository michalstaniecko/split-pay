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

describe('group link', () => {
  const { signIn, client } = createTestApp();

  /** Ania's group and its group link token. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    const detail = async (session = ania) =>
      parseResponse(client(session).groups[':groupId'].$get({ param: { groupId: group.id } }));
    return { ania, group, token, detail };
  }

  const link = (session: { cookie: string }) => client(session).links[':token'];

  it('gives every member the same secret token for the group', async () => {
    const { ania, group, token } = await setup();
    expect(token).toMatch(/^[\w-]{32,}$/);
    const again = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    expect(again.token).toBe(token);
  });

  it('previews the group behind a token before joining', async () => {
    const { group, token } = await setup();
    const bartek = await signIn('bartek@example.com');

    const preview = await parseResponse(link(bartek).$get({ param: { token } }));
    expect(preview).toEqual({
      group: { id: group.id, name: 'Mazury', emoji: '⛵', color: '#1E88E5' },
      memberCount: 1,
      isMember: false,
    });
  });

  it('joins as a new person', async () => {
    const { group, token, detail } = await setup();
    const bartek = await signIn('bartek@example.com');

    const res = await link(bartek).join.$post({ param: { token } });
    expect(res.status).toBe(201);
    const joined = await res.json();
    expect(joined).toEqual({ groupId: group.id, memberId: expect.any(String) });

    const members = (await detail()).members;
    expect(members).toHaveLength(2);
    expect(members[1]).toEqual({
      id: 'memberId' in joined ? joined.memberId : '',
      groupId: group.id,
      displayName: 'bartek',
      userId: bartek.userId,
      attendance: null,
    });
    // The new member now sees the group.
    expect((await detail(bartek)).id).toBe(group.id);
    expect(await parseResponse(link(bartek).$get({ param: { token } }))).toMatchObject({ isMember: true, memberCount: 2 });
  });

  it('joining a group you are already in just returns your member', async () => {
    const { ania, group, token, detail } = await setup();
    const bartek = await signIn('bartek@example.com');
    const first = await parseResponse(link(bartek).join.$post({ param: { token } }));

    const again = await link(bartek).join.$post({ param: { token } });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);

    const owner = await link(ania).join.$post({ param: { token } });
    expect(owner.status).toBe(200);
    expect(await owner.json()).toEqual({ groupId: group.id, memberId: group.ownerMemberId });

    expect((await detail()).members).toHaveLength(2);
  });

  it('two concurrent joins by the same user add one member', async () => {
    const { token, detail } = await setup();
    const bartek = await signIn('bartek@example.com');
    const results = await Promise.all([1, 2, 3].map(() => link(bartek).join.$post({ param: { token } })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect((await detail()).members).toHaveLength(2);
  });

  it('revoking replaces the token; the revoked token no longer works', async () => {
    const { ania, group, token, detail } = await setup();
    const bartek = await signIn('bartek@example.com');
    await parseResponse(link(bartek).join.$post({ param: { token } }));

    // Any member may revoke, not only the owner.
    const { token: fresh } = await parseResponse(
      client(bartek).groups[':groupId'].link.revoke.$post({ param: { groupId: group.id } }),
    );
    expect(fresh).not.toBe(token);
    const current = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    expect(current.token).toBe(fresh);

    const celina = await signIn('celina@example.com');
    const preview = await link(celina).$get({ param: { token } });
    expect(preview.status).toBe(404);
    expect(await preview.json()).toEqual({ error: 'not_found' });
    const join = await link(celina).join.$post({ param: { token } });
    expect(join.status).toBe(404);
    expect((await detail()).members).toHaveLength(2);

    expect((await link(celina).join.$post({ param: { token: fresh } })).status).toBe(201);
  });

  it('only members see or revoke the link of a group', async () => {
    const { group } = await setup();
    const bartek = await signIn('bartek@example.com');
    const groupLink = client(bartek).groups[':groupId'].link;
    expect((await groupLink.$get({ param: { groupId: group.id } })).status).toBe(404);
    expect((await groupLink.revoke.$post({ param: { groupId: group.id } })).status).toBe(404);
    expect((await groupLink.$get({ param: { groupId: 'not-a-uuid' } })).status).toBe(404);
  });

  it('unknown tokens answer 404 and everything needs a session', async () => {
    const { group, token } = await setup();
    const bartek = await signIn('bartek@example.com');
    expect((await link(bartek).$get({ param: { token: 'nope' } })).status).toBe(404);
    expect((await link(bartek).join.$post({ param: { token: 'nope' } })).status).toBe(404);

    expect((await client().links[':token'].$get({ param: { token } })).status).toBe(401);
    expect((await client().links[':token'].join.$post({ param: { token } })).status).toBe(401);
    expect((await client().groups[':groupId'].link.$get({ param: { groupId: group.id } })).status).toBe(401);
  });
});
