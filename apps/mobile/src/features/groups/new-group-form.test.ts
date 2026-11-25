import { describe, expect, it } from 'vitest';
import {
  GROUP_COLORS,
  GROUP_EMOJIS,
  initialNewGroupDraft,
  type NewGroupDraft,
  parseLocalGroupDraft,
  parseNewGroupDraft,
} from './new-group-form';

const ID = '7f0c4f53-2a7e-4c55-9a5c-0b8f3a3f1b11';

const draft = (overrides: Partial<NewGroupDraft> = {}): NewGroupDraft => ({
  ...initialNewGroupDraft(),
  name: 'Mazury',
  ...overrides,
});

describe('new group form', () => {
  it('starts as a group without dates in PLN, with the first emoji and colour', () => {
    expect(initialNewGroupDraft()).toEqual({
      name: '',
      emoji: GROUP_EMOJIS[0],
      color: GROUP_COLORS[0],
      baseCurrency: 'PLN',
      hasDates: false,
      startDate: '',
      endDate: '',
    });
  });

  it('builds the create-group input', () => {
    const result = parseNewGroupDraft(draft({ name: '  Mazury ', emoji: '⛵', color: '#1E88E5', baseCurrency: 'EUR' }), ID);
    expect(result).toEqual({
      ok: true,
      value: {
        id: ID,
        name: 'Mazury',
        emoji: '⛵',
        color: '#1E88E5',
        baseCurrency: 'EUR',
        startDate: null,
        endDate: null,
      },
    });
  });

  it('sends dates only when the group is a trip', () => {
    const trip = parseNewGroupDraft(draft({ hasDates: true, startDate: '2026-07-10', endDate: '2026-07-14' }), ID);
    expect(trip).toMatchObject({ ok: true, value: { startDate: '2026-07-10', endDate: '2026-07-14' } });

    const noTrip = parseNewGroupDraft(draft({ hasDates: false, startDate: '2026-07-10', endDate: 'garbage' }), ID);
    expect(noTrip).toMatchObject({ ok: true, value: { startDate: null, endDate: null } });
  });

  it('reports a missing name', () => {
    expect(parseNewGroupDraft(draft({ name: '   ' }), ID)).toEqual({ ok: false, errors: ['name'] });
  });

  it('reports invalid, missing and reversed trip dates on the right field', () => {
    expect(parseNewGroupDraft(draft({ hasDates: true, startDate: '10.07.2026', endDate: '2026-07-14' }), ID)).toEqual({
      ok: false,
      errors: ['startDate'],
    });
    expect(parseNewGroupDraft(draft({ hasDates: true, startDate: '2026-07-10', endDate: '' }), ID)).toEqual({
      ok: false,
      errors: ['endDate'],
    });
    expect(parseNewGroupDraft(draft({ hasDates: true, startDate: '2026-07-15', endDate: '2026-07-14' }), ID)).toEqual({
      ok: false,
      errors: ['endDate'],
    });
  });

  it('reports several fields at once', () => {
    const result = parseNewGroupDraft(draft({ name: '', hasDates: true, startDate: '', endDate: '' }), ID);
    expect(result).toEqual({ ok: false, errors: ['name', 'startDate', 'endDate'] });
  });
});

describe('new local group form', () => {
  const ME = '7f0c4f53-2a7e-4c55-9a5c-0b8f3a3f1b12';
  const ANIA = '7f0c4f53-2a7e-4c55-9a5c-0b8f3a3f1b13';
  const BARTEK = '7f0c4f53-2a7e-4c55-9a5c-0b8f3a3f1b14';

  it('builds the local group with the device member and the people typed in, skipping empty rows', () => {
    const result = parseLocalGroupDraft(
      draft({ name: 'Pizza', baseCurrency: 'CZK', hasDates: true, startDate: '2026-07-10', endDate: '2026-07-14' }),
      ID,
      { id: ME, name: ' Michał ' },
      [
        { id: ANIA, name: 'Ania ' },
        { id: BARTEK, name: '  ' },
      ],
    );
    expect(result).toEqual({
      ok: true,
      value: {
        id: ID,
        name: 'Pizza',
        emoji: GROUP_EMOJIS[0],
        color: GROUP_COLORS[0],
        baseCurrency: 'CZK',
        deviceMember: { id: ME, displayName: 'Michał' },
        people: [{ id: ANIA, displayName: 'Ania' }],
      },
    });
  });

  it("reports a missing group name and the device member's name", () => {
    expect(parseLocalGroupDraft(draft({ name: '' }), ID, { id: ME, name: ' ' }, [])).toEqual({
      ok: false,
      errors: ['name', 'deviceMember'],
    });
  });
});
