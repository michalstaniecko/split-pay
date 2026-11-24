import { createFormatters, type Formatters } from './formatters';
import { useLocale } from './locale-provider';

/** Amount and date formatting bound to the active UI language. */
export function useFormatters(): Formatters {
  const { locale } = useLocale();
  return createFormatters(locale);
}
