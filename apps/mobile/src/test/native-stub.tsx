import { themes } from '@split-pay/ui';
import { createRequire } from 'node:module';
import type { ReactElement, ReactNode } from 'react';

/**
 * Server-rendering stand-ins for `react-native` and `react-native-unistyles`
 * in component tests: views become DOM elements carrying their flattened
 * style and accessibility role, stylesheets resolve against the Fresh light
 * theme, and every `Switch` records its props in `switches`. A `Pressable`
 * renders unpressed, with its `hitSlop` as `data-hitslop`.
 *
 *   vi.mock('react-native', async () => (await import('../test/native-stub')).reactNative);
 *   vi.mock('react-native-unistyles', async () => (await import('../test/native-stub')).unistyles);
 *   vi.mock('@/components/icon', async () => (await import('../test/native-stub')).icon);
 */
export const theme = themes.freshLight;

type Style = Record<string, unknown> | false | null | undefined | Style[];
type Props = { children?: ReactNode; style?: Style; accessibilityRole?: string };
type PressableProps = Omit<Props, 'style'> & {
  style?: Style | ((state: { pressed: boolean }) => Style);
  hitSlop?: number;
  accessibilityLabel?: string;
};

function flatten(style: Style): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style ? style : {};
}

export const switches: Record<string, unknown>[] = [];

export const reactNative = {
  View: ({ children, style, accessibilityRole }: Props) => (
    <div role={accessibilityRole} style={flatten(style)}>
      {children}
    </div>
  ),
  Text: ({ children, style, accessibilityRole }: Props) => (
    <span role={accessibilityRole} style={flatten(style)}>
      {children}
    </span>
  ),
  ScrollView: ({ children, style }: Props) => <div style={flatten(style)}>{children}</div>,
  ActivityIndicator: () => <progress />,
  Pressable: ({ children, style, accessibilityRole, hitSlop, accessibilityLabel }: PressableProps) => (
    <div
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      data-hitslop={hitSlop}
      style={flatten(typeof style === 'function' ? style({ pressed: false }) : style)}>
      {children}
    </div>
  ),
  Switch: (props: Record<string, unknown>) => {
    switches.push(props);
    return <input type="checkbox" aria-label={String(props.accessibilityLabel)} />;
  },
};

/** The slice of the Unistyles runtime style factories read: no safe-area insets. */
export const runtime = { insets: { top: 0, bottom: 0, left: 0, right: 0 } };

export const unistyles = {
  StyleSheet: {
    create: <T,>(factory: (t: typeof theme, rt: typeof runtime) => T) => factory(theme, runtime),
  },
  useUnistyles: () => ({ theme }),
};

// The app has no @types/react-dom; only `renderToString` is used.
const { renderToString } = createRequire(import.meta.url)('react-dom/server') as {
  renderToString: (element: ReactElement) => string;
};
export const render = renderToString;

/** `@/components/icon` without Lucide and `react-native-svg`: an `<svg>` naming the icon. */
export const icon = {
  Icon: ({ name, size, color }: { name: string; size?: number; color?: string }) => (
    <svg data-icon={name} width={size} stroke={color} aria-hidden />
  ),
};
