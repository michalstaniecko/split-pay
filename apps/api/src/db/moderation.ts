import type { ReportReason, ReportResolution } from '@split-pay/shared';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import type { PhotoKind } from './photos';

/**
 * Content reports (DSA, #27): someone reported a photo. Kept after the photo
 * is removed (no FK on `photoId`) as the record of the decision. Accounts go
 * null when deleted (ADR-0010). Open = `resolvedAt` null.
 */
export const photoReports = pgTable(
  'photo_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    photoId: uuid().notNull(),
    photoKind: text().$type<PhotoKind>().notNull(),
    /** Who uploaded the photo — the account an admin may block. */
    reportedUserId: uuid().references(() => user.id, { onDelete: 'set null' }),
    reporterId: uuid().references(() => user.id, { onDelete: 'set null' }),
    reason: text().$type<ReportReason>().notNull(),
    details: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolution: text().$type<ReportResolution>(),
    /** Email of the admin who closed the report. */
    resolvedBy: text(),
  },
  (t) => [index('photo_reports_photo_id_idx').on(t.photoId), index('photo_reports_resolved_at_idx').on(t.resolvedAt)],
);

/**
 * Blocked accounts (#27): no sign-in (`auth.ts` refuses new sessions), and
 * blocking deletes their sessions. Removing the row unblocks.
 */
export const accountBlocks = pgTable('account_blocks', {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  reason: text().notNull(),
  /** Email of the admin who blocked the account. */
  blockedBy: text().notNull(),
  blockedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
