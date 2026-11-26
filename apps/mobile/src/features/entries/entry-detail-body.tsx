import { useLingui } from '@lingui/react/macro';
import { convert, type Entry, resolveSplit } from '@split-pay/shared';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Section } from '@/components/section';
import { formatRate } from '@/features/rates/rate-format';
import { useLocale } from '@/i18n/locale-provider';
import { useFormatters } from '@/i18n/use-formatters';
import { CATEGORY_ICONS } from './entries-query';
import { useEntryLabels } from './use-entry-labels';

/**
 * The entry detail's content: heading, amount (with the base amount and the
 * frozen rate for a foreign currency), date, payers / recipients and shares —
 * or from / to for a settlement. Data in, no fetching — the signed-in entry
 * sheet and the view-only web (#19) add their own footer (author, history
 * link, "Edytuj"…). Rendered as siblings, to sit in the caller's ScrollView.
 */
export function EntryDetailBody({
  entry,
  baseCurrency,
  memberName,
  receiptPhoto,
}: {
  entry: Entry;
  baseCurrency: string;
  memberName: (memberId: string) => string;
  /** Shown under the shares of an expense or income (the app's receipt photo). */
  receiptPhoto?: ReactNode;
}) {
  const { t } = useLingui();
  const labels = useEntryLabels();
  const format = useFormatters();
  const amount = (minor: number) => format.amount(minor, entry.currency);
  const currencyRows = <CurrencyRows entry={entry} baseCurrency={baseCurrency} />;

  return entry.kind === 'settlement' ? (
    <>
      <Text style={styles.heading}>💸 {t`Spłata`}</Text>
      <Row label={t`Kwota`}>{amount(entry.amount)}</Row>
      {currencyRows}
      <Row label={t`Data`}>{format.date(entry.date)}</Row>
      <Row label={t`Od`}>{memberName(entry.from)}</Row>
      <Row label={t`Do`}>{memberName(entry.to)}</Row>
    </>
  ) : (
    <>
      <Text style={styles.heading}>
        {CATEGORY_ICONS[entry.category]} {entry.title}
      </Text>
      <Text style={styles.amount}>{amount(entry.amount)}</Text>
      {currencyRows}
      <Row label={t`Kategoria`}>{labels.category[entry.category]}</Row>
      <Row label={t`Data`}>{format.date(entry.date)}</Row>
      <Section variant="plain" title={entry.kind === 'expense' ? t`Kto zapłacił` : t`Kto otrzymuje`}>
        {(entry.kind === 'expense' ? entry.payers : entry.recipients).map((h) => (
          <Row key={h.memberId} label={memberName(h.memberId)}>
            {amount(h.amount)}
          </Row>
        ))}
      </Section>
      <Section variant="plain" title={t`Udziały · ${labels.splitMode[entry.split.mode]}`}>
        {resolveSplit(entry.split, entry.amount).map((share) => (
          <Row key={share.memberId} label={memberName(share.memberId)}>
            {amount(share.amount)}
          </Row>
        ))}
      </Section>
      {receiptPhoto}
    </>
  );
}

/** A foreign-currency entry: the amount in the base currency and the frozen rate ("1 EUR = 4,3215 PLN"). */
function CurrencyRows({ entry, baseCurrency }: { entry: Entry; baseCurrency: string }) {
  const { t } = useLingui();
  const format = useFormatters();
  const { locale } = useLocale();
  if (entry.currency === baseCurrency) return null;
  const base = convert(entry.amount, entry.rateToBase, entry.currency, baseCurrency);
  const rate = `1 ${entry.currency} = ${formatRate(entry.rateToBase, locale)} ${baseCurrency}`;
  return (
    <>
      <Row label={t`W walucie bazowej`}>≈ {format.amount(base, baseCurrency)}</Row>
      <Row label={t`Kurs`}>{rate}</Row>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row} accessible>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  heading: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  amount: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(3),
  },
  label: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
  },
  value: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
}));
