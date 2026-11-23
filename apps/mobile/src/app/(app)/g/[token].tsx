import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { DetailedError } from 'hono/client';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupAvatar } from '@/components/group-avatar';
import { pendingJoin } from '@/features/group-link/group-link';
import { linkPreviewQuery, useJoinGroup } from '@/features/group-link/group-link-query';

const openConversation = (groupId: string) => router.replace({ pathname: '/groups/[groupId]', params: { groupId } });

/**
 * Join screen: where a group link (`splitpay://g/<token>`) leads in the app
 * (ADR-0009). "Dołącz jako nowa osoba" adds me as a member and opens the
 * group's Conversation; if I'm already in the group it opens right away.
 * TODO(#18): "Jesteś jednym z nich?" — claim a member without an account.
 */
export default function JoinScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const preview = useQuery(linkPreviewQuery(token));
  const join = useJoinGroup(token);

  // This link is handled now; don't replay it after a later sign-in.
  useEffect(() => {
    pendingJoin.take();
  }, []);

  const alreadyMemberOf = preview.data?.isMember ? preview.data.group.id : undefined;
  useEffect(() => {
    if (alreadyMemberOf) openConversation(alreadyMemberOf);
  }, [alreadyMemberOf]);

  const header = <Stack.Screen options={{ title: t`Dołącz do grupy` }} />;

  if (preview.isPending || alreadyMemberOf) {
    return (
      <View style={styles.center}>
        {header}
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (preview.isError) {
    const invalid = preview.error instanceof DetailedError && preview.error.statusCode === 404;
    return (
      <View style={styles.center}>
        {header}
        <Text style={styles.text}>
          {invalid
            ? t`Ten link grupy jest nieważny. Poproś kogoś z grupy o nowy.`
            : t`Nie udało się otworzyć linku grupy.`}
        </Text>
        {invalid ? null : <Button variant="secondary" label={t`Spróbuj ponownie`} onPress={() => void preview.refetch()} />}
        <Button variant="secondary" label={t`Wróć`} onPress={() => router.replace('/')} />
      </View>
    );
  }

  const { group, memberCount } = preview.data;
  const onJoin = () => join.mutate(undefined, { onSuccess: ({ groupId }) => openConversation(groupId) });

  return (
    <View style={styles.center}>
      {header}
      <GroupAvatar emoji={group.emoji} color={group.color} size={88} />
      <Text style={styles.name}>{group.name}</Text>
      <Text style={styles.text}>
        {t`${plural(memberCount, { one: '# osoba w grupie', few: '# osoby w grupie', many: '# osób w grupie', other: '# osoby w grupie' })}`}
      </Text>
      <View style={styles.actions}>
        <Button label={t`Dołącz jako nowa osoba`} loading={join.isPending} onPress={onJoin} />
        {join.isError ? <Text style={styles.error}>{t`Nie udało się dołączyć. Spróbuj ponownie.`}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(3),
    padding: theme.space(6),
    backgroundColor: theme.colors.background,
  },
  name: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  text: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.space(2),
    marginTop: theme.space(4),
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
    textAlign: 'center',
  },
}));
