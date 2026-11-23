import { describe, expect, it } from 'vitest';
import { type Change, changedEntryFields, isUndoable } from './history';
import { ANIA, BARTEK, GROUP, expense, uuid } from './test-fixtures';

const pizza = expense({
  title: 'Pizza',
  amount: 10_000,
  payers: [{ memberId: ANIA, amount: 10_000 }],
  split: { mode: 'equal', memberIds: [ANIA, BARTEK] },
});

const meta = { id: uuid(500), groupId: GROUP, actorMemberId: ANIA, createdAt: '2026-07-10T10:00:00.000Z' };
const change = (fields: Omit<Change, keyof typeof meta | 'undoesChangeId' | 'undoneByChangeId'>, extra: Partial<Change> = {}) =>
  ({ ...meta, undoesChangeId: null, undoneByChangeId: null, ...fields, ...extra }) as Change;

describe('changedEntryFields', () => {
  it('lists the entered fields an edit changed, in display order', () => {
    const after = { ...pizza, title: 'Pizza i napoje', amount: 12_000, date: '2026-07-11', version: 2 };
    expect(changedEntryFields(pizza, after)).toEqual(['title', 'amount', 'date']);
  });

  it('ignores server-owned fields (version, timestamps, deletion)', () => {
    const deleted = { ...pizza, version: 2, updatedAt: '2026-07-11T10:00:00Z', deletedAt: '2026-07-11T10:00:00Z' };
    expect(changedEntryFields(pizza, deleted)).toEqual([]);
  });

  it('compares payers and splits by value, not by reference', () => {
    const after = {
      ...pizza,
      payers: [{ memberId: BARTEK, amount: 10_000 }],
      split: { mode: 'equal' as const, memberIds: [ANIA, BARTEK] },
    };
    expect(changedEntryFields(pizza, after)).toEqual(['payers']);
  });

  it('reports a changed kind and the recipients of an income', () => {
    const { payers, kind: _kind, ...fields } = pizza;
    const asIncome = { ...fields, kind: 'income' as const, recipients: payers };
    expect(changedEntryFields(pizza, asIncome)).toEqual(['kind', 'payers', 'recipients']);
  });
});

describe('isUndoable', () => {
  it('entry changes, renames, attendance, settings and claims can be undone', () => {
    expect(isUndoable(change({ kind: 'entry.edit', targetId: pizza.id, before: pizza, after: { ...pizza, version: 2 } }))).toBe(true);
    expect(isUndoable(change({ kind: 'entry.create', targetId: pizza.id, before: null, after: pizza }))).toBe(true);
    expect(
      isUndoable(change({ kind: 'member.rename', targetId: BARTEK, before: { displayName: 'B' }, after: { displayName: 'Bartek' } })),
    ).toBe(true);
    expect(isUndoable(change({ kind: 'claim', targetId: BARTEK, before: null, after: { claimId: uuid(9) } }))).toBe(true);
    expect(
      isUndoable(change({ kind: 'settings.update', targetId: GROUP, before: { simplifyDebts: true }, after: { simplifyDebts: false } })),
    ).toBe(true);
  });

  it('creating the group, adding/joining members and undoing a claim cannot be undone', () => {
    expect(isUndoable(change({ kind: 'group.create', targetId: GROUP, before: null, after: { name: 'Mazury', emoji: '⛵' } }))).toBe(
      false,
    );
    expect(isUndoable(change({ kind: 'member.add', targetId: BARTEK, before: null, after: { displayName: 'Bartek' } }))).toBe(false);
    expect(isUndoable(change({ kind: 'member.join', targetId: BARTEK, before: null, after: { displayName: 'Bartek' } }))).toBe(false);
    expect(isUndoable(change({ kind: 'claim.undo', targetId: BARTEK, before: { claimId: uuid(9) }, after: null }))).toBe(false);
  });

  it('a change that was already undone cannot be undone again', () => {
    const undone = change({ kind: 'entry.delete', targetId: pizza.id, before: pizza, after: pizza }, { undoneByChangeId: uuid(7) });
    expect(isUndoable(undone)).toBe(false);
  });
});
