import { describe, expect, it, vi } from 'vitest';
import { render } from '../test/native-stub';

vi.mock('react-native', async () => (await import('../test/native-stub')).reactNative);
vi.mock('react-native-unistyles', async () => (await import('../test/native-stub')).unistyles);

const { PlaceholderScreen } = await import('./placeholder-screen');

// space(6) = 24.
describe('PlaceholderScreen', () => {
  it('pads 24 on every side by default', () => {
    const html = render(<PlaceholderScreen title="Aktywność" />);
    expect(html).toMatch(/^<div style="[^"]*padding:24px/);
    expect(html).not.toContain('padding-bottom');
  });

  it('can end with a taller bottom padding while the sides and top stay 24 (Profile)', () => {
    const html = render(<PlaceholderScreen title="Profil" paddingBottom={56} />);
    expect(html).toMatch(/^<div style="[^"]*padding:24px;[^"]*padding-bottom:56px/);
  });
});
