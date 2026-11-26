import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { resolvePinnedOpenCodeCommand } from "./opencode-server-driver.js";
import {
  openCodeRuntimeDescription,
  type OpenCodeRuntimeVariant,
} from "./runtime.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function installed(
  runtime: OpenCodeRuntimeVariant,
  layout: "source" | "standalone" | "vendored",
  platform: string,
  architecture: string,
  name: string,
  executableName: string = openCodeRuntimeDescription(runtime).executableNames[0]!,
) {
  const description = openCodeRuntimeDescription(runtime);
  const root = await realpath(await mkdtemp(join(tmpdir(), "paperclip-opencode-install-")));
  roots.push(root);
  const issuer = join(root, layout === "vendored" ? "dist/vendor/paperclip-runner/drivers/opencode/driver.js"
    : layout === "source" ? "src/drivers/opencode/driver.ts" : "dist/drivers/opencode/driver.js");
  const wrapper = join(root, "node_modules", description.packageName);
  const artifact = join(root, "node_modules", name);
  const executable = join(artifact, executableName);
  await mkdir(dirname(issuer), { recursive: true });
  await mkdir(join(wrapper, "bin"), { recursive: true });
  await mkdir(dirname(executable), { recursive: true });
  await writeFile(join(wrapper, "package.json"), JSON.stringify({ name: description.packageName, version: description.version, optionalDependencies: { [name]: description.version } }));
  const placeholder = 'echo "postinstall was not run" >&2\nexit 1\n';
  await writeFile(join(wrapper, "bin/opencode.exe"), placeholder, { mode: 0o755 });
  await writeFile(join(artifact, "package.json"), JSON.stringify({ name, version: description.version, os: [platform], cpu: [architecture] }));
  await writeFile(executable, `#!/bin/sh\necho ${description.version}\n`, { mode: 0o755 });
  return { issuer: pathToFileURL(issuer), wrapper, artifact, executable, root, placeholder };
}

const RUNTIME_PLATFORMS = {
  v1: [
    ["darwin", "arm64", "opencode-darwin-arm64"],
    ["darwin", "x64", "opencode-darwin-x64-baseline"],
    ["linux", "x64", "opencode-linux-x64-baseline"],
    ["linux", "arm64", "opencode-linux-arm64"],
  ],
  v2: [
    ["darwin", "arm64", "@opencode/cli-darwin-arm64"],
    ["darwin", "x64", "@opencode/cli-darwin-x64-baseline"],
    ["linux", "x64", "@opencode/cli-linux-x64-baseline"],
    ["linux", "arm64", "@opencode/cli-linux-arm64"],
  ],
} as const;

it.each(["v1", "v2"] as const)("resolves the %s platform binary in every install layout with postinstall skipped", async runtime => {
  for (const layout of ["source", "standalone", "vendored"] as const) {
    for (const [platform, architecture, name] of RUNTIME_PLATFORMS[runtime]) {
      const install = await installed(runtime, layout, platform, architecture, name);
      expect(resolvePinnedOpenCodeCommand(install.issuer, { platform, architecture, runtime })).toBe(install.executable);
      expect(await readFile(join(install.wrapper, "bin/opencode.exe"), "utf8")).toBe(install.placeholder);
    }
  }
});

it("resolves the bin/opencode layout that @opencode/cli platform packages ship", async () => {
  const install = await installed("v2", "source", "linux", "x64", "@opencode/cli-linux-x64-baseline", "bin/opencode");
  expect(resolvePinnedOpenCodeCommand(install.issuer, { platform: "linux", architecture: "x64", runtime: "v2" })).toBe(install.executable);
});

it.each(["v1", "v2"] as const)("resolves the linux arm64 platform binary of %s", async runtime => {
  const name = runtime === "v1" ? "opencode-linux-arm64" : "@opencode/cli-linux-arm64";
  const install = await installed(runtime, "source", "linux", "arm64", name, "bin/opencode");
  expect(resolvePinnedOpenCodeCommand(install.issuer, { platform: "linux", architecture: "arm64", runtime })).toBe(install.executable);
  expect(install.executable.endsWith(`${name}/bin/opencode`)).toBe(true);
});

it.each(["v1", "v2"] as const)("rejects missing or mismatched qualified %s dependencies", async runtime => {
  const [platform, architecture, name] = RUNTIME_PLATFORMS[runtime][0];
  const install = await installed(runtime, "vendored", platform, architecture, name);
  await writeFile(join(install.artifact, "package.json"), JSON.stringify({ name, version: "0.0.1", os: [platform], cpu: [architecture] }));
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform, architecture, runtime })).toThrow("identity mismatch");
  await rm(install.artifact, { recursive: true });
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform, architecture, runtime })).toThrow("qualified platform dependency is missing");
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform: "win32", architecture: "x64", runtime })).toThrow("not qualified");
});

it.each(["v1", "v2"] as const)("rejects %s executables outside the platform package or without execute permission", async runtime => {
  const [platform, architecture, name] = RUNTIME_PLATFORMS[runtime][0];
  const install = await installed(runtime, "source", platform, architecture, name);
  await chmod(install.executable, 0o644);
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform, architecture, runtime })).toThrow("Pinned OpenCode runtime unavailable");
  await rm(install.executable);
  const outside = join(install.root, "outside");
  await writeFile(outside, "#!/bin/sh\n", { mode: 0o755 });
  await symlink(outside, install.executable);
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform, architecture, runtime })).toThrow("escapes its qualified platform package");
});

it("selects v1 by default and v2 from PAPERCLIP_OPENCODE_RUNTIME", async () => {
  vi.resetModules();
  vi.stubEnv("PAPERCLIP_OPENCODE_RUNTIME", "");
  const v1 = await import("./opencode-server-driver.js");
  expect(v1.QUALIFIED_OPENCODE_VERSION).toBe("1.18.34");

  vi.resetModules();
  vi.stubEnv("PAPERCLIP_OPENCODE_RUNTIME", "v2");
  const v2 = await import("./opencode-server-driver.js");
  expect(v2.QUALIFIED_OPENCODE_VERSION).toBe("2.4.1");
});
