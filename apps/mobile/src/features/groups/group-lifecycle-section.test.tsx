import { I18nProvider } from '@lingui/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';
import { render } from '../../test/native-stub';
import type { GroupDetail } from './groups-query';

const { balances } = vi.hoisted(() => ({ balances: { amount: 0 } }));
vi.mock('react-native', async () => ({ ...(await import('../../test/native-stub')).reactNative, Alert: {} }));
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('expo-router', () => ({ router: {} }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ isPending: false, data: { balances: [{ memberId: 'me', amount: balances.amount }] } }),
}));
vi.mock('../../i18n/locale-provider', () => ({ useLocale: () => ({ locale: 'pl' }) }));
vi.mock('../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: { user: { id: 'u1' } } }) } }));
vi.mock('../balances/balances-query', () => ({ balancesQuery: () => ({}) }));
vi.mock('../entries/conversation', () => ({ myMemberId: () => 'me' }));
const idle = { isPending: false, isError: false, mutate: vi.fn() };
vi.mock('./group-lifecycle-query', () => ({
  useDeleteGroup: () => idle,
  useLeaveGroup: () => idle,
  useSetGroupArchived: () => idle,
}));

const { GroupLifecycleSection } = await import('./group-lifecycle-section');

const group = {
  id: 'g1',
  name: 'Mazury',
  local: false,
  archivedAt: null,
  baseCurrency: 'PLN',
  ownerMemberId: 'me',
  members: [{ id: 'me', userId: 'u1' }],
} as unknown as GroupDetail;

function renderLifecycle() {
  i18n.activate('pl');
  return render(
    <I18nProvider i18n={i18n}>
      <GroupLifecycleSection group={group} />
    </I18nProvider>,
  );
}

// Fresh light: primary #7C3AED, negative #F04438.
const label = (text: string) => new RegExp(`<span style="[^"]*color:(#[0-9A-F]{6})">${text}</span>`);

describe('GroupLifecycleSection', () => {
  it('"Opuść grupę" is in the primary colour, not destructive', () => {
    expect(renderLifecycle().match(label('Opuść grupę'))?.[1]).toBe('#7C3AED');
  });

  it('"Usuń grupę na zawsze" stays negative', () => {
    expect(renderLifecycle().match(label('Usuń grupę na zawsze'))?.[1]).toBe('#F04438');
  });

  it('a blocked "Opuść grupę" is dimmed to half opacity', () => {
    balances.amount = 1500;
    const html = renderLifecycle();
    balances.amount = 0;
    expect(html).toMatch(/<div role="button" style="[^"]*opacity:0.5"><span[^>]*>Opuść grupę<\/span>/);
  });
});
