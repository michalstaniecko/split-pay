import { useLingui } from '@lingui/react/macro';
import type { GroupStats } from '@split-pay/shared';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { CategoryIcon } from '@/features/entries/category-icon-view';
import { useEntryLabels } from '@/features/entries/use-entry-labels';
import { useFormatters } from '@/i18n/use-formatters';
import { categoryBars, type StatsCell, type StatsColumn, statsTable } from './stats-table';

/**
 * The Stats screen's content: the days × people table (scrolls sideways on a
 * phone) and the breakdown by category. Data in, no fetching — the signed-in
 * screen and the view-only web (#19) feed it from their own queries.
 */
export function StatsView({
  stats,
  members,
}: {
  stats: GroupStats;
  members: readonly { id: string; displayName: string }[];
}) {
  const { t } = useLingui();
  if (stats.days.length === 0) {
    return <Text style={styles.empty}>{t`Brak wydatków — statystyki pojawią się po dodaniu pierwszego.`}</Text>;
  }
  return (
    <View style={styles.container}>
      <Section title={t`Dni × osoby`} subtitle={t`Górna kwota: zapłacone, dolna: zużyte.`}>
        <DaysTable stats={stats} members={members} />
      </Section>
      <Section title={t`Kategorie`}>
        <Categories stats={stats} />
      </Section>
    </View>
  );
}

const columnKey = (c: StatsColumn) => (c.kind === 'member' ? c.memberId : 'former');

function DaysTable({ stats, members }: { stats: GroupStats; members: readonly { id: string; displayName: string }[] }) {
  const { t } = useLingui();
  const format = useFormatters();
  const table = statsTable(stats, members);
  const amount = (minor: number) => format.amount(minor, stats.baseCurrency);
  const names = table.columns.map((c) => (c.kind === 'member' ? c.name : t`Poza grupą`));

  const row = (key: string, label: string, total: number, cells: StatsCell[], bold = false) => (
    <View key={key} style={[styles.row, bold && styles.totalsRow]}>
      <View style={styles.dateCell} accessible accessibilityLabel={t`${label}, razem ${amount(total)}`}>
        <Text style={[styles.cellText, styles.bold]}>{label}</Text>
        <Text style={styles.mutedText}>{amount(total)}</Text>
      </View>
      {cells.map((cell, i) => (
        <View
          key={columnKey(table.columns[i]!)}
          style={styles.cell}
          accessible
          accessibilityLabel={t`${names[i]!}, ${label}: zapłacone ${amount(cell.paid)}, zużyte ${amount(cell.consumed)}`}>
          <Text style={[styles.cellText, bold && styles.bold]}>{amount(cell.paid)}</Text>
          <Text style={styles.mutedText}>{amount(cell.consumed)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.table}>
      <View>
        <View style={[styles.row, styles.headerRow]} accessibilityRole="header">
          <Text style={[styles.dateCell, styles.headerText]}>{t`Dzień`}</Text>
          {names.map((name, i) => (
            <View key={columnKey(table.columns[i]!)} style={styles.cell}>
              <Text style={styles.headerText} numberOfLines={2}>
                {name}
              </Text>
            </View>
          ))}
        </View>
        {table.rows.map((r) => row(r.date, format.date(r.date), r.total, r.cells))}
        {row('totals', t`Razem`, table.totals.total, table.totals.cells, true)}
      </View>
    </ScrollView>
  );
}

function Categories({ stats }: { stats: GroupStats }) {
  const { t } = useLingui();
  const format = useFormatters();
  const labels = useEntryLabels();
  return (
    <View style={styles.categories}>
      {categoryBars(stats.categories).map((c) => (
        <View
          key={c.category}
          style={styles.category}
          accessible
          accessibilityLabel={`${labels.category[c.category]}: ${format.amount(c.amount, stats.baseCurrency)}`}>
          <View style={styles.categoryLine}>
            <View style={styles.categoryName}>
              <CategoryIcon category={c.category} />
              <Text style={styles.cellText}>{labels.category[c.category]}</Text>
            </View>
            <Text style={[styles.cellText, styles.bold]}>{format.amount(c.amount, stats.baseCurrency)}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${Math.round(c.fraction * 100)}%` }]} />
          </View>
        </View>
      ))}
      <View style={styles.categoryLine}>
        <Text style={[styles.cellText, styles.bold]}>{t`Razem`}</Text>
        <Text style={[styles.cellText, styles.bold]}>{format.amount(stats.total, stats.baseCurrency)}</Text>
      </View>
    </View>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.mutedText}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const CELL_WIDTH = 112;

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space(3),
  },
  empty: {
    padding: theme.space(6),
    textAlign: 'center',
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
  },
  section: {
    gap: theme.space(2),
    padding: theme.space(4),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  sectionTitle: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  table: {
    paddingBottom: theme.space(1),
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.space(2),
  },
  headerRow: {
    alignItems: 'flex-end',
  },
  totalsRow: {
    borderBottomWidth: 0,
  },
  dateCell: {
    width: CELL_WIDTH,
    paddingEnd: theme.space(2),
  },
  cell: {
    width: CELL_WIDTH,
    paddingEnd: theme.space(2),
    alignItems: 'flex-end',
  },
  headerText: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  cellText: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  bold: {
    fontWeight: theme.font.weightBold,
  },
  mutedText: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  categories: {
    gap: theme.space(3),
  },
  category: {
    gap: theme.space(1),
  },
  categoryName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    flexShrink: 1,
  },
  categoryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(2),
  },
  track: {
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  bar: {
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
}));
