import {
  BedDouble,
  Beer,
  Bell,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Ellipsis,
  Fuel,
  HandCoins,
  type LucideIcon,
  Receipt,
  Search,
  SendHorizontal,
  ShoppingCart,
  Ticket,
  TrainFront,
  Utensils,
  X,
} from 'lucide-react-native';
import { I18nManager } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { DIRECTIONAL_ICONS, type IconName } from './icon-name';

export type { IconName } from './icon-name';

const ICONS: Record<IconName, LucideIcon> = {
  Bell,
  Ellipsis,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  Camera,
  SendHorizontal,
  Clock,
  Search,
  ShoppingCart,
  Utensils,
  TrainFront,
  Fuel,
  BedDouble,
  Beer,
  Ticket,
  Receipt,
  HandCoins,
};

const STROKE_WIDTH = 2;

export interface IconProps {
  name: IconName;
  /** Defaults to the theme's body font size. */
  size?: number;
  /** Defaults to the theme's text colour. */
  color?: string;
}

/**
 * A Lucide icon drawn in the theme's colour and size, mirrored in a
 * right-to-left layout when it points "forward" (#92). Screens use this, never
 * Lucide directly. The SVG is hidden from screen readers: the control around it
 * carries the label.
 */
export function Icon({ name, size, color }: IconProps) {
  const { theme } = useUnistyles();
  const Glyph = ICONS[name];
  const mirrored = I18nManager.isRTL && DIRECTIONAL_ICONS.has(name);
  return (
    <Glyph
      size={size ?? theme.font.sizeMd}
      color={color ?? theme.colors.text}
      strokeWidth={STROKE_WIDTH}
      style={mirrored ? { transform: [{ scaleX: -1 }] } : undefined}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    />
  );
}
