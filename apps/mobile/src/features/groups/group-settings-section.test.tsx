import { I18nProvider } from '@lingui/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';
import { render } from '../../test/native-stub';
import type { GroupDetail } from './groups-query';

vi.mock('react-native', async () => (await import('../../test/native-stub')).reactNative);
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { enabled: true }, isError: false }) }));
const idle = { isPending: false, isError: false, mutate: vi.fn() };
vi.mock('../balances/balances-query', () => ({ useUpdateGroupSettings: () => idle }));
vi.mock('../notifications/notifications-query', () => ({
  groupNotificationSettingQuery: () => ({}),
  notificationSettingQuery: () => ({}),
  useSetGroupNotificationsEnabled: () => idle,
  useSetNotificationsEnabled: () => idle,
}));

const { GroupSettingsSection } = await import('./group-settings-section');

const group = { id: 'g1', local: false, archivedAt: null, simplifyDebts: true } as unknown as GroupDetail;

function renderSettings() {
  i18n.activate('pl');
  return render(
    <I18nProvider i18n={i18n}>
      <GroupSettingsSection group={group} />
    </I18nProvider>,
  );
}

const switchRow = '<div style="flex-direction:row;align-items:center;gap:12px;min-height:44px">';

describe('GroupSettingsSection (Ustawienia)', () => {
  it('spaces its switch rows 8 apart, both directly in the section', () => {
    const html = renderSettings();
    expect(html.startsWith(`<div style="gap:8px">${switchRow}`)).toBe(true);
    expect(html.split(switchRow)).toHaveLength(3);
    // The notifications switch adds no wrapper of its own between the rows.
    expect(html).not.toContain('gap:4px');
    expect(html).toMatch(/Upraszczaj długi.*Powiadomienia z tej grupy/);
  });
});
