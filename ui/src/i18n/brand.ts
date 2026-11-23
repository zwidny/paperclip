/**
 * Product name shown in the UI.
 *
 * Locale files use the `{{brand}}` interpolation instead of a hardcoded name, so
 * a white-label build only changes configuration:
 *
 *   VITE_BRAND_NAME       brand for every locale      (default "Paperclip")
 *   VITE_BRAND_NAME_ZH    brand for Simplified Chinese (default "Gnzs")
 *
 * Both are read at build time by Vite. Runtime changes need a rebuild, which is
 * the same trade-off the rest of the bundle already makes.
 */
const FALLBACK_BRAND = "Paperclip";
const ZH_CN_BRAND = "Gnzs";

function fromEnv(name: string): string | undefined {
  const env = import.meta.env as unknown as Record<string, unknown>;
  const raw = env?.[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/** Returns the brand name for a locale tag. */
export function brandFor(locale: string): string {
  if (locale === "zh-CN") return fromEnv("VITE_BRAND_NAME_ZH") ?? ZH_CN_BRAND;
  return fromEnv("VITE_BRAND_NAME") ?? FALLBACK_BRAND;
}
