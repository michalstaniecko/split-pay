import { zValidator } from '@hono/zod-validator';
import { AccountBlockRequest, Id, PhotoReportRequest } from '@split-pay/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Db } from '../db/client';
import { accountBlocks, members, photoReports, photos, session, user } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import type { ObjectStorage } from '../storage/object-storage';
import { findMyGroup } from './group-access';
import { deletePhotos, READ_URL_SECONDS } from './photos';

/**
 * Content reporting and moderation (#27, DSA; SPEC "Photos").
 * - `POST /reports`: anyone signed in reports a photo they can see — a
 *   receipt of their group, the avatar of someone sharing a group with them.
 *   Anything else is 404 (existence not revealed); the answer carries
 *   nothing beyond "reported", so a report grants no access.
 * - `/admin/*`: app-wide admins (ADMIN_EMAILS allowlist, no group roles —
 *   ADR-0008) review open reports, remove photos, dismiss reports, and
 *   block/unblock accounts. A blocked account loses its sessions (401). It
 *   can sign in again, but that session reaches only `/me` and account
 *   deletion (#48); everything else is 403 `account_blocked`.
 */

const notFound = { error: 'not_found' as const };

/** True when an admin blocked the account. */
export async function isAccountBlocked(db: Pick<Db, 'select'>, userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: accountBlocks.userId }).from(accountBlocks).where(eq(accountBlocks.userId, userId));
  return !!row;
}

/** Do the two users share a group? */
async function shareAGroup(db: Db, a: string, b: string): Promise<boolean> {
  const other = alias(members, 'other');
  const [row] = await db
    .select({ groupId: members.groupId })
    .from(members)
    .innerJoin(other, and(eq(other.groupId, members.groupId), eq(other.userId, b)))
    .where(eq(members.userId, a))
    .limit(1);
  return !!row;
}

/** The photo, if `userId` can see it in the app (receipt: group member; avatar: current, shares a group). */
async function visiblePhoto(db: Db, photoId: string, userId: string) {
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
  if (!photo) return undefined;
  if (photo.kind === 'receipt') {
    return photo.groupId && (await findMyGroup(db, photo.groupId, userId)) ? photo : undefined;
  }
  if (!photo.attachedAt || !photo.uploadedBy) return undefined;
  return photo.uploadedBy === userId || (await shareAGroup(db, userId, photo.uploadedBy)) ? photo : undefined;
}

/** Reporting a photo, mounted at `/reports`. */
export const reportRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) =>
  new Hono<AuthEnv>().use(requireUser).post('/', zValidator('json', PhotoReportRequest), async (c) => {
    const reporterId = c.get('user').id;
    const { photoId, reason, details } = c.req.valid('json');
    const photo = await visiblePhoto(db, photoId, reporterId);
    if (!photo) return c.json(notFound, 404);
    // One open report per reporter and photo; repeating it changes nothing.
    const [open] = await db
      .select({ id: photoReports.id })
      .from(photoReports)
      .where(and(eq(photoReports.photoId, photoId), eq(photoReports.reporterId, reporterId), isNull(photoReports.resolvedAt)));
    if (!open) {
      await db.insert(photoReports).values({
        photoId,
        photoKind: photo.kind,
        reportedUserId: photo.uploadedBy,
        reporterId,
        reason,
        details,
      });
    }
    return c.json({ reported: true as const }, 201);
  });

/** The admin panel API, mounted at `/admin`. */
export const adminRoutes = ({
  db,
  requireUser,
  requireAdmin,
  storage,
}: {
  db: Db;
  requireUser: MiddlewareHandler<AuthEnv>;
  requireAdmin: MiddlewareHandler<AuthEnv>;
  storage: ObjectStorage | undefined;
}) => {
  const reporter = alias(user, 'reporter');
  const reported = alias(user, 'reported');
  const closeReports = (where: ReturnType<typeof and>, resolution: 'removed' | 'dismissed', adminEmail: string) =>
    db
      .update(photoReports)
      .set({ resolvedAt: new Date(), resolution, resolvedBy: adminEmail })
      .where(and(where, isNull(photoReports.resolvedAt)))
      .returning({ id: photoReports.id });

  return (
    new Hono<AuthEnv>()
      .use(requireUser)
      .use(requireAdmin)
      /** Open reports, oldest first, with a short-lived URL of the photo (null once removed). */
      .get('/reports', async (c) => {
        const rows = await db
          .select({
            report: photoReports,
            photo: photos,
            reporter: { id: reporter.id, email: reporter.email },
            reported: { id: reported.id, email: reported.email, name: reported.name },
            blockedAt: accountBlocks.blockedAt,
          })
          .from(photoReports)
          .leftJoin(photos, eq(photos.id, photoReports.photoId))
          .leftJoin(reporter, eq(reporter.id, photoReports.reporterId))
          .leftJoin(reported, eq(reported.id, photoReports.reportedUserId))
          .leftJoin(accountBlocks, eq(accountBlocks.userId, photoReports.reportedUserId))
          .where(isNull(photoReports.resolvedAt))
          .orderBy(asc(photoReports.createdAt));
        const reports = await Promise.all(
          rows.map(async (r) => ({
            id: r.report.id,
            reason: r.report.reason,
            details: r.report.details,
            createdAt: r.report.createdAt.toISOString(),
            photo: r.photo
              ? {
                  id: r.photo.id,
                  kind: r.photo.kind,
                  groupId: r.photo.groupId,
                  entryId: r.photo.entryId,
                  url: storage
                    ? await storage.signedReadUrl(r.photo.objectKey, { expiresInSeconds: READ_URL_SECONDS })
                    : null,
                }
              : null,
            reporter: r.reporter,
            reportedUser: r.reported ? { ...r.reported, blocked: r.blockedAt !== null } : null,
          })),
        );
        return c.json({ reports }, 200);
      })
      /** Closes a report without action. */
      .post('/reports/:reportId/dismiss', async (c) => {
        const reportId = c.req.param('reportId');
        if (!Id.safeParse(reportId).success) return c.json(notFound, 404);
        const closed = await closeReports(eq(photoReports.id, reportId), 'dismissed', c.get('user').email);
        if (closed.length === 0) return c.json(notFound, 404);
        return c.json({ dismissed: true as const }, 200);
      })
      /** Removes a photo (bucket object + row) and closes its open reports. */
      .delete('/photos/:photoId', async (c) => {
        const photoId = c.req.param('photoId');
        if (!Id.safeParse(photoId).success) return c.json(notFound, 404);
        const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
        if (!photo) return c.json(notFound, 404);
        await deletePhotos(db, storage, [photo]);
        await closeReports(eq(photoReports.photoId, photoId), 'removed', c.get('user').email);
        return c.json({ removed: true as const }, 200);
      })
      /** Blocked accounts (to unblock them). */
      .get('/users/blocked', async (c) => {
        const rows = await db
          .select({
            id: user.id,
            email: user.email,
            name: user.name,
            reason: accountBlocks.reason,
            blockedBy: accountBlocks.blockedBy,
            blockedAt: accountBlocks.blockedAt,
          })
          .from(accountBlocks)
          .innerJoin(user, eq(user.id, accountBlocks.userId))
          .orderBy(asc(accountBlocks.blockedAt));
        return c.json({ blocked: rows.map((r) => ({ ...r, blockedAt: r.blockedAt.toISOString() })) }, 200);
      })
      /** Blocks an account: its sessions end; signing in again leads only to account deletion (#48). 400 for yourself. */
      .post('/users/:userId/block', zValidator('json', AccountBlockRequest), async (c) => {
        const userId = c.req.param('userId');
        if (!Id.safeParse(userId).success) return c.json(notFound, 404);
        const admin = c.get('user');
        if (userId === admin.id) return c.json({ error: 'cannot_block_self' as const }, 400);
        const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
        if (!target) return c.json(notFound, 404);
        const { reason } = c.req.valid('json');
        await db.transaction(async (tx) => {
          await tx
            .insert(accountBlocks)
            .values({ userId, reason, blockedBy: admin.email })
            .onConflictDoUpdate({ target: accountBlocks.userId, set: { reason, blockedBy: admin.email, blockedAt: new Date() } });
          // Push tokens go with the sessions (FK cascade).
          await tx.delete(session).where(eq(session.userId, userId));
        });
        return c.json({ blocked: true as const }, 200);
      })
      /** Unblocks an account; its sessions get normal access on the next request. */
      .delete('/users/:userId/block', async (c) => {
        const userId = c.req.param('userId');
        if (!Id.safeParse(userId).success) return c.json(notFound, 404);
        await db.delete(accountBlocks).where(eq(accountBlocks.userId, userId));
        return c.json({ blocked: false as const }, 200);
      })
  );
};
