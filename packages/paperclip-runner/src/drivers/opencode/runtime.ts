/**
 * The two qualified OpenCode runtimes Paperclip can run.
 *
 * `v1` is the default so an existing installation keeps working while `v2`
 * support is still being proven. Select `v2` with
 * `PAPERCLIP_OPENCODE_RUNTIME=v2`; any other value selects `v1`.
 *
 * The protocol differences between the two servers live in the driver, not
 * here. This module only describes which npm package, version, platform
 * packages, and native executable each runtime is pinned to.
 */
export const OPENCODE_RUNTIME_ENV = "PAPERCLIP_OPENCODE_RUNTIME" as const;

export type OpenCodeRuntimeVariant = "v1" | "v2";

export interface OpenCodeRuntimeDescription {
  readonly runtime: OpenCodeRuntimeVariant;
  /** Root package that declares the pinned platform artifacts. */
  readonly packageName: string;
  /** Exact qualified version of the root package and its platform artifacts. */
  readonly version: string;
  /**
   * Native executable paths inside the platform package, in preferred order.
   *
   * Both published platform artifacts currently ship `bin/opencode`, while the
   * root wrapper declares `bin/opencode.exe`. The v2 entry keeps `bin/opencode.exe`
   * first because that is the name observed for v2 installs, then falls back to
   * the `bin/opencode` layout that `@opencode/cli@2.4.1` platform packages ship.
   * v1 only ever ships `bin/opencode`.
   */
  readonly executableNames: readonly string[];
  /** Platform package candidates keyed by `${platform}-${architecture}`. */
  readonly platformPackages: Readonly<Record<string, readonly string[]>>;
}

const OPENCODE_RUNTIMES = {
  v1: {
    runtime: "v1",
    packageName: "opencode-ai",
    version: "1.18.34",
    executableNames: ["bin/opencode"],
    platformPackages: {
      "linux-x64": ["opencode-linux-x64-baseline"],
      "darwin-arm64": ["opencode-darwin-arm64"],
      "darwin-x64": ["opencode-darwin-x64-baseline"],
    },
  },
  v2: {
    runtime: "v2",
    packageName: "@opencode/cli",
    version: "2.4.1",
    executableNames: ["bin/opencode.exe", "bin/opencode"],
    platformPackages: {
      "linux-x64": [
        "@opencode/cli-linux-x64-baseline",
        "@opencode/cli-linux-x64",
      ],
      "darwin-arm64": ["@opencode/cli-darwin-arm64"],
      "darwin-x64": [
        "@opencode/cli-darwin-x64-baseline",
        "@opencode/cli-darwin-x64",
      ],
    },
  },
} as const satisfies Record<OpenCodeRuntimeVariant, OpenCodeRuntimeDescription>;

/** Select the runtime from the environment. Anything but `v2` means `v1`. */
export function selectedOpenCodeRuntime(
  environment: NodeJS.ProcessEnv = process.env,
): OpenCodeRuntimeVariant {
  return environment[OPENCODE_RUNTIME_ENV] === "v2" ? "v2" : "v1";
}

export function openCodeRuntimeDescription(
  runtime: OpenCodeRuntimeVariant = selectedOpenCodeRuntime(),
): OpenCodeRuntimeDescription {
  return OPENCODE_RUNTIMES[runtime];
}

/**
 * Version of the runtime selected when this module loaded. The runner selects
 * its runtime through the process environment, so this is evaluated once per
 * process, the same way the driver's `QUALIFIED_OPENCODE_VERSION` is.
 */
export const SELECTED_OPENCODE_VERSION: string =
  openCodeRuntimeDescription().version;

