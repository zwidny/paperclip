import type { Resource } from "i18next";

import en from "./locales/en.json";
import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;

const localeLoaders = import.meta.glob("./locales/*.json", {
  import: "default",
}) as Record<string, () => Promise<Record<string, unknown>>>;

function localeFromPath(path: string): string {
  const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
  if (!locale) {
    throw new Error(`Invalid locale file path: ${path}`);
  }
  return locale;
}

const loaderByLocale = new Map(
  Object.entries(localeLoaders).map(
    ([path, load]) => [localeFromPath(path), load] as const,
  ),
);

if (!loaderByLocale.has(DEFAULT_LOCALE)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

assertValidLocaleMessages(en);

const loadedMessages = new Map<string, Record<string, unknown>>([
  [DEFAULT_LOCALE, en],
]);

export const supportedLocales = [...loaderByLocale.keys()];

export const i18nextResources: Resource = {
  [DEFAULT_LOCALE]: { translation: en },
};

export async function loadLocaleMessages(
  locale: string,
): Promise<Record<string, unknown>> {
  const cached = loadedMessages.get(locale);
  if (cached) return cached;
  const load = loaderByLocale.get(locale);
  if (!load) {
    throw new Error(`Unknown locale: ${locale}`);
  }
  const messages = await load();
  try {
    assertValidLocaleMessages(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
  loadedMessages.set(locale, messages);
  return messages;
}

export async function loadAllLocaleMessages(): Promise<
  Record<string, Record<string, unknown>>
> {
  const entries = await Promise.all(
    supportedLocales.map(
      async (locale) => [locale, await loadLocaleMessages(locale)] as const,
    ),
  );
  return Object.fromEntries(entries);
}
