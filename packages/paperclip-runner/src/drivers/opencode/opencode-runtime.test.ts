import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPENCODE_RUNTIME_ENV,
  openCodeRuntimeDescription,
  selectedOpenCodeRuntime,
} from "./runtime.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadDriverModule(runtime?: "v1" | "v2") {
  vi.resetModules();
  if (runtime === undefined) {
    vi.unstubAllEnvs();
    delete process.env[OPENCODE_RUNTIME_ENV];
  } else {
    vi.stubEnv(OPENCODE_RUNTIME_ENV, runtime);
  }
  return await import("./opencode-server-driver.js");
}

describe("OpenCode runtime selection", () => {
  it("selects v1 when PAPERCLIP_OPENCODE_RUNTIME is unset", () => {
    expect(selectedOpenCodeRuntime({})).toBe("v1");
    expect(selectedOpenCodeRuntime({ [OPENCODE_RUNTIME_ENV]: "" })).toBe("v1");
    expect(selectedOpenCodeRuntime({ [OPENCODE_RUNTIME_ENV]: "v1" })).toBe("v1");
    expect(selectedOpenCodeRuntime({ [OPENCODE_RUNTIME_ENV]: "v22" })).toBe("v1");
    expect(selectedOpenCodeRuntime({ [OPENCODE_RUNTIME_ENV]: "v2" })).toBe("v2");
  });

  it("describes the pinned v1 and v2 runtimes", () => {
    expect(openCodeRuntimeDescription("v1")).toMatchObject({
      packageName: "opencode-ai",
      version: "1.18.34",
      executableNames: ["bin/opencode"],
      platformPackages: {
        "linux-x64": ["opencode-linux-x64-baseline"],
        "darwin-arm64": ["opencode-darwin-arm64"],
        "darwin-x64": ["opencode-darwin-x64-baseline"],
      },
    });
    expect(openCodeRuntimeDescription("v2")).toMatchObject({
      packageName: "@opencode/cli",
      version: "2.4.1",
      executableNames: ["bin/opencode.exe", "bin/opencode"],
      platformPackages: {
        "linux-x64": ["@opencode/cli-linux-x64-baseline", "@opencode/cli-linux-x64"],
        "darwin-arm64": ["@opencode/cli-darwin-arm64"],
        "darwin-x64": ["@opencode/cli-darwin-x64-baseline", "@opencode/cli-darwin-x64"],
      },
    });
  });

  it("defaults the driver to the v1 runtime", async () => {
    const driver = await loadDriverModule();
    expect(driver.QUALIFIED_OPENCODE_VERSION).toBe("1.18.34");
    const descriptor = await new driver.OpenCodeServerDriver({
      model: "openrouter/deepseek/deepseek-v4-flash-0731",
    }).descriptor();
    expect(descriptor.version).toBe("1.18.34");
    const { qualifiedOpenCodeVersionMismatch } =
      driver.openCodeServerDriverInternals;
    expect(qualifiedOpenCodeVersionMismatch("1.18.34")).toBeNull();
    expect(qualifiedOpenCodeVersionMismatch("2.4.1")).toContain(
      "is not the question-conformance-qualified 1.18.34",
    );
    expect(qualifiedOpenCodeVersionMismatch("not-a-version")).toContain(
      "omitted a semantic version",
    );
  });

  it("uses the v2 runtime when PAPERCLIP_OPENCODE_RUNTIME=v2", async () => {
    const driver = await loadDriverModule("v2");
    expect(driver.QUALIFIED_OPENCODE_VERSION).toBe("2.4.1");
    const descriptor = await new driver.OpenCodeServerDriver({
      model: "openrouter/deepseek/deepseek-v4-flash-0731",
    }).descriptor();
    expect(descriptor.version).toBe("2.4.1");
    const { qualifiedOpenCodeVersionMismatch } =
      driver.openCodeServerDriverInternals;
    expect(qualifiedOpenCodeVersionMismatch("2.4.1")).toBeNull();
    expect(qualifiedOpenCodeVersionMismatch("1.18.34")).toContain(
      "is not the question-conformance-qualified 2.4.1",
    );
  });
});
