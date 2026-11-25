import { describe, expect, it } from 'vitest';
import {
  addPerson,
  defaultQuickBillCurrency,
  initialQuickBillDraft,
  parseLocalQuickBillDraft,
  parseQuickBillDraft,
  removePerson,
  withQuickBillCurrency,
} from './quick-bill-form';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const ids = { groupId: id(1), expenseId: id(2) };
const context = { ...ids, currency: 'PLN', color: '#1E88E5', today: '2026-11-23' };

describe('quick bill chips', () => {
  it('adds a trimmed name as a chip with the given id and clears the typed name', () => {
    const draft = addPerson({ ...initialQuickBillDraft(), personName: '  Kasia ' }, id(10));
    expect(draft.people).toEqual([{ id: id(10), displayName: 'Kasia' }]);
    expect(draft.personName).toBe('');
  });

  it('ignores an empty name', () => {
    const draft = addPerson({ ...initialQuickBillDraft(), personName: '   ' }, id(10));
    expect(draft.people).toEqual([]);
  });

  it('removes a chip', () => {
    let draft = addPerson({ ...initialQuickBillDraft(), personName: 'Kasia' }, id(10));
    draft = addPerson({ ...draft, personName: 'Tomek' }, id(11));
    expect(removePerson(draft, id(10)).people).toEqual([{ id: id(11), displayName: 'Tomek' }]);
  });
});

describe('parseQuickBillDraft', () => {
  const draft = { amount: '120,50', title: 'Pizza', personName: '', people: [{ id: id(10), displayName: 'Kasia' }] };

  it('builds the quick bill dated today', () => {
    expect(parseQuickBillDraft(draft, context)).toEqual({
      ok: true,
      value: { ...ids, title: 'Pizza', amount: 12_050, currency: 'PLN', date: '2026-11-23', color: '#1E88E5', people: draft.people },
    });
  });

  it('counts a name still typed in the field as a chip', () => {
    const parsed = parseQuickBillDraft({ ...draft, people: [], personName: 'Tomek' }, { ...context, pendingPersonId: id(11) });
    expect(parsed.ok && parsed.value.people).toEqual([{ id: id(11), displayName: 'Tomek' }]);
  });

  it('lists invalid fields', () => {
    expect(parseQuickBillDraft({ amount: '', title: ' ', personName: '', people: [] }, context)).toEqual({
      ok: false,
      errors: ['amount', 'title', 'people'],
    });
  });
});

describe('defaultQuickBillCurrency', () => {
  it("uses the device region's currency when it is offered", () => {
    expect(defaultQuickBillCurrency('EUR')).toBe('EUR');
  });

  it('falls back to PLN when the region currency is unknown', () => {
    expect(defaultQuickBillCurrency(null)).toBe('PLN');
    expect(defaultQuickBillCurrency(undefined)).toBe('PLN');
    expect(defaultQuickBillCurrency('')).toBe('PLN');
  });

  it('falls back to PLN when the region currency is not offered', () => {
    expect(defaultQuickBillCurrency('BRL')).toBe('PLN');
    expect(defaultQuickBillCurrency('eur?')).toBe('PLN');
  });
});

describe('withQuickBillCurrency', () => {
  it("trims the typed amount to the new currency's minor digits", () => {
    const draft = { ...initialQuickBillDraft(), amount: '12,345' };
    expect(withQuickBillCurrency(draft, 'KWD').amount).toBe('12,345');
    expect(withQuickBillCurrency(draft, 'EUR').amount).toBe('12,34');
  });
});

describe('parseLocalQuickBillDraft (without an account)', () => {
  const draft = { amount: '90', title: 'Pizza', personName: '', people: [{ id: id(10), displayName: 'Kasia' }] };
  const me = id(20);

  it('adds the device member ("Ja") who pays, with a trimmed name', () => {
    expect(parseLocalQuickBillDraft(draft, { ...context, deviceMember: { id: me, name: ' Michał ' } })).toEqual({
      ok: true,
      value: {
        ...ids,
        title: 'Pizza',
        amount: 9000,
        currency: 'PLN',
        date: '2026-11-23',
        color: '#1E88E5',
        people: draft.people,
        deviceMember: { id: me, displayName: 'Michał' },
      },
    });
  });

  it('asks for my name together with the other invalid fields', () => {
    expect(
      parseLocalQuickBillDraft({ ...draft, title: ' ' }, { ...context, deviceMember: { id: me, name: '  ' } }),
    ).toEqual({ ok: false, errors: ['title', 'deviceMember'] });
  });
});
