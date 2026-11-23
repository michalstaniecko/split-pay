import type { Change } from '@split-pay/shared';
import { DetailedError } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { canUndo, undoFailure, undoLosesAccess } from './history';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const change = (fields: Partial<Change>): Change =>
  ({
    id: id(900),
    groupId: id(100),
    actorMemberId: id(1),
    createdAt: '2026-07-11T12:00:00.000Z',
    undoesChangeId: null,
    undoneByChangeId: null,
    kind: 'member.rename',
    targetId: id(3),
    before: { displayName: 'A' },
    after: { displayName: 'B' },
    ...fields,
  }) as Change;

const open = { archivedAt: null };
const archived = { archivedAt: '2026-08-01T00:00:00.000Z' };

describe('canUndo', () => {
  it('offers "Cofnij" for undoable changes not undone yet', () => {
    expect(canUndo(change({}), open)).toBe(true);
    expect(canUndo(change({ undoneByChangeId: id(901) }), open)).toBe(false);
    expect(canUndo(change({ kind: 'member.add', before: null, after: { displayName: 'A' } }), open)).toBe(false);
  });

  it('an archived group is read-only', () => {
    expect(canUndo(change({}), archived)).toBe(false);
  });
});

describe('undoLosesAccess', () => {
  it('undoing the claim of my own member removes me from the group', () => {
    const claim = change({ kind: 'claim', targetId: id(3), before: null, after: { claimId: id(900) } });
    expect(undoLosesAccess(claim, id(3))).toBe(true);
    expect(undoLosesAccess(claim, id(4))).toBe(false);
    expect(undoLosesAccess(change({ targetId: id(3) }), id(3))).toBe(false);
  });
});

describe('undoFailure', () => {
  const failed = (status: number, data: unknown) =>
    new DetailedError(`${status}`, { statusCode: status, detail: { data, statusText: '' } });

  it('tells a later change apart from other failures', () => {
    expect(undoFailure(failed(409, { error: 'version_conflict', entry: {} }))).toBe('changedSince');
    expect(undoFailure(failed(409, { error: 'changed_since' }))).toBe('changedSince');
    expect(undoFailure(failed(403, { error: 'forbidden' }))).toBe('forbidden');
    expect(undoFailure(failed(400, { error: 'not_undoable' }))).toBe('notUndoable');
    expect(undoFailure(failed(400, { error: 'invalid_entry', issues: [] }))).toBe('invalid');
    expect(undoFailure(failed(409, { error: 'archived' }))).toBe('invalid');
    expect(undoFailure(new Error('network'))).toBe('unknown');
  });
});
