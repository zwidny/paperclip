import { useId } from "react";

import { changeLocale, i18n, supportedLocales, useTranslation } from "../i18n";
import { cn } from "../lib/utils";

/**
 * Native names for the locales a person is most likely to look for. A name in
 * its own language is what someone scanning a list recognizes; the rest fall
 * back to `Intl.DisplayNames`, then to the raw tag.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  ru: "Русский",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  ar: "العربية",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
  vi: "Tiếng Việt",
  th: "ไทย",
};

function displayName(locale: string): string {
  const known = LANGUAGE_NAMES[locale];
  if (known) return known;
  try {
    const names = new Intl.DisplayNames([locale], { type: "language" });
    return names.of(locale) ?? locale;
  } catch {
    return locale;
  }
}

/**
 * Switch the interface language.
 *
 * A plain `<select>` rather than a menu: the list is long, the choice is
 * persistent, and the platform control already handles keyboard and screen
 * reader behaviour correctly.
 */
export function LanguageSwitcher({
  className,
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const current = i18n.language || "en";

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <label htmlFor={id} className="block text-sm font-medium">
          {t("settings.language.label", { defaultValue: "Language" })}
        </label>
      )}
      <select
        id={id}
        aria-label={t("settings.language.label", { defaultValue: "Language" })}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={current}
        onChange={(event) => {
          void changeLocale(event.target.value);
        }}
      >
        {supportedLocales.map((locale) => (
          <option key={locale} value={locale}>
            {displayName(locale)}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        {t("settings.language.hint", {
          defaultValue: "Applies to this browser. Translating every screen is in progress; untranslated text stays in English.",
        })}
      </p>
    </div>
  );
}
