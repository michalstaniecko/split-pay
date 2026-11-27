import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { useLocale } from '@/i18n/locale-provider';
import { useFormatters } from '@/i18n/use-formatters';
import { attendanceGrid, dayLabel, gridChanges, isTicked, toggleDay } from './attendance-grid';
import { useSaveAttendance } from './attendance-query';
import type { GroupDetail } from './groups-query';

/**
 * Per-day attendance grid of a trip (trip days × members) in the Group info
 * members section. Renders nothing for a group without dates. Ticking every
 * day saves "whole trip" (`null`); gaps are allowed (leave and come back).
 */
export function AttendanceGridView({ group }: { group: GroupDetail }) {
  if (!group.startDate || !group.endDate) return null;
  // Restart the draft whenever the saved attendance or the trip dates change.
  const key = JSON.stringify([group.startDate, group.endDate, group.members.map((m) => [m.id, m.attendance])]);
  return <Grid key={key} group={group} />;
}

function Grid({ group }: { group: GroupDetail }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { locale } = useLocale();
  const format = useFormatters();
  const [grid, setGrid] = useState(() => attendanceGrid(group));
  const save = useSaveAttendance(group.id);
  const result = gridChanges(group, grid);
  const dirty = !result.ok || result.changes.length > 0;
  const emptyNames = result.ok
    ? []
    : group.members.filter((m) => result.emptyMemberIds.includes(m.id)).map((m) => m.displayName);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t`Obecność`}</Text>
      <View style={styles.table}>
        <View>
          <View style={styles.headerCell} />
          {group.members.map((m) => (
            <View key={m.id} style={styles.nameCell}>
              <Text style={styles.name} numberOfLines={1}>
                {m.displayName}
              </Text>
            </View>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {grid.days.map((day) => {
            const label = dayLabel(day, locale);
            return (
              <View key={day}>
                <View style={styles.headerCell} accessible accessibilityLabel={format.date(day)}>
                  <Text style={styles.weekday}>{label.weekday}</Text>
                  <Text style={styles.day}>{label.day}</Text>
                </View>
                {group.members.map((m) => {
                  const checked = isTicked(grid, m.id, day);
                  return (
                    <Pressable
                      key={m.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${m.displayName}, ${format.date(day)}`}
                      onPress={() => setGrid((g) => toggleDay(g, m.id, day))}
                      style={styles.cell}>
                      <View style={[styles.mark, checked && styles.markChecked]}>
                        {checked ? <Icon name="Check" size={theme.font.sizeSm} color={theme.colors.onPrimary} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </View>
      {emptyNames.length > 0 ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {t`Zaznacz co najmniej jeden dzień: ${emptyNames.join(', ')}`}
        </Text>
      ) : null}
      {save.isError ? <Text style={styles.error}>{t`Nie udało się zapisać obecności. Spróbuj ponownie.`}</Text> : null}
      {dirty ? (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={t`Anuluj`}
            disabled={save.isPending}
            onPress={() => setGrid(attendanceGrid(group))}
          />
          <Button
            label={t`Zapisz obecność`}
            loading={save.isPending}
            disabled={!result.ok}
            onPress={() => {
              if (result.ok) save.mutate(result.changes);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const CELL = 44;

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space(2),
    paddingTop: theme.space(2),
  },
  title: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  table: {
    flexDirection: 'row',
  },
  headerCell: {
    height: CELL,
    minWidth: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameCell: {
    height: CELL,
    justifyContent: 'center',
    maxWidth: 120,
    paddingEnd: theme.space(2),
  },
  name: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  weekday: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  day: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markChecked: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space(2),
  },
}));
