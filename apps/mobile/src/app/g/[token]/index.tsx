import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { memberName } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { DetailedError } from 'hono/client';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupAvatar } from '@/components/group-avatar';
import { type ClaimableMember, joinChoices } from '@/features/claims/claims';
import { useClaimMember } from '@/features/claims/claims-query';
import { pendingJoin } from '@/features/group-link/group-link';
import { linkPreviewQuery, useJoinGroup } from '@/features/group-link/group-link-query';
import { useLocale } from '@/i18n/locale-provider';
import { authClient } from '@/lib/auth-client';

const openConversation = (groupId: string) => router.replace({ pathname: '/groups/[groupId]', params: { groupId } });

/**
 * A group link opened in the app. This route lives outside the signed-in
 * group because on the web the same URL is the view-only web
 * (`index.web.tsx`). Signed out: sign in first — the link is remembered
 * (`+native-intent.tsx`) and reopened afterwards (`usePendingJoin`).
 */
export default function GroupLinkRoute() {
  const { theme } = useUnistyles();
  const session = authClient.useSession();
  if (session.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (!session.data) return <Redirect href="/sign-in" />;
  return <JoinScreen />;
}

/**
 * Join screen: where a group link or a personal claim link
 * (`splitpay://g/<token>`) leads in the app (ADR-0007, ADR-0009). Group link:
 * "Dołącz jako nowa osoba" adds me as a member, or "Jesteś jednym z nich?"
 * claims a member without an account. Personal claim link: claim its member
 * directly. Either opens the group's Conversation; if I'm already in the group
 * it opens right away.
 */
function JoinScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { locale } = useLocale();
  const preview = useQuery(linkPreviewQuery(token));
  const join = useJoinGroup(token);
  const claim = useClaimMember(token);

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
  // A member whose name was removed (ADR-0019) is offered as "Deleted user".
  const claimable = preview.data.claimable.map((m) => ({ ...m, displayName: memberName(m, locale) }));
  const choices = joinChoices({ ...preview.data, claimable });
  const busy = join.isPending || claim.isPending;
  const personalName = choices.kind === 'personal' ? choices.member.displayName : '';
  const onJoin = () => join.mutate(undefined, { onSuccess: ({ groupId }) => openConversation(groupId) });
  const onClaim = (memberId: string) =>
    claim.mutate(memberId, {
      onSuccess: ({ groupId }) => openConversation(groupId),
      // Someone may have claimed the profile meanwhile: show the fresh list.
      onError: () => void preview.refetch(),
    });
  const claimButton = (member: ClaimableMember) => (
    <Button
      key={member.id}
      variant="secondary"
      label={member.displayName}
      loading={claim.isPending && claim.variables === member.id}
      disabled={busy}
      onPress={() => onClaim(member.id)}
    />
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {header}
      <GroupAvatar emoji={group.emoji} color={group.color} size={88} />
      <Text style={styles.name}>{group.name}</Text>
      <Text style={styles.text}>
        {t`${plural(memberCount, { one: '# osoba w grupie', few: '# osoby w grupie', many: '# osób w grupie', other: '# osoby w grupie' })}`}
      </Text>
      {choices.kind === 'personal' ? (
        <View style={styles.actions}>
          <Text style={styles.text}>{t`Ten link jest dla osoby „${personalName}”. Przejmij ten profil razem z historią wydatków.`}</Text>
          <Button
            label={t`Jestem ${personalName}`}
            loading={claim.isPending}
            onPress={() => onClaim(choices.member.id)}
          />
        </View>
      ) : choices.kind === 'personal-taken' ? (
        <View style={styles.actions}>
          <Text style={styles.text}>{t`Ten profil ma już konto. Poproś kogoś z grupy o link grupy.`}</Text>
          <Button variant="secondary" label={t`Wróć`} onPress={() => router.replace('/')} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Button label={t`Dołącz jako nowa osoba`} loading={join.isPending} disabled={busy} onPress={onJoin} />
          {choices.claimable.length > 0 ? (
            <>
              <Text style={styles.subtitle}>{t`Jesteś jednym z nich?`}</Text>
              <Text style={styles.text}>{t`Przejmij profil osoby bez konta razem z historią wydatków.`}</Text>
              {choices.claimable.map(claimButton)}
            </>
          ) : null}
        </View>
      )}
      <View style={styles.actions}>
        {join.isError ? <Text style={styles.error}>{t`Nie udało się dołączyć. Spróbuj ponownie.`}</Text> : null}
        {claim.isError ? (
          <Text style={styles.error}>
            {claimConflict(claim.error)
              ? t`Ten profil został już przejęty.`
              : t`Nie udało się przejąć profilu. Spróbuj ponownie.`}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** 409 from the claim route: the profile has an account now (or I'm already in the group). */
const claimConflict = (error: unknown) => error instanceof DetailedError && error.statusCode === 409;

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(3),
    padding: theme.space(6),
  },
  subtitle: {
    marginTop: theme.space(4),
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
    textAlign: 'center',
  },
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
