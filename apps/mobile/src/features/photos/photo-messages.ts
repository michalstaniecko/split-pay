import { useLingui } from '@lingui/react/macro';
import { PHOTO_LIMITS } from '@split-pay/shared';
import type { PhotoProblem } from './photo-draft';

/** Translated messages for the photo limits the API enforces (and other upload failures). */
export function usePhotoProblemMessages(): Record<PhotoProblem, string> {
  const { t } = useLingui();
  const megabytes = Math.round(PHOTO_LIMITS.maxBytes / (1024 * 1024));
  const perEntry = PHOTO_LIMITS.maxUploadsPerEntry;
  const perDay = PHOTO_LIMITS.maxUploadsPerDay;
  const uploadFailed = t`Nie udało się wysłać zdjęcia. Spróbuj ponownie.`;
  return {
    photo_too_large: t`Zdjęcie jest za duże (maks. ${megabytes} MB).`,
    // The uploaded file didn't arrive intact; the API deleted it, so trying again uploads it anew.
    photo_upload_invalid: uploadFailed,
    too_many_photos_for_entry: t`Do tego wpisu wysłano już ${perEntry} zdjęć — to limit.`,
    daily_photo_limit: t`Dzisiejszy limit ${perDay} zdjęć został wykorzystany. Spróbuj jutro.`,
    storage_unavailable: t`Zdjęcia są teraz niedostępne. Spróbuj później.`,
    upload_failed: uploadFailed,
  };
}
