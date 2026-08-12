import { Languages } from "lucide-react";
import { supportedLocales, useI18n, type Locale } from "@/lib/i18n";

const localeLabels: Record<Locale, string> = {
  en: "EN",
  es: "ES",
};

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="locale-switcher">
      <span className="sr-only">{t("locale.label")}</span>
      <Languages size={15} aria-hidden="true" />
      <select
        value={locale}
        aria-label={t("locale.label")}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {supportedLocales.map((item) => (
          <option key={item} value={item}>
            {localeLabels[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
