import type { Member, Settlement } from '@split-pay/shared';
import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useLocale } from '@/i18n/locale-provider';
import { settlementMessage } from './settlement-message';

/**
 * A settlement in the Conversation (ADR-0017): a centred system message
 * ("💸 Spłata: Bartek → Ania · 30,50 zł") instead of a bubble, so it can't be
 * mistaken for an expense. Tap opens the entry detail.
 */
export function SettlementSystemMessage({
  entry,
  members,
  myMemberId,
  highlighted,
  onPress,
}: {
  entry: Settlement;
  members: readonly Pick<Member, 'id' | 'displayName'>[];
  myMemberId: string | null;
  highlighted: boolean;
  onPress: () => void;
}) {
  const { locale } = useLocale();
  const { text, label } = settlementMessage(entry, { members, myMemberId, locale });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.message, highlighted && styles.highlighted, pressed && styles.pressed]}>
      <Text style={styles.text}>💸 {text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  message: {
    alignSelf: 'center',
    maxWidth: '90%',
    marginVertical: theme.space(1),
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1.5),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  highlighted: {
    borderColor: theme.colors.primary,
  },
  text: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
}));
