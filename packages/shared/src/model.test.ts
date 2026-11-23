import { describe, expect, it } from 'vitest';
import { Entry, Group, validateEntryInGroup } from './model';
import { ANIA, BARTEK, KASIA, expense, group, members, settlement, uuid } from './test-fixtures';

describe('Entry', () => {
  const valid = expense({
    amount: 10_000,
    payers: [{ memberId: ANIA, amount: 10_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
  });

  it('akceptuje poprawny wydatek', () => {
    expect(Entry.safeParse(valid).success).toBe(true);
  });

  it('odrzuca płatników niesumujących się do kwoty', () => {
    const r = Entry.safeParse({ ...valid, payers: [{ memberId: ANIA, amount: 9_000 }] });
    expect(r.success).toBe(false);
  });

  it('odrzuca podział dokładny niesumujący się do kwoty', () => {
    const r = Entry.safeParse({
      ...valid,
      split: { mode: 'exact', amounts: [{ memberId: ANIA, amount: 5_000 }] },
    });
    expect(r.success).toBe(false);
  });

  it('odrzuca pozycje osobiste większe niż kwota', () => {
    const r = Entry.safeParse({
      ...valid,
      split: { mode: 'commonPlusPersonal', commonMemberIds: [ANIA], personal: [{ memberId: BARTEK, amount: 20_000 }] },
    });
    expect(r.success).toBe(false);
  });

  it('wymaga członków części wspólnej, jeśli zostaje reszta', () => {
    const r = Entry.safeParse({
      ...valid,
      split: { mode: 'commonPlusPersonal', commonMemberIds: [], personal: [{ memberId: BARTEK, amount: 2_000 }] },
    });
    expect(r.success).toBe(false);
  });

  it('odrzuca kwoty niecałkowite i ujemne', () => {
    expect(Entry.safeParse({ ...valid, amount: 100.5 }).success).toBe(false);
    expect(Entry.safeParse({ ...valid, amount: -100 }).success).toBe(false);
  });

  it('odrzuca spłatę do samego siebie', () => {
    expect(Entry.safeParse(settlement({ amount: 100, from: ANIA, to: ANIA })).success).toBe(false);
  });

  it('odrzuca kurs w formacie float/ujemny/zerowy', () => {
    expect(Entry.safeParse({ ...valid, rateToBase: '4,27' }).success).toBe(false);
    expect(Entry.safeParse({ ...valid, rateToBase: '-1' }).success).toBe(false);
    expect(Entry.safeParse({ ...valid, rateToBase: '0.0' }).success).toBe(false);
  });
});

describe('Group', () => {
  it('wymaga obu dat albo żadnej', () => {
    expect(Group.safeParse(group).success).toBe(true);
    expect(Group.safeParse({ ...group, startDate: null, endDate: null }).success).toBe(true);
    expect(Group.safeParse({ ...group, endDate: null }).success).toBe(false);
    expect(Group.safeParse({ ...group, startDate: '2026-07-20' }).success).toBe(false);
  });
});

describe('validateEntryInGroup', () => {
  it('wykrywa nieznanych członków i zły kurs waluty bazowej', () => {
    const e = expense({
      amount: 100,
      rateToBase: '4.2',
      payers: [{ memberId: uuid(999), amount: 100 }],
      split: { mode: 'equal', memberIds: [ANIA] },
    });
    expect(validateEntryInGroup(e, group, members)).toEqual([
      'Kurs dla waluty bazowej musi wynosić 1',
      `Nieznany członek: ${uuid(999)}`,
    ]);
  });

  it('blokuje wpisy w zarchiwizowanej grupie', () => {
    const e = expense({ amount: 100, payers: [{ memberId: ANIA, amount: 100 }], split: { mode: 'equal', memberIds: [ANIA] } });
    expect(validateEntryInGroup(e, { ...group, archivedAt: '2026-08-01T00:00:00Z' }, members)).toEqual([
      'Grupa jest zarchiwizowana',
    ]);
  });
});
