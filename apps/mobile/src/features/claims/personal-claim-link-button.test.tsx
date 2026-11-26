import { I18nProvider } from '@lingui/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n/i18n';
import { render } from '../../test/native-stub';

vi.mock('react-native', async () => ({ ...(await import('../../test/native-stub')).reactNative, Alert: {}, Share: {} }));
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('@tanstack/react-query', () => ({ useMutation: () => ({ isPending: false, mutate: () => undefined }) }));
vi.mock('./claims-query', () => ({ fetchClaimLink: vi.fn() }));

const { PersonalClaimLinkButton } = await import('./personal-claim-link-button');

function renderButton() {
  i18n.activate('pl');
  return render(
    <I18nProvider i18n={i18n}>
      <PersonalClaimLinkButton groupId="g1" groupName="Mazury" member={{ id: 'm1', displayName: 'Ola' }} />
    </I18nProvider>,
  );
}

// Fresh light: primary #7C3AED, radius.pill 999, sizeSm 13, weightBold 800.
describe('PersonalClaimLinkButton ("Wyślij link")', () => {
  it('is an outlined primary pill, 36 high with 12 side padding', () => {
    const html = renderButton();
    expect(html).toMatch(/role="button"[^>]*style="[^"]*min-height:36px/);
    expect(html).toContain('padding-horizontal:12px');
    expect(html).toContain('border-width:1px');
    expect(html).toContain('border-color:#7C3AED');
    expect(html).toContain('border-radius:999px');
    expect(html).toMatch(/<span style="font-size:13px;font-weight:800;color:#7C3AED">Wyślij link<\/span>/);
  });

  it('keeps a 44 pt touch target through hitSlop', () => {
    expect(renderButton()).toContain('data-hitslop="4"');
  });
});
