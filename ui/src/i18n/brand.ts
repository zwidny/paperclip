/**
 * Product name shown in the UI.
 *
 * Locale files use the `{{brand}}` interpolation instead of a hardcoded name, so a
 * white-label build only changes configuration:
 *
 *   VITE_BRAND_NAME       brand for every locale       (default "Gnzs")
 *   VITE_BRAND_NAME_ZH    brand for Simplified Chinese (defaults to VITE_BRAND_NAME)
 *
 * Both are read at build time by Vite; a runtime change needs a rebuild, which is
 * the same trade-off the rest of the bundle makes.
 *
 * Tests run with the upstream name on purpose. Their assertions quote the copy
 * master ships ("Paperclip Cloud", "Paperclip Runner"), and those assertions are
 * about product behaviour, not about which name this build chose. Keeping the
 * test-mode default here means a white-label build does not have to rewrite
 * hundreds of upstream assertions — and does not have to redo it after every
 * upstream merge.
 */
const TEST_BRAND = "Paperclip";
const DEFAULT_BRAND = "Gnzs";

export interface BrandInputs {
  locale: string;
  /** Build-time env, as `import.meta.env` provides it. */
  env?: Record<string, unknown>;
  /** True under Vitest, where upstream copy should stay intact. */
  testMode?: boolean;
}

function readEnv(env: Record<string, unknown> | undefined, name: string): string | undefined {
  const raw = env?.[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/** Pure resolver so both branches can be tested without faking the build mode. */
export function resolveBrand({ locale, env, testMode = false }: BrandInputs): string {
  // Most specific first: a locale override, then the build-wide override.
  if (locale === "zh-CN") {
    const zh = readEnv(env, "VITE_BRAND_NAME_ZH");
    if (zh) return zh;
  }
  const explicit = readEnv(env, "VITE_BRAND_NAME");
  if (explicit) return explicit;
  if (testMode) return TEST_BRAND;
  return DEFAULT_BRAND;
}

/** Returns the brand name for a locale tag in the current build. */
export function brandFor(locale: string): string {
  const env = import.meta.env as unknown as Record<string, unknown>;
  return resolveBrand({ locale, env, testMode: env?.MODE === "test" });
}

/**
 * Replaces a capitalized, whole-word product name in copy that does not go
 * through i18n, such as connector catalog text from `@paperclipai/shared`.
 *
 * The lookarounds keep camelCase keys (`enablePaperclipNotebook`), lowercase
 * paths or hosts (`paperclip.ing`, `/paperclip/instances/…`) and
 * header/protocol names (`X-Paperclip-Route`) intact. A plain `\b` boundary
 * would rewrite the header prefix, because the `-` in `X-Paperclip-` is a
 * non-word character. `Paperclip's` becomes `Gnzs's`, matching the possessive
 * form upstream uses for Latin names.
 */
export function replaceBrandIn(text: string, brand: string): string {
  if (!text.includes("Paperclip")) return text;
  return text.replace(/(?<![-\w])Paperclip(?!\w)/g, brand);
}
