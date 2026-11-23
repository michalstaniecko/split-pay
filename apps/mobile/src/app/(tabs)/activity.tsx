import { useLingui } from '@lingui/react/macro';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ActivityScreen() {
  const { t } = useLingui();
  return <PlaceholderScreen title={t`Aktywność`} />;
}
