import { useLingui } from '@lingui/react/macro';
import { Button } from '@/components/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { closeSheet } from '@/lib/close-sheet';

/** Quick bill sheet — placeholder until #8. */
export default function QuickBillSheet() {
  const { t } = useLingui();
  return (
    <PlaceholderScreen title={t`Szybki rachunek`} subtitle={t`Wkrótce`}>
      <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
    </PlaceholderScreen>
  );
}
