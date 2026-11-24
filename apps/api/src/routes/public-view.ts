import { type Entry, groupStats, settleUp } from '@split-pay/shared';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Db } from '../db/client';
import { members } from '../db/schema';
import { resolveLinkToken } from './claims';
import { liveEntries } from './stats';

/** Stands in for `createdBy` (a user id) in public entries: user ids are not public. */
export const HIDDEN_USER_ID = '00000000-0000-0000-0000-000000000000';

type MemberRow = typeof members.$inferSelect;

const membersOf = (db: Db, groupId: string) =>
  db.select().from(members).where(eq(members.groupId, groupId)).orderBy(asc(members.createdAt), asc(members.id));

/** A member as the public view shows it: name and attendance, no account details. */
const toPublicMember = (m: MemberRow) => ({
  id: m.id,
  displayName: m.displayName,
  hasAccount: m.userId !== null,
  attendance: m.attendance,
});

/**
 * An entry as the public view shows it: the author's user id is replaced by
 * `HIDDEN_USER_ID` and named by member instead (`addedBy`), and there is no
 * receipt photo (logged-out visitors see no photos, SPEC "Photos").
 */
function toPublicEntry(entry: Entry, memberByUser: ReadonlyMap<string, string>) {
  const addedBy = memberByUser.get(entry.createdBy) ?? null;
  return entry.kind === 'settlement'
    ? { ...entry, createdBy: HIDDEN_USER_ID, addedBy }
    : { ...entry, createdBy: HIDDEN_USER_ID, receiptPhotoId: null, addedBy };
}

/**
 * The view-only web (SPEC "Web interface", ADR-0009), mounted at
 * `/public/links/:token`. No session: the group link token (or a personal
 * claim link token) is the only key, and it scopes every answer to its group.
 * Unknown or revoked tokens answer 404. Never exposes emails, user ids,
 * payout details or photos — the web has no "Oddaj".
 */
export const publicViewRoutes = ({ db }: { db: Db }) => {
  const groupOf = async (token: string) => (await resolveLinkToken(db, token)) ?? null;
  const notFound = { error: 'not_found' as const };

  return (
    new Hono()
      // The web app runs on its own origin; nothing here uses cookies.
      .use(cors({ origin: '*', allowMethods: ['GET'] }))
      /**
       * The group, its members, and the member a personal claim link is for —
       * `null` for a group link, or once that member is claimed (plain group view).
       */
      .get('/:token', async (c) => {
        const link = await groupOf(c.req.param('token'));
        if (!link) return c.json(notFound, 404);
        const { group } = link;
        const rows = await membersOf(db, group.id);
        const claimFor = rows.some((m) => m.id === link.claimFor && m.userId === null) ? link.claimFor : null;
        return c.json(
          {
            group: {
              id: group.id,
              name: group.name,
              emoji: group.emoji,
              color: group.color,
              baseCurrency: group.baseCurrency,
              startDate: group.startDate,
              endDate: group.endDate,
              simplifyDebts: group.simplifyDebts,
              archivedAt: group.archivedAt?.toISOString() ?? null,
            },
            members: rows.map(toPublicMember),
            claimFor,
          },
          200,
        );
      })
      /** Live entries (the Conversation), ordered like the app's list. */
      .get('/:token/entries', async (c) => {
        const link = await groupOf(c.req.param('token'));
        if (!link) return c.json(notFound, 404);
        const [rows, entries] = await Promise.all([membersOf(db, link.group.id), liveEntries(db, link.group.id)]);
        const memberByUser = new Map(rows.flatMap((m) => (m.userId ? [[m.userId, m.id] as const] : [])));
        entries.sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
        return c.json(
          entries.map((e) => toPublicEntry(e, memberByUser)),
          200,
        );
      })
      /** Balances and suggested transfers (balance banner and drawer). */
      .get('/:token/balances', async (c) => {
        const link = await groupOf(c.req.param('token'));
        if (!link) return c.json(notFound, 404);
        const { group } = link;
        const [rows, entries] = await Promise.all([membersOf(db, group.id), liveEntries(db, group.id)]);
        const { balances, transfers } = settleUp(
          entries,
          group,
          rows.map((m) => m.id),
        );
        return c.json({ baseCurrency: group.baseCurrency, simplifyDebts: group.simplifyDebts, balances, transfers }, 200);
      })
      /** Group info → Stats. */
      .get('/:token/stats', async (c) => {
        const link = await groupOf(c.req.param('token'));
        if (!link) return c.json(notFound, 404);
        return c.json(groupStats(await liveEntries(db, link.group.id), link.group.baseCurrency), 200);
      })
  );
};
