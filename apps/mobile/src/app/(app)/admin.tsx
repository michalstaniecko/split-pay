import { useLingui } from '@lingui/react/macro';
import type { ReportReason } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import {
  type AdminReport,
  adminReportsQuery,
  blockedAccountsQuery,
  useAdminActions,
} from '@/features/moderation/moderation-query';
import { photoCacheKey } from '@/features/photos/member-avatar';
import { useFormatters } from '@/i18n/use-formatters';

/**
 * Admin panel (#27): open photo reports (remove the photo, dismiss the
 * report, block the uploader) and blocked accounts (unblock). Reached from
 * Profile; the API allows it only to ADMIN_EMAILS.
 */
export default function AdminScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const reports = useQuery(adminReportsQuery());
  const blocked = useQuery(blockedAccountsQuery());
  const actions = useAdminActions();

  if (reports.isPending || blocked.isPending) {
    return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  }
  if (reports.isError || blocked.isError) {
    return (
      <View style={styles.content}>
        <Text style={styles.text}>{t`Nie udało się wczytać panelu administratora.`}</Text>
        <Button
          variant="secondary"
          label={t`Spróbuj ponownie`}
          onPress={() => {
            void reports.refetch();
            void blocked.refetch();
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{t`Otwarte zgłoszenia`}</Text>
      {reports.data.length === 0 ? <Text style={styles.muted}>{t`Brak otwartych zgłoszeń.`}</Text> : null}
      {reports.data.map((report) => (
        <ReportCard key={report.id} report={report} actions={actions} />
      ))}

      <Text style={styles.heading}>{t`Zablokowane konta`}</Text>
      {blocked.data.length === 0 ? <Text style={styles.muted}>{t`Brak zablokowanych kont.`}</Text> : null}
      {blocked.data.map((account) => (
        <View key={account.id} style={styles.card}>
          <Text style={styles.text} selectable>
            {account.email}
          </Text>
          {account.reason ? <Text style={styles.muted}>{account.reason}</Text> : null}
          <Button
            variant="secondary"
            label={t`Odblokuj`}
            loading={actions.unblock.isPending && actions.unblock.variables === account.id}
            onPress={() => actions.unblock.mutate(account.id)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function ReportCard({ report, actions }: { report: AdminReport; actions: ReturnType<typeof useAdminActions> }) {
  const { t } = useLingui();
  const format = useFormatters();
  const reasons: Record<ReportReason, string> = {
    illegal: t`Treści nielegalne`,
    sexual: t`Nagość lub treści seksualne`,
    violence: t`Przemoc lub drastyczne treści`,
    harassment: t`Nękanie lub mowa nienawiści`,
    privacy: t`Narusza czyjąś prywatność`,
    spam: t`Spam`,
    other: t`Inny powód`,
  };
  const photo = report.photo;
  const account = report.reportedUser;
  const kind = photo?.kind === 'avatar' ? t`Zdjęcie profilowe` : t`Zdjęcie paragonu`;

  const confirm = (title: string, onConfirm: () => void) =>
    Alert.alert(title, undefined, [
      { text: t`Anuluj`, style: 'cancel' },
      { text: t`Potwierdź`, style: 'destructive', onPress: onConfirm },
    ]);

  return (
    <View style={styles.card}>
      {photo?.url ? (
        <Image
          source={{ uri: photo.url, cacheKey: photoCacheKey(photo.url) }}
          style={styles.photo}
          contentFit="contain"
          accessibilityLabel={kind}
        />
      ) : (
        <Text style={styles.muted}>{t`Zdjęcie zostało już usunięte.`}</Text>
      )}
      <Text style={styles.title}>{reasons[report.reason]}</Text>
      {report.details ? <Text style={styles.text}>{report.details}</Text> : null}
      <Text style={styles.muted}>
        {kind} · {format.date(report.createdAt.slice(0, 10))}
      </Text>
      <Text style={styles.muted} selectable>
        {t`Zgłaszający: ${report.reporter?.email ?? '—'}`}
      </Text>
      <Text style={styles.muted} selectable>
        {t`Autor zdjęcia: ${account?.email ?? '—'}`}
        {account?.blocked ? ` · ${t`zablokowany`}` : ''}
      </Text>
      {photo ? (
        <Button
          label={t`Usuń zdjęcie`}
          loading={actions.removePhoto.isPending && actions.removePhoto.variables === photo.id}
          onPress={() => confirm(t`Usunąć zdjęcie?`, () => actions.removePhoto.mutate(photo.id))}
        />
      ) : null}
      <Button
        variant="secondary"
        label={t`Odrzuć zgłoszenie`}
        loading={actions.dismissReport.isPending && actions.dismissReport.variables === report.id}
        onPress={() => actions.dismissReport.mutate(report.id)}
      />
      {account && !account.blocked ? (
        <Button
          variant="secondary"
          label={t`Zablokuj konto`}
          loading={actions.block.isPending && actions.block.variables?.userId === account.id}
          onPress={() =>
            confirm(t`Zablokować konto ${account.email}?`, () =>
              actions.block.mutate({ userId: account.id, reason: reasons[report.reason] }),
            )
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    padding: theme.space(6),
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space(3),
    padding: theme.space(4),
    paddingBottom: theme.space(8),
  },
  heading: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  card: {
    gap: theme.space(2),
    padding: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  photo: {
    height: 200,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  text: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
