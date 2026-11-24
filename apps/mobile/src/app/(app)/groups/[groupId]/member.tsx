import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupNotFound } from '@/components/group-not-found';
import { parseMemberName } from '@/features/groups/member-form';
import { type GroupDetailData, groupQuery, useAddMember, useRenameMember } from '@/features/groups/groups-query';
import { closeSheet } from '@/lib/close-sheet';

/**
 * Sheet from Group info: adds a member without an account (no `memberId`) or
 * renames one (`memberId`). ADR-0007, ADR-0008.
 */
export default function MemberSheet() {
  const { theme } = useUnistyles();
  const { groupId, memberId } = useLocalSearchParams<{ groupId: string; memberId?: string }>();
  const group = useQuery(groupQuery(groupId));

  if (group.isPending) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  return <MemberForm key={memberId ?? 'new'} group={group.data} memberId={memberId} />;
}

function MemberForm({ group, memberId }: { group: GroupDetailData; memberId: string | undefined }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const existing = memberId ? group.members.find((m) => m.id === memberId) : undefined;
  // One id per form: a retry after a lost response cannot add the member twice.
  const [id] = useState(() => randomUUID());
  // A removed name (ADR-0019) starts empty: renaming replaces the marker with a name.
  const [name, setName] = useState(existing?.displayName ?? '');
  const [invalid, setInvalid] = useState(false);
  const addMember = useAddMember(group.id);
  const renameMember = useRenameMember(group.id);
  const mutation = existing ? renameMember : addMember;

  if (memberId && !existing) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>{t`Tej osoby nie ma już w grupie.`}</Text>
        <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
      </View>
    );
  }

  const submit = () => {
    const parsed = parseMemberName(name);
    if (!parsed.ok) {
      setInvalid(true);
      return;
    }
    const onSuccess = () => closeSheet();
    if (existing) renameMember.mutate({ memberId: existing.id, displayName: parsed.displayName }, { onSuccess });
    else addMember.mutate({ id, displayName: parsed.displayName }, { onSuccess });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{existing ? t`Zmień imię` : t`Dodaj osobę bez konta`}</Text>
      {existing ? null : (
        <Text style={styles.hint}>{t`Wpisujesz za nią wydatki. Później może przejąć swój profil.`}</Text>
      )}
      <TextInput
        value={name}
        onChangeText={(value) => {
          setName(value);
          setInvalid(false);
        }}
        onSubmitEditing={submit}
        placeholder={t`Imię`}
        accessibilityLabel={t`Imię`}
        placeholderTextColor={theme.colors.textMuted}
        maxLength={60}
        autoFocus
        returnKeyType="done"
        style={[styles.input, invalid && styles.inputInvalid]}
      />
      {invalid ? <Text style={styles.error}>{t`Podaj imię.`}</Text> : null}
      {mutation.isError ? <Text style={styles.error}>{t`Nie udało się zapisać. Spróbuj ponownie.`}</Text> : null}
      <Button label={existing ? t`Zapisz` : t`Dodaj`} onPress={submit} loading={mutation.isPending} />
      <Button variant="secondary" label={t`Anuluj`} onPress={closeSheet} />
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
  hint: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontSize: theme.font.sizeMd,
    textAlign: 'auto',
  },
  inputInvalid: {
    borderColor: theme.colors.negative,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
