import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** A group's emoji on its colour — groups have no cover photos (SPEC). */
export function GroupAvatar({ emoji, color, size = 44 }: { emoji: string; color: string; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
