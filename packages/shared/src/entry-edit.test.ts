import { describe, expect, it } from 'vitest';
import { EntryUpdate, entryFromEdit, isEdited, toNewEntry } from './entry-edit';
import { ANIA, BARTEK, KASIA, expense, uuid } from './test-fixtures';

describe('entryFromEdit', () => {
  const current = expense({
    amount: 10_000,
    payers: [{ memberId: ANIA, amount: 10_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK] },
    version: 3,
    createdAt: '2026-07-10T10:00:00.000Z',
    updatedAt: '2026-07-10T11:00:00.000Z',
  });
  const now = '2026-07-11T08:30:00.000Z';

  it('replaces the entered fields and bumps the version, keeping who and when it was created', () => {
    const input = {
      ...toNewEntry(current),
      title: 'Pizza',
      amount: 12_000,
      payers: [{ memberId: BARTEK, amount: 12_000 }],
      split: { mode: 'equal' as const, memberIds: [ANIA, BARTEK, KASIA] },
    };
    const r = entryFromEdit(current, input, now);
    expect(r.success && r.data).toEqual({
      ...input,
      groupId: current.groupId,
      version: 4,
      createdBy: current.createdBy,
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: now,
      deletedAt: null,
    });
  });

  it('applies the Entry rules to the edited entry', () => {
    const r = entryFromEdit(current, { ...toNewEntry(current), amount: 9_000 }, now);
    expect(r.success).toBe(false);
  });

  it('cannot move an entry to another id', () => {
    const r = entryFromEdit(current, { ...toNewEntry(current), id: uuid(999) }, now);
    expect(r.success).toBe(false);
  });
});

describe('toNewEntry', () => {
  it('drops the server-owned fields', () => {
    const e = expense({ amount: 500, payers: [{ memberId: ANIA, amount: 500 }], split: { mode: 'equal', memberIds: [ANIA] } });
    expect(toNewEntry(e)).toEqual({
      kind: 'expense',
      id: e.id,
      date: e.date,
      amount: 500,
      currency: 'PLN',
      rateToBase: '1',
      title: e.title,
      category: e.category,
      receiptPhotoId: null,
      payers: [{ memberId: ANIA, amount: 500 }],
      split: { mode: 'equal', memberIds: [ANIA] },
    });
  });
});

describe('isEdited', () => {
  const base = { amount: 500, payers: [{ memberId: ANIA, amount: 500 }], split: { mode: 'equal' as const, memberIds: [ANIA] } };

  it('is false for the first version and true once the content changed', () => {
    expect(isEdited(expense({ ...base, version: 1 }))).toBe(false);
    expect(isEdited(expense({ ...base, version: 2 }))).toBe(true);
  });
});

describe('EntryUpdate', () => {
  it('needs the version the edit was based on', () => {
    const e = expense({ amount: 500, payers: [{ memberId: ANIA, amount: 500 }], split: { mode: 'equal', memberIds: [ANIA] } });
    expect(EntryUpdate.safeParse({ baseVersion: 1, entry: toNewEntry(e) }).success).toBe(true);
    expect(EntryUpdate.safeParse({ entry: toNewEntry(e) }).success).toBe(false);
    expect(EntryUpdate.safeParse({ baseVersion: 0, entry: toNewEntry(e) }).success).toBe(false);
  });
});
