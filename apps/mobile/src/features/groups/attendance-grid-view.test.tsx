import { I18nProvider } from '@lingui/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';
import { render } from '../../test/native-stub';
import type { GroupDetail } from './groups-query';

vi.mock('react-native', async () => (await import('../../test/native-stub')).reactNative);
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('@/components/icon', async () => (await import('../../test/native-stub')).icon);
vi.mock('../../i18n/locale-provider', () => ({ useLocale: () => ({ locale: 'pl' }) }));
vi.mock('./attendance-query', () => ({ useSaveAttendance: () => ({ isPending: false, isError: false, mutate: vi.fn() }) }));

const { AttendanceGridView } = await import('./attendance-grid-view');

const group = {
  id: 'g1',
  startDate: '2026-07-01',
  endDate: '2026-07-02',
  members: [
    { id: 'm1', displayName: 'Ola', attendance: null },
    { id: 'm2', displayName: 'Bartłomiej Wiśniewski-Kowalczyk', attendance: null },
  ],
} as unknown as GroupDetail;

function renderGrid() {
  i18n.activate('pl');
  return render(
    <I18nProvider i18n={i18n}>
      <AttendanceGridView group={group} />
    </I18nProvider>,
  );
}

// Fresh light: textMuted #6B6385, sizeSm 13, weightBold 800.
describe('AttendanceGridView layout', () => {
  it('titles the grid "Obecność" in small muted text at normal weight', () => {
    expect(renderGrid()).toMatch(/<span style="font-size:13px;color:#6B6385">Obecność<\/span>/);
  });

  it('starts at the top of its card: no extra top padding', () => {
    expect(renderGrid()).toMatch(/^<div style="gap:8px">/);
  });

  it('gives every name a fixed 96 px column, so the day columns line up', () => {
    const html = renderGrid();
    const nameCells = html.match(/<div style="height:44px;justify-content:center;width:96px">/g) ?? [];
    expect(nameCells).toHaveLength(2);
    expect(html).not.toContain('max-width');
    expect(html).not.toContain('padding-end');
  });
});
