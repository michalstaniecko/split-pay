import { Text } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Icon } from '@/components/icon';
import { categoryIcon, type CategoryIconKey } from './category-icon';

/**
 * A category's (or a settlement's) icon for the theme family in use: an emoji
 * in Fresh, a monochrome Lucide glyph in Classic. Place it in a row next to its
 * label, not inside a `Text`.
 */
export function CategoryIcon({ category, size, color }: { category: CategoryIconKey; size?: number; color?: string }) {
  const { theme } = useUnistyles();
  const glyph = categoryIcon(category, theme.family);
  const fontSize = size ?? theme.font.sizeMd;
  if (glyph.kind === 'icon') return <Icon name={glyph.name} size={fontSize} color={color} />;
  return (
    <Text style={{ fontSize }} accessible={false} importantForAccessibility="no">
      {glyph.emoji}
    </Text>
  );
}
