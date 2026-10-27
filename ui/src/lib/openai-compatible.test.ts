import { describe, expect, it } from "vitest";

import {
  OPENAI_COMPATIBLE_API_KEY_ENV_KEY,
  OPENAI_COMPATIBLE_PROVIDER_ID,
  openAICompatibleModelId,
  openAICompatibleProviderEnv,
  isOpenAICompatibleEndpointComplete,
} from "./openai-compatible";

describe("openAICompatibleModelId", () => {
  it("prefixes the fixed provider id for OpenCode", () => {
    expect(openAICompatibleModelId("opencode_local", "deepseek-chat")).toBe(
      "custom/deepseek-chat",
    );
  });

  it("leaves Codex model ids bare, because it selects the provider separately", () => {
    expect(openAICompatibleModelId("codex_local", "deepseek-chat")).toBe("deepseek-chat");
  });

  it("returns an empty id when no model is typed", () => {
    expect(openAICompatibleModelId("opencode_local", "   ")).toBe("");
  });
});

describe("isOpenAICompatibleEndpointComplete", () => {
  it("requires both a base URL and a model", () => {
    expect(isOpenAICompatibleEndpointComplete({ baseUrl: "", model: "x" })).toBe(false);
    expect(isOpenAICompatibleEndpointComplete({ baseUrl: "https://x", model: " " })).toBe(false);
    expect(
      isOpenAICompatibleEndpointComplete({ baseUrl: "https://x", model: "deepseek-chat" }),
    ).toBe(true);
  });
});

describe("openAICompatibleProviderEnv", () => {
  it("builds an OpenCode provider block with a secret placeholder", () => {
    const env = openAICompatibleProviderEnv("opencode_local", {
      baseUrl: "https://api.deepseek.com/v1/",
      model: "deepseek-chat",
    });
    expect(env?.envKey).toBe("PAPERCLIP_OPENCODE_PROVIDERS");
    const parsed = JSON.parse(env!.value);
    expect(parsed[OPENAI_COMPATIBLE_PROVIDER_ID]).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "OpenAI compatible",
      options: {
        baseURL: "https://api.deepseek.com/v1",
        apiKey: `{env:${OPENAI_COMPATIBLE_API_KEY_ENV_KEY}}`,
      },
      models: { "deepseek-chat": { name: "deepseek-chat" } },
    });
  });

  it("builds a Codex model_providers block that speaks Chat Completions", () => {
    const env = openAICompatibleProviderEnv("codex_local", {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    });
    expect(env?.envKey).toBe("PAPERCLIP_CODEX_PROVIDERS");
    const parsed = JSON.parse(env!.value);
    expect(parsed.model_provider).toBe(OPENAI_COMPATIBLE_PROVIDER_ID);
    expect(parsed.providers[OPENAI_COMPATIBLE_PROVIDER_ID]).toEqual({
      name: "OpenAI compatible",
      base_url: "https://api.deepseek.com/v1",
      env_key: OPENAI_COMPATIBLE_API_KEY_ENV_KEY,
      wire_api: "chat",
    });
  });

  it("never embeds a credential, only the env placeholder", () => {
    const env = openAICompatibleProviderEnv("opencode_local", {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    });
    expect(env!.value).not.toContain("sk-");
  });

  it("returns null while the endpoint is incomplete", () => {
    expect(
      openAICompatibleProviderEnv("opencode_local", { baseUrl: "", model: "deepseek-chat" }),
    ).toBeNull();
  });
});
