import i18n, { type InitOptions, type TOptions } from "i18next";
import {
  initReactI18next,
  useTranslation as useReactI18nextTranslation,
} from "react-i18next";

import {
  DEFAULT_LOCALE,
  i18nextResources,
  loadLocaleMessages,
  supportedLocales,
} from "./locales";
import {
  normalizeLocale,
  persistLocale,
  resolveInitialLocale,
} from "./locale-preference";

export const initialLocale = resolveInitialLocale(
  supportedLocales,
  DEFAULT_LOCALE,
);

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
  partialBundledLanguages: true,
};

void i18n
  .use(initReactI18next)
  .init(i18nextOptions)
  .catch((error: unknown) => {
    console.error("Failed to initialize i18next", error);
  });

function applyDocumentLanguage(locale: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

async function ensureLocaleBundle(locale: string): Promise<void> {
  if (i18n.hasResourceBundle(locale, "translation")) return;
  const messages = await loadLocaleMessages(locale);
  i18n.addResourceBundle(locale, "translation", messages, true, true);
}

export const localeReady: Promise<void> = (async () => {
  try {
    await ensureLocaleBundle(initialLocale);
    if (i18n.language !== initialLocale) {
      await i18n.changeLanguage(initialLocale);
    }
  } catch (error) {
    console.error("Failed to load the initial locale bundle", error);
  }
  applyDocumentLanguage(i18n.language || DEFAULT_LOCALE);
})();

/**
 * Switch the interface language and remember it.
 *
 * Unknown tags are ignored rather than silently writing a locale with no
 * resources, which would leave every string on its English fallback while the
 * picker claimed otherwise.
 */
export async function changeLocale(locale: string): Promise<string> {
  const next = normalizeLocale(locale, supportedLocales);
  if (!next) return i18n.language || DEFAULT_LOCALE;
  await ensureLocaleBundle(next);
  await i18n.changeLanguage(next);
  persistLocale(next);
  applyDocumentLanguage(next);
  return next;
}

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { supportedLocales } from "./locales";
export { i18n };
