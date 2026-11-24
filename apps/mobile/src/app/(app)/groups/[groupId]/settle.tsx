import { useLingui } from '@lingui/react/macro';
import {
  defaultEntryDate,
  formatBankAccount,
  hasPayoutDetails,
  minorUnitDigits,
  type Settlement,
} from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupNotFound } from '@/components/group-not-found';
import { memberPayoutDetailsQuery } from '@/features/balances/balances-query';
import { cleanAmountInput } from '@/features/entries/amount-input';
import { myMemberId } from '@/features/entries/conversation';
import { entriesQuery, useCreateEntry, useEditEntry } from '@/features/entries/entries-query';
import { versionConflictEntry } from '@/features/entries/entry-edit';
import { todayLocalDate } from '@/features/entries/expense-draft';
import { type GroupDetail, useGroup } from '@/features/groups/groups-query';
import {
  editedSettlement,
  parseSettleForm,
  type SettleForm,
  type SettleFormField,
  settleForm,
  settleFormFromEntry,
} from '@/features/settlements/settle-form';
import { decimalSeparator } from '@/i18n/locale';
import { useLocale } from '@/i18n/locale-provider';
import { LockedOfflineError, OutboxBlockedError } from '@/features/offline/offline-changes';
import { authClient } from '@/lib/auth-client';
import { closeSheet } from '@/lib/close-sheet';

/** How long "Skopiowano" replaces a copy button's label. */
const COPIED_MS = 2000;


/**
 * The settle sheet. "Oddaj" on my transfer in the balance drawer opens it with
 * `?to=&amount=`: the recipient's payout details (copy buttons, no payment
 * integration) and the suggested amount, prefilled and editable. "Inna
 * spłata" opens it without params: from / to / amount pickers for any other
 * settlement. "Zapisz spłatę" records a settlement entry (base currency,
 * default date) and returns to the Conversation, where it shows as a system message.
 * With `?entryId=` it edits that settlement (#10×#11, "Edytuj" in the long-press
 * menu or the entry detail): prefilled from the cached entry, saved with the
 * version it was based on; a version conflict closes it and marks the message
 * with "!" (as the full form does).
 */
export default function SettleSheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { groupId, to, amount, entryId } = useLocalSearchParams<{
    groupId: string;
    to?: string;
    amount?: string;
    entryId?: string;
  }>();
  const group = useGroup(groupId);
  const entries = useQuery({ ...entriesQuery(groupId), enabled: entryId !== undefined });
  const { data: session } = authClient.useSession();

  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  if (!group.data || (entryId !== undefined && entries.isPending)) {
    return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  }
  const me = myMemberId(group.data.members, session?.user.id);
  if (entryId !== undefined) {
    const entry = entries.data?.find((e) => e.id === entryId);
    if (entry?.kind !== 'settlement') {
      return (
        <View style={styles.content}>
          <Text style={styles.value}>{t`Tego wpisu już nie ma.`}</Text>
          <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
        </View>
      );
    }
    return <SettleSheetForm group={group.data} me={me} suggested={null} editing={entry} />;
  }
  const suggestedAmount = Number(amount);
  return (
    <SettleSheetForm
      group={group.data}
      me={me}
      suggested={
        to
          ? { to, ...(Number.isSafeInteger(suggestedAmount) && suggestedAmount > 0 ? { amount: suggestedAmount } : {}) }
          : null
      }
    />
  );
}

function SettleSheetForm({
  group,
  me,
  suggested,
  editing,
}: {
  group: GroupDetail;
  me: string | null;
  suggested: { to: string; amount?: number } | null;
  editing?: Settlement;
}) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { locale } = useLocale();
  const currency = editing?.currency ?? group.baseCurrency;
  const digits = minorUnitDigits(currency);
  const [form, setForm] = useState<SettleForm>(() =>
    editing
      ? settleFormFromEntry(editing, decimalSeparator(locale))
      : settleForm({ from: me, ...suggested, currency, separator: decimalSeparator(locale) }),
  );
  const [errors, setErrors] = useState<SettleFormField[]>([]);
  // One id per sheet: a retry after a lost response can't record the settlement twice.
  const [entryId] = useState(() => randomUUID());
  const createEntry = useCreateEntry(group.id);
  const editEntry = useEditEntry(group.id);
  const saving = editing ? editEntry : createEntry;
  const [deletedMeanwhile, setDeletedMeanwhile] = useState(false);
  // Archived group: read-only, no new settlements (SPEC).
  const archived = group.archivedAt !== null;

  const update = (next: SettleForm, touched: SettleFormField[]) => {
    setForm(next);
    setErrors((current) => current.filter((field) => !touched.includes(field)));
  };
  const save = () => {
    if (editing) {
      const parsed = editedSettlement(editing, form, group.members);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      editEntry.mutate(
        { base: editing, input: parsed.value },
        {
          onSuccess: closeSheet,
          onError: (error) => {
            const current = versionConflictEntry(error);
            // Changed by someone else: the message shows "!" (useEditEntry marked it).
            if (current && current.deletedAt === null) closeSheet();
            else if (current) setDeletedMeanwhile(true);
          },
        },
      );
      return;
    }
    const parsed = parseSettleForm(form, {
      id: entryId,
      date: defaultEntryDate(todayLocalDate(), group),
      currency,
      members: group.members,
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    createEntry.mutate(parsed.value, {
      // Back to the Conversation, where the settlement shows as a system message.
      onSuccess: () => router.dismissTo({ pathname: '/groups/[groupId]', params: { groupId: group.id } }),
    });
  };

  const recipient = group.members.find((m) => m.id === form.to)?.displayName ?? '?';
  const fieldError: Record<SettleFormField, string> = {
    from: t`Wybierz, kto oddaje.`,
    to: t`Wybierz, komu oddaje – inną osobę niż oddającą.`,
    amount: t`Podaj kwotę większą od zera.`,
  };
  const errorFor = (field: SettleFormField) =>
    errors.includes(field) ? <Text style={styles.error}>{fieldError[field]}</Text> : null;

  const memberPicker = (field: 'from' | 'to', label: string) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {group.members.map((member) => {
          const selected = form[field] === member.id;
          const name = member.displayName;
          return (
            <Pressable
              key={member.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => update({ ...form, [field]: member.id }, [field])}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={styles.chipLabel}>{member.id === me ? t`${name} (Ty)` : name}</Text>
            </Pressable>
          );
        })}
      </View>
      {errorFor(field)}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{editing ? t`Edytuj spłatę` : suggested ? t`Spłata dla: ${recipient}` : t`Inna spłata`}</Text>

        {suggested ? null : (
          <>
            {memberPicker('from', t`Kto oddaje`)}
            {memberPicker('to', t`Komu`)}
          </>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>{t`Kwota`}</Text>
          <View style={[styles.amountRow, errors.includes('amount') && styles.inputInvalid]}>
            <TextInput
              value={form.amount}
              onChangeText={(text) => update({ ...form, amount: cleanAmountInput(text, digits) }, ['amount'])}
              placeholder="0"
              accessibilityLabel={t`Kwota`}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.amountInput}
            />
            <Text style={styles.muted}>{currency}</Text>
          </View>
          {errorFor('amount')}
        </View>

        {form.to !== '' ? <PayoutDetailsBox groupId={group.id} memberId={form.to} /> : null}

        {deletedMeanwhile ? (
          <Text style={styles.error}>{t`Ten wpis został w międzyczasie usunięty. Twoje zmiany nie zostały zapisane.`}</Text>
        ) : saving.error instanceof OutboxBlockedError ? (
          <Text style={styles.error}>{t`Najpierw rozwiąż konflikt tego wpisu (czerwony „!”).`}</Text>
        ) : saving.error instanceof LockedOfflineError ? (
          <Text style={styles.error}>{t`Bez internetu możesz edytować tylko wpisy dodane przez siebie.`}</Text>
        ) : saving.isError && !versionConflictEntry(saving.error) ? (
          <Text style={styles.error}>{t`Nie udało się zapisać spłaty. Spróbuj ponownie.`}</Text>
        ) : null}
        {archived ? null : (
          <Button label={t`Zapisz spłatę`} onPress={save} loading={saving.isPending} disabled={deletedMeanwhile} />
        )}
        <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The recipient's payout details with copy buttons (or why there are none). */
function PayoutDetailsBox({ groupId, memberId }: { groupId: string; memberId: string }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const details = useQuery(memberPayoutDetailsQuery(groupId, memberId));
  return (
    <>
      <Text style={styles.heading}>{t`Dane do spłaty`}</Text>
      {details.isPending ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : details.isError ? (
        <View style={styles.box}>
          <Text style={styles.muted}>{t`Nie udało się wczytać danych do spłaty.`}</Text>
          <Pressable accessibilityRole="button" onPress={() => void details.refetch()}>
            <Text style={styles.link}>{t`Spróbuj ponownie`}</Text>
          </Pressable>
        </View>
      ) : !hasPayoutDetails(details.data) ? (
        <Text style={styles.muted}>{t`Brak danych do spłaty. Zapytaj o nie bezpośrednio.`}</Text>
      ) : (
        <View style={styles.box}>
          {details.data.bankAccount ? (
            <CopyRow
              label={t`Numer konta`}
              value={formatBankAccount(details.data.bankAccount)}
              copyValue={details.data.bankAccount}
            />
          ) : null}
          {details.data.blikPhone ? (
            <CopyRow label={t`Telefon BLIK`} value={details.data.blikPhone} copyValue={details.data.blikPhone} />
          ) : null}
        </View>
      )}
    </>
  );
}

/**
 * A payout detail with a copy button. `copyValue` is what lands in the
 * clipboard (no grouping spaces, so banking apps accept it).
 */
function CopyRow({ label, value, copyValue }: { label: string; value: string; copyValue: string }) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await Clipboard.setStringAsync(copyValue);
    setCopied(true);
  };
  return (
    <View style={styles.row}>
      <View style={styles.detail} accessible accessibilityLabel={`${label}: ${value}`}>
        <Text style={styles.muted}>{label}</Text>
        <Text style={styles.value} selectable>
          {value}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t`Kopiuj: ${label}`}
        accessibilityLiveRegion="polite"
        onPress={() => void copy()}
        style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
        <Text style={styles.copyLabel}>{copied ? t`Skopiowano` : t`Kopiuj`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    padding: theme.space(6),
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space(3),
    padding: theme.space(4),
    paddingBottom: theme.space(10),
  },
  title: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  field: {
    gap: theme.space(2),
  },
  label: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    minHeight: 48,
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  amountInput: {
    flex: 1,
    paddingVertical: theme.space(2),
    color: theme.colors.text,
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
  },
  inputInvalid: {
    borderColor: theme.colors.negative,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(2),
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
  heading: {
    marginTop: theme.space(2),
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  box: {
    gap: theme.space(2),
    padding: theme.space(4),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space(2),
    minHeight: 48,
  },
  detail: {
    flex: 1,
    minWidth: 160,
    gap: theme.space(0.5),
  },
  value: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  copy: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  copyLabel: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  link: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.primary,
  },
}));
