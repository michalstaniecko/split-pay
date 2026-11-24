import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { webUrl } from '@/lib/web-url';
import { groupLinkUrl, qrModules } from './group-link';
import { groupLinkQuery, useRevokeGroupLink } from './group-link-query';

/**
 * The group link section of Group info (ADR-0009, ADR-0017): share via the
 * system share sheet, a QR code to show in person, and revoking (any member).
 */
export function GroupLinkSection({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const link = useQuery(groupLinkQuery(groupId));
  const revoke = useRevokeGroupLink(groupId);
  const [confirming, setConfirming] = useState(false);

  if (link.isPending) return <ActivityIndicator color={theme.colors.primary} />;
  if (link.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>{t`Nie udało się wczytać linku grupy.`}</Text>
        <Button variant="secondary" label={t`Spróbuj ponownie`} onPress={() => void link.refetch()} />
      </View>
    );
  }

  const url = groupLinkUrl(link.data.token, webUrl);
  const share = () =>
    void Share.share({ message: t`Dołącz do grupy „${groupName}” w split-pay: ${url}` }).catch(() => undefined);
  const confirmRevoke = () =>
    revoke.mutate(undefined, {
      onSuccess: () => setConfirming(false),
    });

  return (
    <View style={styles.container}>
      <Text style={styles.muted}>{t`Z tym linkiem można dołączyć do grupy.`}</Text>
      <QrCode value={url} label={t`Kod QR linku grupy`} />
      <Text style={styles.url} selectable numberOfLines={2}>
        {url}
      </Text>
      <Button label={t`Udostępnij link`} onPress={share} />
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.muted}>{t`Stary link i kod QR przestaną działać. Osoby w grupie zostają.`}</Text>
          <Button label={t`Unieważnij i utwórz nowy`} loading={revoke.isPending} onPress={confirmRevoke} />
          <Button variant="secondary" label={t`Anuluj`} onPress={() => setConfirming(false)} />
          {revoke.isError ? <Text style={styles.error}>{t`Nie udało się unieważnić linku.`}</Text> : null}
        </View>
      ) : (
        <Button variant="secondary" label={t`Unieważnij link`} onPress={() => setConfirming(true)} />
      )}
    </View>
  );
}

const QR_SIZE = 200;

/**
 * A QR code drawn with Views (no native SVG module needed): one rectangle per
 * run of dark modules in a row. Always dark-on-light with a quiet zone, whatever
 * the theme, so cameras can read it.
 */
function QrCode({ value, label }: { value: string; label: string }) {
  const { runs, size } = useMemo(() => {
    const modules = qrModules(value);
    const found: { row: number; col: number; length: number }[] = [];
    modules.forEach((cells, row) => {
      let col = 0;
      while (col < cells.length) {
        if (!cells[col]) {
          col += 1;
          continue;
        }
        const start = col;
        while (cells[col]) col += 1;
        found.push({ row, col: start, length: col - start });
      }
    });
    return { runs: found, size: modules.length };
  }, [value]);
  const cell = QR_SIZE / size;

  return (
    <View style={styles.qrFrame} accessible accessibilityRole="image" accessibilityLabel={label}>
      <View style={[styles.qr, { width: QR_SIZE, height: QR_SIZE }]}>
        {runs.map(({ row, col, length }) => (
          <View
            key={`${row}:${col}`}
            style={[styles.qrModule, { top: row * cell, start: col * cell, width: length * cell, height: cell }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space(3),
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  url: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
    textAlign: 'center',
  },
  confirm: {
    gap: theme.space(2),
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
  qrFrame: {
    alignSelf: 'center',
    padding: theme.space(4),
    borderRadius: theme.radius.md,
    // Fixed colours on purpose: QR codes must stay dark on light in every theme.
    backgroundColor: '#FFFFFF',
  },
  qr: {
    position: 'relative',
    // RTL must not mirror the code.
    direction: 'ltr',
  },
  qrModule: {
    position: 'absolute',
    backgroundColor: '#000000',
  },
}));
