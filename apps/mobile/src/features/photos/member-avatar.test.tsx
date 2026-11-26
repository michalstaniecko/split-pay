import { describe, expect, it, vi } from 'vitest';
import { render } from '../../test/native-stub';

vi.mock('react-native', async () => (await import('../../test/native-stub')).reactNative);
vi.mock('react-native-unistyles', async () => (await import('../../test/native-stub')).unistyles);
vi.mock('expo-image', () => ({ Image: () => <img alt="" /> }));

const { MemberAvatar } = await import('./member-avatar');

// Fresh light: border #E7E1F7, text #1A1033, primary #7C3AED, onPrimary #FFFFFF.
describe('MemberAvatar initial fallback', () => {
  it('by default shows the initial in text colour on the border colour, at half the size', () => {
    const html = render(<MemberAvatar name="ola" size={32} />);
    expect(html).toContain('background-color:#E7E1F7');
    expect(html).toContain('color:#1A1033');
    expect(html).toContain('font-size:16px');
    expect(html).toContain('>O<');
  });

  it('filled: shows the initial in onPrimary on the primary colour', () => {
    const html = render(<MemberAvatar name="Ola" size={20} filled />);
    expect(html).toContain('background-color:#7C3AED');
    expect(html).toContain('color:#FFFFFF');
    expect(html).not.toContain('#E7E1F7');
  });

  it('takes an initial font size instead of half the avatar size', () => {
    const html = render(<MemberAvatar name="Ola" size={20} filled initialSize={11} />);
    expect(html).toContain('font-size:11px');
    expect(html).not.toContain('font-size:10px');
  });
});
