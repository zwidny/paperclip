/**
 * The "OpenAI compatible" source on the connect step.
 *
 * Most hosted and self-hosted inference servers speak the OpenAI wire protocol
 * (DeepSeek, vLLM, LiteLLM, Ollama, Azure, …) but are not OpenAI. The harnesses
 * Paperclip already drives can be pointed at such an endpoint, but only through
 * adapter configuration that no onboarding surface exposed: Codex through
 * `PAPERCLIP_CODEX_PROVIDERS` (a `config.toml` `[model_providers.*]` block) and
 * OpenCode through `PAPERCLIP_OPENCODE_PROVIDERS` (an `opencode.json` provider
 * block). This module is the single place that turns the wizard's three inputs
 * — base URL, model, API key — into the env var the matching adapter reads.
 *
 * It is pure so the mapping can be tested without a browser, and it deliberately
 * leaves the API key out of the generated JSON. The key reaches the provider
 * through an `{env:VAR}` placeholder the adapter resolves server-side at run
 * time, so the persisted adapter config holds a secret reference rather than a
 * live credential.
 */

/** The tile id. It is not an adapter type; picking it drives a real harness. */
export const OPENAI_COMPATIBLE_SOURCE_ID = "openai_compatible";

/** The env var the endpoint's key is stored under and read back from. */
export const OPENAI_COMPATIBLE_API_KEY_ENV_KEY = "OPENAI_COMPATIBLE_API_KEY";

/**
 * The provider id used inside the generated config. Fixed rather than derived
 * from the base URL: provider ids end up in model ids (`custom/deepseek-chat`)
 * and must be stable across a re-connect, or a saved model would stop resolving.
 */
export const OPENAI_COMPATIBLE_PROVIDER_ID = "custom";

export type OpenAICompatibleHarness = "opencode_local" | "codex_local";

/**
 * The harnesses this step can drive against a compatible endpoint.
 *
 * Both adapters' environment tests materialize the provider table before they
 * probe — OpenCode reads `PAPERCLIP_OPENCODE_PROVIDERS`, Codex merges
 * `PAPERCLIP_CODEX_PROVIDERS` into a temporary `CODEX_HOME/config.toml` — so
 * Test and the hire agree about which endpoint is being used.
 *
 * Pi understands `PAPERCLIP_PI_PROVIDERS` at run time but its probe does not
 * write the managed `models.json` yet; adding it here would let the wizard
 * advance on a probe that never saw the endpoint.
 */
export const OPENAI_COMPATIBLE_HARNESSES: ReadonlyArray<{
  id: OpenAICompatibleHarness;
  label: string;
}> = [
  { id: "opencode_local", label: "OpenCode" },
  { id: "codex_local", label: "Codex" },
];

export function isOpenAICompatibleHarness(value: string): value is OpenAICompatibleHarness {
  return OPENAI_COMPATIBLE_HARNESSES.some((harness) => harness.id === value);
}

export interface OpenAICompatibleEndpoint {
  baseUrl: string;
  model: string;
}

/** Both fields are required; the key is validated by the connect step itself. */
export function isOpenAICompatibleEndpointComplete(
  endpoint: OpenAICompatibleEndpoint,
): boolean {
  return endpoint.baseUrl.trim().length > 0 && endpoint.model.trim().length > 0;
}

/**
 * The `model` value the adapter receives.
 *
 * OpenCode resolves `--model provider/model` against its provider registry, so
 * the fixed provider id has to be prefixed. Codex takes a bare model id and
 * selects the provider separately through `model_provider` in its config.
 */
export function openAICompatibleModelId(
  harness: OpenAICompatibleHarness,
  model: string,
): string {
  const trimmed = model.trim();
  if (!trimmed) return "";
  return harness === "codex_local"
    ? trimmed
    : `${OPENAI_COMPATIBLE_PROVIDER_ID}/${trimmed}`;
}

/** Strip a trailing slash so `…/v1` and `…/v1/` produce the same config. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * The env var and JSON the chosen harness reads to reach a compatible endpoint.
 *
 * Returns null for an incomplete endpoint, so a card mid-typing never writes a
 * half-formed provider that the adapter would then reject at run time.
 */
export function openAICompatibleProviderEnv(
  harness: OpenAICompatibleHarness,
  endpoint: OpenAICompatibleEndpoint,
): { envKey: string; value: string } | null {
  if (!isOpenAICompatibleEndpointComplete(endpoint)) return null;
  const baseUrl = normalizeBaseUrl(endpoint.baseUrl);
  const model = endpoint.model.trim();
  if (!baseUrl) return null;

  if (harness === "codex_local") {
    // DeepSeek and most compatible servers expose Chat Completions, not the
    // Responses API Codex defaults to. `wire_api = "chat"` is what makes an
    // otherwise-correct `base_url` work.
    return {
      envKey: "PAPERCLIP_CODEX_PROVIDERS",
      value: JSON.stringify({
        providers: {
          [OPENAI_COMPATIBLE_PROVIDER_ID]: {
            name: "OpenAI compatible",
            base_url: baseUrl,
            env_key: OPENAI_COMPATIBLE_API_KEY_ENV_KEY,
            wire_api: "chat",
          },
        },
        model_provider: OPENAI_COMPATIBLE_PROVIDER_ID,
      }),
    };
  }

  return {
    envKey: "PAPERCLIP_OPENCODE_PROVIDERS",
    value: JSON.stringify({
      [OPENAI_COMPATIBLE_PROVIDER_ID]: {
        npm: "@ai-sdk/openai-compatible",
        name: "OpenAI compatible",
        options: {
          baseURL: baseUrl,
          // Resolved server-side by the adapter's runtime-config step.
          apiKey: `{env:${OPENAI_COMPATIBLE_API_KEY_ENV_KEY}}`,
        },
        models: {
          [model]: { name: model },
        },
      },
    }),
  };
}
