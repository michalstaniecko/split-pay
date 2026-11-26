import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, switches } from '../test/native-stub';

vi.mock('react-native', async () => (await import('../test/native-stub')).reactNative);
vi.mock('react-native-unistyles', async () => (await import('../test/native-stub')).unistyles);

const { SettingSwitch } = await import('./setting-switch');

// Fresh light: primary #7C3AED, border #E7E1F7, textMuted #6B6385.
describe('SettingSwitch', () => {
  beforeEach(() => {
    switches.length = 0;
  });

  it('shows the label and the hint next to a switch named by the label', () => {
    const html = render(<SettingSwitch label="Upraszczaj długi" hint="Najmniej przelewów." value onValueChange={() => {}} />);
    expect(html).toContain('Upraszczaj długi');
    expect(html).toMatch(/<span style="font-size:13px;color:#6B6385">Najmniej przelewów.<\/span>/);
    expect(switches[0]).toMatchObject({ accessibilityLabel: 'Upraszczaj długi', value: true });
  });

  it('has a primary on-track, a border off-track and a white thumb on every platform', () => {
    render(<SettingSwitch label="Powiadomienia" value={false} onValueChange={() => {}} />);
    expect(switches[0]).toMatchObject({
      trackColor: { true: '#7C3AED', false: '#E7E1F7' },
      thumbColor: '#FFFFFF',
      ios_backgroundColor: '#E7E1F7',
    });
  });

  it('passes the toggle on and can be disabled', () => {
    const onValueChange = vi.fn();
    render(<SettingSwitch label="Powiadomienia" value={false} onValueChange={onValueChange} disabled />);
    expect(switches[0]).toMatchObject({ disabled: true });
    (switches[0]!.onValueChange as (v: boolean) => void)(true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
