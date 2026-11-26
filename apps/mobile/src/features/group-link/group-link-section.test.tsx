import { I18nProvider } from '@lingui/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';
import { render } from '../../test/native-stub';

vi.mock('react-native', async () => ({ ...(await import('../../test/native-stub')).reactNative, Share: {} }));
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ isPending: false, isError: false, data: { token: 'abc' } }) }));
vi.mock('./group-link-query', () => ({
  groupLinkQuery: () => ({}),
  useRevokeGroupLink: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
}));
vi.mock('../../components/button', () => ({ Button: ({ label }: { label: string }) => <button type="button">{label}</button> }));

const { GroupLinkSection } = await import('./group-link-section');

describe('GroupLinkSection (Link grupy)', () => {
  it('spaces its content 8 apart', () => {
    i18n.activate('pl');
    const html = render(
      <I18nProvider i18n={i18n}>
        <GroupLinkSection groupId="g1" groupName="Mazury" />
      </I18nProvider>,
    );
    expect(html).toMatch(/^<div style="gap:8px">/);
    expect(html).toContain('Udostępnij link');
  });
});
