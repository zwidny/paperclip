/**
 * Product name for server-authored copy.
 *
 *   BRAND_NAME    brand used in every server message (default "Gnzs")
 *
 * Tests keep the upstream name so master's assertions stay valid.
 */
const TEST_BRAND = "Paperclip";
const DEFAULT_BRAND = "Gnzs";

/** Read one environment value at call time, so a deployment can change it. */
function envValue(name: string): string | undefined {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/**
 * The product name server-authored messages use.
 *
 * The env is read on every call, never cached at module scope: a deployment
 * sets `BRAND_NAME` and every later message follows it.
 */
export function brandName(): string {
  const explicit = envValue("BRAND_NAME");
  if (explicit) return explicit;
  const testMode = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  return testMode ? TEST_BRAND : DEFAULT_BRAND;
}

/**
 * Replaces a capitalized, whole-word product name in copy that is rendered or
 * exported to a user.
 *
 * The lookarounds keep camelCase (`enablePaperclipNotebook`), lowercase hosts
 * and paths (`paperclip.ing`, `/paperclip/instances/…`), uppercase identifiers
 * (`PAPERCLIP_*`) and header/protocol names (`X-Paperclip-Route`) intact. A
 * plain `\b` word boundary would rewrite the header prefix too, because the
 * `-` in `X-Paperclip-` is a non-word character.
 */
export function brandText(text: string): string {
  if (!text.includes("Paperclip")) return text;
  return text.replace(/(?<![-\w])Paperclip(?!\w)/g, brandName());
}
