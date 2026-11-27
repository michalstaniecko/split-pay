import { I18nProvider } from '@lingui/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';
import { render } from '../../test/native-stub';

vi.mock('react-native', async () => ({ ...(await import('../../test/native-stub')).reactNative, Alert: {} }));
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('expo-image', () => ({ Image: () => <img alt="" /> }));
vi.mock('expo-router', () => ({ router: {} }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock('./moderation-query', () => ({ groupAvatarPhotosQuery: () => ({}) }));

const { ReportableMemberAvatar } = await import('./reportable-member-avatar');

// Fresh light: primary #7C3AED, onPrimary #FFFFFF.
describe('ReportableMemberAvatar', () => {
  it('passes the filled variant and initial size through to the avatar', () => {
    i18n.activate('pl');
    const html = render(
      <I18nProvider i18n={i18n}>
        <ReportableMemberAvatar
          groupId="g1"
          member={{ id: 'm1', displayName: 'Ola', isMe: false }}
          url={undefined}
          size={32}
          filled
          initialSize={14}
        />
      </I18nProvider>,
    );
    expect(html).toContain('width:32px');
    expect(html).toContain('background-color:#7C3AED');
    expect(html).toMatch(/<span style="font-weight:800;color:#FFFFFF;font-size:14px">O<\/span>/);
  });
});
