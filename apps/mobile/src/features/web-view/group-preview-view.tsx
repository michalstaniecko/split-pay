import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { balanceRowLabel } from '@/features/balances/balance-label';
import { type BalanceRow, drawerRows, type TransferRow } from '@/features/balances/balances';
import type { CategoryIconKey } from '@/features/entries/category-icon';
import { CategoryIcon } from '@/features/entries/category-icon-view';
import { useEntryLabels } from '@/features/entries/use-entry-labels';
import { useFormatters } from '@/i18n/use-formatters';
import type { PreviewDay, PreviewRow } from './group-preview';
import type { PublicBalances, PublicGroup } from './public-view-query';

/**
 * The group preview (SPEC "Web interface"): the header, the settle-up and the
 * entries table of a group link, read-only. Data in, no fetching. "This is
 * me" (`me`) only highlights; nothing depends on it.
 */

/** Name, emoji, dates, number of members, the total of expenses and the "Statystyki" link. */
export function PreviewHeader({
  data,
  total,
  onOpenStats,
}: {
  data: PublicGroup;
  total: number;
  onOpenStats: () => void;
}) {
  const { t } = useLingui();
  const format = useFormatters();
  const { group, members } = data;
  const count = members.length;
  const dates = group.startDate && group.endDate ? `${format.date(group.startDate)} – ${format.date(group.endDate)}` : null;
  const people = plural(count, { one: '# osoba', few: '# osoby', many: '# osób', other: '# osoby' });
  const totalText = format.amount(total, group.baseCurrency);

  return (
    <View style={styles.header}>
      <GroupAvatar emoji={group.emoji} color={group.color} size={56} />
      <View style={styles.headerText}>
        <Text style={styles.groupName} accessibilityRole="header">
          {group.name}
        </Text>
        <Text style={styles.muted}>{[dates, people].filter(Boolean).join(' · ')}</Text>
        <Text style={styles.headerTotal}>{t`Razem: ${totalText}`}</Text>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityHint={t`Dni × osoby i kategorie`}
        onPress={onOpenStats}
        style={({ pressed }) => [styles.statsLink, pressed && styles.pressed]}>
        <Text style={styles.link}>{t`Statystyki`}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The settle-up on the page: who pays whom (per the group's debt
 * simplification setting) and every member's balance. No payout details and no
 * actions. Choosing a balance row is "this is me"; choosing it again clears it.
 */
export function PreviewSettleUp({
  balances,
  members,
  me,
  onChooseMe,
}: {
  balances: PublicBalances;
  members: PublicGroup['members'];
  me: string | null;
  onChooseMe: (memberId: string | null) => void;
}) {
  const { t } = useLingui();
  const rows = drawerRows(balances, members, me);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t`Kto komu oddaje`}
        </Text>
        <Text style={styles.muted}>{balances.simplifyDebts ? t`Uproszczone długi` : t`Bez upraszczania długów`}</Text>
      </View>
      {rows.transfers.length === 0 ? (
        <Text style={styles.muted}>{t`Wszystko rozliczone.`}</Text>
      ) : (
        <View style={styles.card}>
          {rows.transfers.map((transfer) => (
            <TransferLine key={transfer.key} transfer={transfer} currency={balances.baseCurrency} />
          ))}
        </View>
      )}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t`Salda`}
        </Text>
        <Text style={styles.muted}>{t`Wybierz siebie, żeby wyróżnić swoje saldo i udział we wpisach.`}</Text>
      </View>
      <View style={styles.card} accessibilityRole="radiogroup">
        {rows.balances.map((row) => (
          <BalanceLine
            key={row.memberId}
            row={row}
            currency={balances.baseCurrency}
            onPress={() => onChooseMe(row.isMe ? null : row.memberId)}
          />
        ))}
      </View>
    </View>
  );
}

function TransferLine({ transfer, currency }: { transfer: TransferRow; currency: string }) {
  const { t } = useLingui();
  const format = useFormatters();
  const amount = format.amount(transfer.amount, currency);
  const mine = transfer.direction !== 'others';
  const from = transfer.fromName;
  const to = transfer.toName;
  return (
    <View
      style={[styles.line, mine && styles.highlighted]}
      accessible
      accessibilityLabel={t`${from} → ${to}: ${amount}`}>
      <Text style={[styles.lineName, mine && styles.bold]}>
        {from} → {to}
      </Text>
      <Text style={styles.lineAmount}>{amount}</Text>
    </View>
  );
}

function BalanceLine({ row, currency, onPress }: { row: BalanceRow; currency: string; onPress: () => void }) {
  const { t } = useLingui();
  const format = useFormatters();
  const amount = format.amount(Math.abs(row.amount), currency);
  const name = row.isMe ? t`${row.name} (Ty)` : row.name;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: row.isMe }}
      accessibilityLabel={balanceRowLabel(row, { baseCurrency: currency, spokenAmount: format.spokenAmount })}
      accessibilityHint={row.isMe ? t`Przestań wyróżniać` : t`To ja`}
      onPress={onPress}
      style={({ pressed }) => [styles.line, row.isMe && styles.highlighted, pressed && styles.pressed]}>
      <Text style={[styles.lineName, row.isMe && styles.bold]}>{name}</Text>
      <Text style={[styles.lineAmount, row.amount > 0 && styles.positive, row.amount < 0 && styles.negative]}>
        {row.amount > 0 ? `+${amount}` : row.amount < 0 ? `−${amount}` : amount}
      </Text>
    </Pressable>
  );
}

/**
 * The entries table: a header per day with the day's total, then one row per
 * entry. With "this is me", a "Twój udział" column. Rows wrap to two lines on
 * a narrow screen.
 */
export function PreviewEntries({
  days,
  baseCurrency,
  showShare,
  onOpenEntry,
}: {
  days: readonly PreviewDay[];
  baseCurrency: string;
  showShare: boolean;
  onOpenEntry: (entryId: string) => void;
}) {
  const { t } = useLingui();
  const format = useFormatters();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {t`Wpisy`}
      </Text>
      {days.length === 0 ? (
        <Text style={styles.muted}>{t`Brak wpisów`}</Text>
      ) : (
        <View style={styles.card}>
          <View style={[styles.tableRow, styles.columnHeader]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={[styles.cellTitle, styles.columnLabel]}>{t`Wpis`}</Text>
            <Text style={[styles.cellWho, styles.columnLabel]}>{t`Kto`}</Text>
            <View style={styles.cellAmount}>
              <Text style={styles.columnLabel}>{t`Kwota`}</Text>
            </View>
            {showShare ? (
              <View style={styles.cellAmount}>
                <Text style={styles.columnLabel}>{t`Twój udział`}</Text>
              </View>
            ) : null}
          </View>
          {days.map((day) => {
            // Net of incomes, so it can be negative; a day with only settlements has no total.
            const spending = day.rows.some((row) => row.entry.kind !== 'settlement');
            const total = !spending
              ? null
              : day.total < 0
                ? `−${format.amount(-day.total, baseCurrency)}`
                : format.amount(day.total, baseCurrency);
            const date = format.date(day.date);
            return (
              <View key={day.date}>
                <View style={styles.dayHeader} accessible accessibilityRole="header" accessibilityLabel={total ? t`${date}, razem ${total}` : date}>
                  <Text style={styles.dayDate}>{date}</Text>
                  {total ? <Text style={styles.dayTotal}>{total}</Text> : null}
                </View>
                {day.rows.map((row) => (
                  <EntryRow
                    key={row.entry.id}
                    row={row}
                    baseCurrency={baseCurrency}
                    showShare={showShare}
                    onPress={() => onOpenEntry(row.entry.id)}
                  />
                ))}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function EntryRow({
  row,
  baseCurrency,
  showShare,
  onPress,
}: {
  row: PreviewRow;
  baseCurrency: string;
  showShare: boolean;
  onPress: () => void;
}) {
  const { t } = useLingui();
  const format = useFormatters();
  const labels = useEntryLabels();
  const { entry, names } = row;

  let icon: CategoryIconKey;
  let title: string;
  let detail: string | null;
  let who: string;
  if (entry.kind === 'settlement') {
    const [from, to] = names;
    icon = 'settlement';
    title = t`Spłata: ${from} → ${to}`;
    detail = null;
    who = '';
  } else {
    icon = entry.category;
    title = entry.title;
    const category = labels.category[entry.category];
    if (entry.kind === 'income') {
      detail = t`↓ Wpływ · ${category}`;
      const recipients = names.join(', ');
      who = t`Dla: ${recipients}`;
    } else {
      detail = category;
      const first = names[0] ?? '?';
      const others = names.length - 1;
      who = others > 0 ? t`${first} + ${others}` : first;
    }
  }
  const amount = format.amount(row.amount, baseCurrency);
  const original = row.original ? format.amount(row.original.amount, row.original.currency) : null;
  const share =
    row.myShare === null || row.myShare === 0
      ? null
      : row.myShare < 0
        ? `−${format.amount(-row.myShare, baseCurrency)}`
        : format.amount(row.myShare, baseCurrency);
  const label = [
    title,
    detail,
    who,
    original ? t`${original}, czyli ${amount}` : amount,
    showShare ? (share ? t`Twój udział ${share}` : t`Bez twojego udziału`) : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tableRow, entry.kind === 'settlement' && styles.settlementRow, pressed && styles.pressed]}>
      <View style={styles.cellTitle}>
        <View style={styles.titleLine}>
          <CategoryIcon category={icon} />
          <Text style={[styles.rowTitle, entry.kind === 'settlement' && styles.settlementTitle]}>{title}</Text>
        </View>
        {detail ? <Text style={[styles.muted, entry.kind === 'income' && styles.positive]}>{detail}</Text> : null}
      </View>
      <Text style={[styles.cellWho, styles.rowText]} numberOfLines={2}>
        {who}
      </Text>
      <View style={styles.cellAmount}>
        <Text style={[styles.rowAmount, entry.kind === 'income' && styles.positive]}>{amount}</Text>
        {original ? <Text style={styles.muted}>{original}</Text> : null}
      </View>
      {showShare ? (
        <View style={styles.cellAmount}>
          <Text style={styles.rowText}>{share ?? '—'}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space(3),
  },
  headerText: {
    flex: 1,
    minWidth: 180,
    gap: theme.space(1),
  },
  groupName: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  headerTotal: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  statsLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  link: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  section: {
    gap: theme.space(2),
  },
  sectionHeading: {
    gap: theme.space(1),
    marginTop: theme.space(2),
  },
  sectionTitle: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: theme.space(2),
    minHeight: 48,
    paddingVertical: theme.space(2),
    paddingHorizontal: theme.space(4),
    borderStartWidth: 3,
    borderStartColor: 'transparent',
  },
  highlighted: {
    borderStartColor: theme.colors.primary,
    backgroundColor: theme.colors.background,
  },
  lineName: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  lineAmount: {
    marginStart: 'auto',
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  bold: {
    fontWeight: theme.font.weightBold,
  },
  positive: {
    color: theme.colors.positive,
  },
  negative: {
    color: theme.colors.negative,
  },
  columnHeader: {
    paddingVertical: theme.space(2),
    borderTopWidth: 0,
  },
  columnLabel: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  dayHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: theme.space(2),
    paddingVertical: theme.space(2),
    paddingHorizontal: theme.space(4),
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  dayDate: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  dayTotal: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  tableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: theme.space(3),
    rowGap: theme.space(1),
    minHeight: 48,
    paddingVertical: theme.space(2),
    paddingHorizontal: theme.space(4),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  settlementRow: {
    backgroundColor: theme.colors.background,
  },
  // Title takes the first line on a narrow screen; who, amount and share share the second.
  cellTitle: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 240,
    gap: theme.space(0.5),
  },
  cellWho: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 100,
  },
  cellAmount: {
    flexBasis: 96,
    flexShrink: 0,
    // The cross-axis end follows the layout direction (RTL mirrors it).
    alignItems: 'flex-end',
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space(2),
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  settlementTitle: {
    fontStyle: 'italic',
    color: theme.colors.textMuted,
  },
  rowText: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  rowAmount: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  pressed: {
    opacity: 0.6,
  },
}));
