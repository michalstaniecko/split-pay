import type { ChangeKind } from '@split-pay/shared';
import { bigint, index, uniqueIndex, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { groups } from './groups';

/**
 * Change history (GLOSSARY, ADR-0008, #20): one row per change in a group,
 * written in the same transaction as the change itself. `before`/`after` are
 * the shared `ChangeData` snapshots for `kind`; an undo is an ordinary row
 * pointing at the undone change (`undoesChangeId`). Rows are never updated
 * (except names scrubbed by account deletion).
 */
export const changes = pgTable(
  'changes',
  {
    id: uuid().primaryKey(),
    /** Insertion order — timestamps tie within one transaction. */
    seq: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    kind: text().$type<ChangeKind>().notNull(),
    /** The entry, member or group the change is about (no FK — see `ChangeData`). */
    targetId: uuid().notNull(),
    /** The member who made it (no FK). */
    actorMemberId: uuid(),
    before: jsonb(),
    after: jsonb(),
    undoesChangeId: uuid(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('changes_group_id_seq_idx').on(t.groupId, t.seq),
    index('changes_group_id_target_id_idx').on(t.groupId, t.targetId),
    // A change is undone at most once (concurrent undos: one wins).
    uniqueIndex('changes_undoes_change_id_key').on(t.undoesChangeId),
  ],
);
