import { useLingui } from '@lingui/react/macro';
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS, type ReportReason } from '@split-pay/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { useReportPhoto } from '@/features/moderation/moderation-query';
import { closeSheet } from '@/lib/close-sheet';

/**
 * "Zgłoś zdjęcie" (#27, DSA): a reason and optional details for a receipt
 * photo or an avatar, sent to the admins. Opened from the receipt viewer and
 * from a member's avatar in Group info.
 */
export default function ReportPhotoSheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const report = useReportPhoto();

  const labels: Record<ReportReason, string> = {
    illegal: t`Treści nielegalne`,
    sexual: t`Nagość lub treści seksualne`,
    violence: t`Przemoc lub drastyczne treści`,
    harassment: t`Nękanie lub mowa nienawiści`,
    privacy: t`Narusza czyjąś prywatność`,
    spam: t`Spam`,
    other: t`Inny powód`,
  };

  if (report.isSuccess) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t`Dziękujemy za zgłoszenie`}</Text>
        <Text style={styles.text}>{t`Administrator sprawdzi to zdjęcie i w razie potrzeby je usunie.`}</Text>
        <Button label={t`Zamknij`} onPress={closeSheet} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t`Zgłoś zdjęcie`}</Text>
      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={t`Powód zgłoszenia`}>
        {REPORT_REASONS.map((value) => {
          const selected = value === reason;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setReason(value)}
              style={[styles.option, selected && styles.optionSelected]}>
              <Text style={[styles.text, selected && styles.labelSelected]}>{labels[value]}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder={t`Szczegóły (opcjonalnie)`}
        accessibilityLabel={t`Szczegóły (opcjonalnie)`}
        placeholderTextColor={theme.colors.textMuted}
        maxLength={REPORT_DETAILS_MAX_LENGTH}
        multiline
        style={styles.input}
      />
      {report.isError ? <Text style={styles.error}>{t`Nie udało się wysłać zgłoszenia. Spróbuj ponownie.`}</Text> : null}
      <Button
        label={t`Wyślij zgłoszenie`}
        disabled={!reason || !photoId}
        loading={report.isPending}
        onPress={() => reason && photoId && report.mutate({ photoId, reason, details })}
      />
      <Button variant="secondary" label={t`Anuluj`} onPress={closeSheet} />
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space(3),
    padding: theme.space(4),
    paddingBottom: theme.space(8),
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  text: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  options: {
    gap: theme.space(2),
  },
  option: {
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(4),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionSelected: {
    borderColor: theme.colors.primary,
  },
  labelSelected: {
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  input: {
    minHeight: 80,
    padding: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontSize: theme.font.sizeMd,
    textAlign: 'auto',
    textAlignVertical: 'top',
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
