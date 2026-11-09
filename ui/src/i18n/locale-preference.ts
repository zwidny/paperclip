/**
 * Which language the UI opens in, and where that choice is remembered.
 *
 * The locale is a per-browser preference, not company data: two people on the
 * same instance can read different languages, and a switch must survive a
 * reload without a server round trip. It therefore lives in `localStorage`,
 * with the browser's own language list as the first-run fallback.
 *
 * Everything here is defensive about a missing or hostile `window`: the module
 * is imported by tests (jsdom) and could be reached from a pre-render.
 */

export const LOCALE_STORAGE_KEY = "paperclip-locale";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Storage can throw outright when a browser blocks it for the origin.
    return null;
  }
}

/**
 * Match a tag like `zh-Hans-CN` to one of the shipped locale files.
 *
 * Exact tags win. A bare language (`zh`) falls to the first shipped variant of
 * that language, and a script subtag (`zh-Hant`) prefers the traditional
 * variant where one exists. Returning null lets the caller keep looking rather
 * than pinning everyone to the default.
 */
export function normalizeLocale(
  input: string | null | undefined,
  supported: readonly string[],
): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase().replace(/_/g, "-");
  const exact = supported.find((locale) => locale.toLowerCase() === lower);
  if (exact) return exact;

  const [base, ...rest] = lower.split("-");
  if (!base) return null;

  // Script subtags decide between simplified and traditional before region
  // does: a `zh-Hant-SG` reader expects traditional Chinese, not Singapore's
  // simplified default.
  if (base === "zh") {
    const traditional = rest.includes("hant") || rest.includes("tw") || rest.includes("hk") || rest.includes("mo");
    const preferred = traditional ? ["zh-TW", "zh-CN"] : ["zh-CN", "zh-TW"];
    for (const candidate of preferred) {
      const match = supported.find((locale) => locale.toLowerCase() === candidate.toLowerCase());
      if (match) return match;
    }
  }

  const sameBase = supported.filter((locale) => locale.toLowerCase().split("-")[0] === base);
  if (sameBase.length === 0) return null;
  // Region match first (`pt-BR` for `pt-br`), then the language's first entry.
  const region = rest.join("-");
  return sameBase.find((locale) => locale.toLowerCase() === `${base}-${region}`) ?? sameBase[0] ?? null;
}

function browserLocales(): string[] {
  if (typeof navigator === "undefined") return [];
  const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
  return [...languages, navigator.language].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/** The stored choice, else the browser's best supported language, else `fallback`. */
export function resolveInitialLocale(
  supported: readonly string[],
  fallback: string,
  storage: StorageLike | null = defaultStorage(),
): string {
  const stored = normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY), supported);
  if (stored) return stored;
  for (const candidate of browserLocales()) {
    const match = normalizeLocale(candidate, supported);
    if (match) return match;
  }
  return normalizeLocale(fallback, supported) ?? fallback;
}

export function persistLocale(
  locale: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // A full or blocked storage must not stop the in-memory switch.
  }
}
