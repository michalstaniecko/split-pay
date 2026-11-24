import type { Change, Expense, Settlement } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { activateLocale } from '../../i18n/i18n';
import { describeChange } from './describe-change';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const ANIA = id(1);
const BARTEK = id(2);
const KASIA = id(3);
const names: Record<string, string> = { [ANIA]: 'Ania', [BARTEK]: 'Bartek', [KASIA]: 'Kasia' };

const pizza: Expense = {
  kind: 'expense',
  id: id(500),
  groupId: id(100),
  version: 1,
  createdBy: id(200),
  createdByMember: null,
  createdAt: '2026-07-11T10:00:00.000Z',
  updatedAt: '2026-07-11T10:00:00.000Z',
  deletedAt: null,
  date: '2026-07-11',
  amount: 10_000,
  currency: 'PLN',
  rateToBase: '1',
  title: 'Pizza',
  category: 'food',
  receiptPhotoId: null,
  payers: [{ memberId: ANIA, amount: 10_000 }],
  split: { mode: 'equal', memberIds: [ANIA, BARTEK] },
};

const meta = {
  id: id(900),
  groupId: id(100),
  actorMemberId: ANIA,
  createdAt: '2026-07-11T12:00:00.000Z',
  undoesChangeId: null,
  undoneByChangeId: null,
};

// Intl separates groups with (narrow) no-break spaces; normalise them.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
function describe_(locale: 'pl' | 'en', change: Record<string, unknown>) {
  activateLocale(locale);
  const d = describeChange({ ...meta, ...change } as Change, {
    locale,
    memberName: (memberId) => names[memberId] ?? '?',
    categoryName: (category) => (locale === 'pl' ? { food: 'Jedzenie', other: 'Inne' } : { food: 'Food', other: 'Other' })[category as 'food'] ?? category,
    splitModeName: (mode) => (locale === 'pl' ? 'Po równo' : 'Equally') + (mode === 'equal' ? '' : ` (${mode})`),
  });
  return { title: plain(d.title), details: d.details.map(plain) };
}

describe('describeChange', () => {
  it('describes added, deleted and restored entries with their amount (PL/EN)', () => {
    const create = { kind: 'entry.create', targetId: pizza.id, before: null, after: pizza };
    expect(describe_('pl', create)).toEqual({ title: 'Dodano wydatek „Pizza”, 100,00 zł', details: [] });
    expect(describe_('en', create)).toEqual({ title: 'Added expense “Pizza”, PLN 100.00', details: [] });

    const deleted = { ...pizza, deletedAt: '2026-07-12T10:00:00.000Z' };
    expect(describe_('pl', { kind: 'entry.delete', targetId: pizza.id, before: pizza, after: deleted }).title).toBe(
      'Usunięto wydatek „Pizza”, 100,00 zł',
    );
    expect(describe_('en', { kind: 'entry.restore', targetId: pizza.id, before: deleted, after: pizza }).title).toBe(
      'Restored expense “Pizza”, PLN 100.00',
    );
  });

  it('names a settlement by who paid whom', () => {
    const settlement: Settlement = {
      ...pizza,
      kind: 'settlement',
      from: BARTEK,
      to: ANIA,
      amount: 5_000,
    } as unknown as Settlement;
    expect(describe_('pl', { kind: 'entry.create', targetId: pizza.id, before: null, after: settlement }).title).toBe(
      'Dodano spłatę Bartek → Ania, 50,00 zł',
    );
  });

  it('lists what an edit changed, before → after', () => {
    const after: Expense = {
      ...pizza,
      version: 2,
      title: 'Pizza i napoje',
      amount: 12_000,
      date: '2026-07-12',
      category: 'other',
      payers: [{ memberId: BARTEK, amount: 12_000 }],
      split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
    };
    expect(describe_('pl', { kind: 'entry.edit', targetId: pizza.id, before: pizza, after })).toEqual({
      title: 'Zmieniono wydatek „Pizza i napoje”',
      details: [
        'Tytuł: „Pizza” → „Pizza i napoje”',
        'Kwota: 100,00 zł → 120,00 zł',
        'Data: 11 lipca 2026 → 12 lipca 2026',
        'Kategoria: Jedzenie → Inne',
        'Kto zapłacił: Ania → Bartek',
        'Podział: Po równo · Ania, Bartek → Po równo · Ania, Bartek, Kasia',
      ],
    });
    expect(describe_('en', { kind: 'entry.edit', targetId: pizza.id, before: pizza, after }).details[0]).toBe(
      'Title: “Pizza” → “Pizza i napoje”',
    );
  });

  it('names a removed name (marker) "Deleted user" in the viewer’s language (ADR-0019)', () => {
    const renamed = { kind: 'member.rename', targetId: BARTEK, before: { displayName: null }, after: { displayName: 'Bartek' } };
    expect(describe_('pl', renamed).title).toBe('Zmieniono imię: Usunięte konto → Bartek');
    expect(describe_('en', { kind: 'member.join', targetId: BARTEK, before: null, after: { displayName: null } }).title).toBe(
      'Joined the group: Deleted user',
    );
  });

  it('describes member, settings and claim changes', () => {
    expect(describe_('pl', { kind: 'member.add', targetId: KASIA, before: null, after: { displayName: 'Kasia' } }).title).toBe(
      'Dodano osobę bez konta: Kasia',
    );
    expect(describe_('en', { kind: 'member.join', targetId: BARTEK, before: null, after: { displayName: 'Bartek' } }).title).toBe(
      'Joined the group: Bartek',
    );
    expect(
      describe_('pl', {
        kind: 'member.rename',
        targetId: KASIA,
        before: { displayName: 'Kaśka' },
        after: { displayName: 'Kasia' },
      }).title,
    ).toBe('Zmieniono imię: Kaśka → Kasia');
    expect(
      describe_('pl', {
        kind: 'member.attendance',
        targetId: KASIA,
        before: { attendance: null },
        after: { attendance: [{ from: '2026-07-12', to: '2026-07-14' }] },
      }),
    ).toEqual({ title: 'Zmieniono obecność: Kasia', details: ['cały wyjazd → 12 lipca 2026 – 14 lipca 2026'] });
    expect(
      describe_('en', {
        kind: 'settings.update',
        targetId: id(100),
        before: { simplifyDebts: true },
        after: { simplifyDebts: false },
      }).title,
    ).toBe('Debt simplification turned off');
    expect(describe_('pl', { kind: 'claim', targetId: KASIA, before: null, after: { claimId: id(7) } }).title).toBe(
      'Przejęto profil Kasia',
    );
    expect(describe_('en', { kind: 'claim.undo', targetId: KASIA, before: { claimId: id(7) }, after: null }).title).toBe(
      'Undid claiming the Kasia profile',
    );
    expect(describe_('en', { kind: 'group.archive', targetId: id(100), before: null, after: null }).title).toBe(
      'Archived the group',
    );
    expect(describe_('pl', { kind: 'member.leave', targetId: BARTEK, before: null, after: null }).title).toBe(
      'Opuszczenie grupy: Bartek',
    );
    expect(describe_('pl', { kind: 'group.create', targetId: id(100), before: null, after: { name: 'Mazury', emoji: '⛵' } }).title).toBe(
      'Utworzono grupę ⛵ Mazury',
    );
  });
});
