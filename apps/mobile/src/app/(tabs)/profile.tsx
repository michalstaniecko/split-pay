import { useLingui } from '@lingui/react/macro';
import { LanguagePicker } from '@/components/language-picker';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ProfileScreen() {
  const { t } = useLingui();
  return (
    <PlaceholderScreen title={t`Profil`}>
      <LanguagePicker />
    </PlaceholderScreen>
  );
}
