import { bigint, boolean, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { session, user } from './auth-schema';
import { groups, members } from './groups';

/**
 * Expo push tokens, one row per device. Tied to the session that registered
 * it: signing out deletes the session and with it the token; deleting the
 * account deletes both (ADR-0010).
 */
export const pushTokens = pgTable(
  'push_tokens',
  {
    token: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: uuid()
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    platform: text({ enum: ['ios', 'android'] }).notNull(),
    /** UI language on the device — notification texts use it. */
    locale: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('push_tokens_user_id_idx').on(t.userId)],
);

/** Global notifications switch (Profile). No row = on. */
export const notificationSettings = pgTable('notification_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull(),
});

/** Per-group notifications switch (Group info → settings) of a user. No row = on. */
export const groupNotificationSettings = pgTable(
  'group_notification_settings',
  {
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    enabled: boolean().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

/** "Przypomnij" nudges — one per member per group per 24 h (shared `canNudge`). */
export const nudges = pgTable(
  'nudges',
  {
    id: uuid().primaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    fromMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    toMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('nudges_group_id_to_member_id_created_at_idx').on(t.groupId, t.toMemberId, t.createdAt)],
);

/**
 * Outbox of pushes to send. Changes enqueue one row per recipient; the push
 * job groups bursts (shared `groupPushBursts`), sends them and deletes the
 * rows. Texts are rendered at send time in each device's language, from the
 * snapshots below.
 */
export const pushQueue = pgTable(
  'push_queue',
  {
    id: uuid().primaryKey(),
    recipientUserId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    kind: text({ enum: ['entryCreated', 'entryEdited', 'entryDeleted', 'claim', 'nudge', 'sync'] }).notNull(),
    /** The author (no FK: the account may be deleted before sending). */
    actorUserId: uuid(),
    /** The author's member name in the group at the time; `null` = removed (ADR-0019). */
    actorName: text(),
    entryId: uuid(),
    entryKind: text({ enum: ['expense', 'income', 'settlement'] }),
    entryTitle: text(),
    amount: bigint({ mode: 'number' }),
    currency: text(),
    /** Claimed member's name. */
    memberName: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('push_queue_created_at_idx').on(t.createdAt)],
);
