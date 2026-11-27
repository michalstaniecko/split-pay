import { I18nProvider } from '@lingui/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';
import { render } from '../../test/native-stub';

vi.mock('react-native', async () => {
  const { reactNative } = await import('../../test/native-stub');
  return {
    ...reactNative,
    TextInput: ({ accessibilityLabel }: { accessibilityLabel?: string }) => <input aria-label={accessibilityLabel} />,
    Pressable: ({ children, accessibilityLabel }: { children?: ReactNode; accessibilityLabel?: string }) => (
      <button type="button" aria-label={accessibilityLabel}>
        {children}
      </button>
    ),
  };
});
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('@/components/icon', async () => (await import('../../test/native-stub')).icon);

const { InboxSearchField } = await import('./inbox-search-field');

function renderField(value = '') {
  i18n.activate('pl');
  return render(
    <I18nProvider i18n={i18n}>
      <InboxSearchField value={value} onChange={() => undefined} />
    </I18nProvider>,
  );
}

// Fresh light: textMuted #6B6385, space(2) = 8.
describe('InboxSearchField', () => {
  it('shows a muted 16 px magnifier before the input, hidden from accessibility', () => {
    const html = renderField();
    expect(html).toMatch(/<svg data-icon="Search" width="16" stroke="#6B6385" aria-hidden="true"><\/svg><input aria-label="Szukaj grup i wydatków"/);
  });

  it('keeps 8 px between the magnifier and the input', () => {
    expect(renderField()).toMatch(/^<div style="[^"]*gap:8px/);
  });

  it('still offers the clear button once something is typed', () => {
    expect(renderField('ola')).toContain('aria-label="Wyczyść wyszukiwanie"');
  });
});
