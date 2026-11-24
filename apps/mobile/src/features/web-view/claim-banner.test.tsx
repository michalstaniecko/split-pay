import { I18nProvider } from '@lingui/react';
import { createRequire } from 'node:module';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';

// Rendered on the server with the native pieces stubbed: the test checks
// which actions the banner offers and where they lead, not how it looks.
const { openURL, openDownloadApp, buttons } = vi.hoisted(() => ({
  openURL: vi.fn(async (_url: string) => true),
  openDownloadApp: vi.fn(),
  buttons: [] as { label: string; variant?: string; onPress: () => void }[],
}));
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock('react-native-unistyles', () => ({ StyleSheet: { create: () => ({}) } }));
vi.mock('expo-linking', () => ({ openURL }));
vi.mock('./web-footer', () => ({ openDownloadApp }));
vi.mock('@/components/button', () => ({
  Button: (props: (typeof buttons)[number]) => {
    buttons.push(props);
    return <button type="button">{props.label}</button>;
  },
}));

const { ClaimBanner } = await import('./claim-banner');
const { openInAppUrl } = await import('./web-view');
// The app has no @types/react-dom; only `renderToString` is used.
const { renderToString } = createRequire(import.meta.url)('react-dom/server') as {
  renderToString: (element: ReactElement) => string;
};

function render() {
  i18n.activate('pl');
  return renderToString(
    <I18nProvider i18n={i18n}>
      <ClaimBanner displayName="Ola" token="claim-token" />
    </I18nProvider>,
  );
}

describe('ClaimBanner (personal claim link)', () => {
  beforeEach(() => {
    buttons.length = 0;
    vi.clearAllMocks();
  });

  it('names the member the link was made for', () => {
    const html = render();
    expect(html).toContain('Ola');
    expect(html).toContain('To Twój profil — przejmij go w aplikacji');
  });

  it('offers "Pobierz aplikację", which opens the store', () => {
    render();
    const download = buttons.find((b) => b.label === 'Pobierz aplikację');
    expect(download?.onPress).toBe(openDownloadApp);
  });

  it('offers "Otwórz w aplikacji", which opens the personal claim link in the app', () => {
    render();
    expect(buttons.map((b) => b.label)).toEqual(['Pobierz aplikację', 'Otwórz w aplikacji']);
    buttons.find((b) => b.label === 'Otwórz w aplikacji')!.onPress();
    expect(openURL).toHaveBeenCalledWith(openInAppUrl('claim-token'));
    expect(openURL.mock.calls[0]![0]).toContain('claim-token');
  });
});
