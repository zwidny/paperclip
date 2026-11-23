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
import { brandFor } from "./brand";

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
  interpolation: { escapeValue: false, defaultVariables: { brand: brandFor(resolveInitialLocale(supportedLocales, DEFAULT_LOCALE)) } },
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

/**
 * `{{brand}}` resolves from `interpolation.defaultVariables`, so the value has to
 * follow the active language: zh-CN ships as Gnzs, other locales as Paperclip.
 */
function applyBrand(locale: string): void {
  const interpolation = i18n.options.interpolation as { defaultVariables?: Record<string, unknown> } | undefined;
  if (!interpolation) return;
  interpolation.defaultVariables = { ...(interpolation.defaultVariables ?? {}), brand: brandFor(locale) };
}

i18n.on("languageChanged", (locale) => {
  applyBrand(locale);
  applyDocumentLanguage(locale);
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

/**
 * Brand name for the active locale, as a hook so components re-render when the
 * language changes. Use `brandName()` outside React.
 */
export function useBrandName(): string {
  const { i18n: instance } = useReactI18nextTranslation();
  return brandFor(instance.language || DEFAULT_LOCALE);
}

/** Brand name for the current language without subscribing to changes. */
export function brandName(): string {
  return brandFor(i18n.language || DEFAULT_LOCALE);
}

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { supportedLocales } from "./locales";
export { i18n };
