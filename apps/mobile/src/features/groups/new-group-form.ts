import { type CurrencyCode, MemberName, NewGroup } from '@split-pay/shared';
import type { NewLocalGroup } from '@/features/offline/local-group-store';

/** Emoji offered in the create-group form (no free emoji input in the MVP). */
export const GROUP_EMOJIS = ['👥', '⛵', '🏔️', '🏖️', '🏠', '🍕', '🎉', '🚗', '✈️', '⛺', '🎿', '🧾'] as const;

/** Group colours (#RRGGBB) offered in the create-group form. */
export const GROUP_COLORS = [
  '#1E88E5',
  '#43A047',
  '#F4511E',
  '#8E24AA',
  '#FDD835',
  '#00ACC1',
  '#E53935',
  '#6D4C41',
] as const;

/** Base currencies offered in the form; any ISO 4217 code is valid in the model. */
export const BASE_CURRENCIES: readonly CurrencyCode[] = ['PLN', 'EUR', 'USD', 'GBP', 'CZK', 'CHF', 'HUF', 'SEK', 'NOK'];

/** What the create-group form holds while the user edits it. Dates as typed: "YYYY-MM-DD". */
export interface NewGroupDraft {
  name: string;
  emoji: string;
  color: string;
  baseCurrency: CurrencyCode;
  /** Trip switch: dates are sent only when on. */
  hasDates: boolean;
  startDate: string;
  endDate: string;
}

export type NewGroupField = 'name' | 'emoji' | 'color' | 'baseCurrency' | 'startDate' | 'endDate';
const FIELDS: readonly NewGroupField[] = ['name', 'emoji', 'color', 'baseCurrency', 'startDate', 'endDate'];

export const initialNewGroupDraft = (): NewGroupDraft => ({
  name: '',
  emoji: GROUP_EMOJIS[0],
  color: GROUP_COLORS[0],
  baseCurrency: 'PLN',
  hasDates: false,
  startDate: '',
  endDate: '',
});

export type ParsedNewGroup = { ok: true; value: NewGroup } | { ok: false; errors: NewGroupField[] };

/**
 * Validates the draft with the shared `NewGroup` schema (the same one the API
 * uses) and returns the create-group input, or the invalid fields in form order.
 */
export function parseNewGroupDraft(draft: NewGroupDraft, id: string): ParsedNewGroup {
  const result = NewGroup.safeParse({
    id,
    name: draft.name,
    emoji: draft.emoji,
    color: draft.color,
    baseCurrency: draft.baseCurrency,
    startDate: draft.hasDates ? draft.startDate.trim() : null,
    endDate: draft.hasDates ? draft.endDate.trim() : null,
  });
  if (result.success) return { ok: true, value: result.data };
  const invalid = new Set(result.error.issues.map((issue) => issue.path[0]));
  return { ok: false, errors: FIELDS.filter((field) => invalid.has(field)) };
}

/** A person typed into the local group form; `name` as typed. */
export interface PersonDraft {
  id: string;
  name: string;
}

export type LocalGroupField = Exclude<NewGroupField, 'startDate' | 'endDate'> | 'deviceMember';
export type ParsedLocalGroup = { ok: true; value: NewLocalGroup } | { ok: false; errors: LocalGroupField[] };

/**
 * The create-group input of a local group (ADR-0021): the group fields
 * (never trip dates), the device member ("Ja") and the people typed in —
 * rows left empty are skipped. Name inputs cap their length (60, `MemberName`).
 */
export function parseLocalGroupDraft(
  draft: NewGroupDraft,
  id: string,
  deviceMember: PersonDraft,
  people: readonly PersonDraft[],
): ParsedLocalGroup {
  const group = parseNewGroupDraft({ ...draft, hasDates: false }, id);
  const me = MemberName.safeParse(deviceMember.name);
  const errors: LocalGroupField[] = group.ok ? [] : (group.errors as LocalGroupField[]);
  if (!me.success) errors.push('deviceMember');
  if (!group.ok || !me.success) return { ok: false, errors };
  const { startDate: _s, endDate: _e, ...fields } = group.value;
  return {
    ok: true,
    value: {
      ...fields,
      deviceMember: { id: deviceMember.id, displayName: me.data },
      people: people
        .map((p) => ({ id: p.id, displayName: p.name.trim() }))
        .filter((p) => p.displayName !== ''),
    },
  };
}
