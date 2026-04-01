import { enUS } from "date-fns/locale/en-US";
import { es } from "date-fns/locale/es";
import type { Locale } from "date-fns";

const DATE_LOCALES: Record<string, Locale> = { en: enUS, es };

/** Get the date-fns Locale matching the current i18n language code. */
export function getDateLocale(lang: string): Locale {
  return DATE_LOCALES[lang] || enUS;
}
