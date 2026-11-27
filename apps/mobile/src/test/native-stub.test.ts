import { describe, expect, it } from 'vitest';
import { theme, unistyles } from './native-stub';

describe('unistyles stub', () => {
  it('passes the runtime to style factories, with zeroed safe-area insets', () => {
    const styles = unistyles.StyleSheet.create((t, rt) => ({
      screen: {
        paddingTop: rt.insets.top + t.space(2),
        paddingBottom: rt.insets.bottom,
        paddingStart: rt.insets.left,
        paddingEnd: rt.insets.right,
      },
    }));
    expect(styles).toEqual({
      screen: { paddingTop: theme.space(2), paddingBottom: 0, paddingStart: 0, paddingEnd: 0 },
    });
  });
});
