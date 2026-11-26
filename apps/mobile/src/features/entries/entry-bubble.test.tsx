import { I18nProvider } from '@lingui/react';
import type { Entry } from '@split-pay/shared';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';
import { render } from '../../test/native-stub';
import type { EntryItem } from './conversation';

vi.mock('react-native', async () => (await import('../../test/native-stub')).reactNative);
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('expo-image', () => ({ Image: () => <img alt="" /> }));
vi.mock('../../i18n/locale-provider', () => ({ useLocale: () => ({ locale: 'pl' }) }));
// The query module pulls in the API client and offline store; the bubble only needs the icons.
vi.mock('./entries-query', () => ({ CATEGORY_ICONS: { food: '🍕' } }));

const { EntryBubble } = await import('./entry-bubble');

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const dinner: Extract<Entry, { kind: 'expense' }> = {
  kind: 'expense',
  id: id(1),
  groupId: id(100),
  version: 1,
  createdBy: id(200),
  createdByMember: null,
  createdAt: '2026-07-11T19:00:00.000Z',
  updatedAt: '2026-07-11T19:00:00.000Z',
  deletedAt: null,
  date: '2026-07-11',
  amount: 2_000,
  currency: 'PLN',
  rateToBase: '1',
  title: 'Kolacja',
  category: 'food',
  receiptPhotoId: null,
  payers: [{ memberId: id(3), amount: 2_000 }],
  split: { mode: 'equal', memberIds: [id(1), id(3)] },
};

const item = (overrides: Partial<EntryItem> = {}): EntryItem => ({
  type: 'entry',
  key: dinner.id,
  entry: dinner,
  edited: false,
  side: 'start',
  payerId: id(3),
  payerName: 'Kasia',
  payerNames: ['Kasia'],
  otherPayers: 0,
  myShare: -1_000,
  baseAmount: null,
  ...overrides,
});

function bubble(props: { item?: EntryItem; conflict?: boolean; highlighted?: boolean } = {}) {
  i18n.activate('pl');
  return render(
    <I18nProvider i18n={i18n}>
      <EntryBubble item={props.item ?? item()} baseCurrency="PLN" highlighted={props.highlighted ?? false} onPress={() => {}} conflict={props.conflict ?? false} />
    </I18nProvider>,
  );
}

/** The author avatar's initial box and letter, as rendered. */
function avatar(html: string) {
  const match = html.match(/<div style="([^"]*width:20px;height:20px[^"]*)"><span style="([^"]*)">K<\/span><\/div>/);
  if (!match) throw new Error(`no author avatar in ${html}`);
  return { box: match[1], initial: match[2] };
}

/** The bubble's own style (the pressable carrying its border). */
function bubbleStyle(html: string) {
  const match = html.match(/<div role="button" style="([^"]*)">/);
  if (!match) throw new Error(`no bubble in ${html}`);
  return match[1];
}

// Fresh light: primary #7C3AED, onPrimary #FFFFFF, border #E7E1F7, accent #C6F432.
describe('EntryBubble author avatar', () => {
  it("others' bubbles show a primary-filled avatar with an 11 px onPrimary initial", () => {
    const { box, initial } = avatar(bubble());
    expect(box).toContain('background-color:#7C3AED');
    expect(initial).toContain('color:#FFFFFF');
    expect(initial).toContain('font-size:11px');
  });

  it('my own bubbles keep the inverted avatar, with an 11 px primary initial', () => {
    const { box, initial } = avatar(bubble({ item: item({ side: 'end' }) }));
    expect(box).toContain('background-color:#FFFFFF');
    expect(initial).toContain('color:#7C3AED');
    expect(initial).toContain('font-size:11px');
  });
});

describe('EntryBubble border', () => {
  it('a bubble with a conflict gets the accent border', () => {
    expect(bubbleStyle(bubble({ conflict: true }))).toContain('border-color:#C6F432');
  });

  it("others' bubbles without a conflict keep the plain border", () => {
    expect(bubbleStyle(bubble())).toContain('border-color:#E7E1F7');
  });
});
