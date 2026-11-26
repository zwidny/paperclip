import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { resolvePinnedOpenCodeCommand } from "./opencode-server-driver.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function installed(layout: "source" | "standalone" | "vendored", platform: string, architecture: string, name: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "paperclip-opencode-install-")));
  roots.push(root);
  const issuer = join(root, layout === "vendored" ? "dist/vendor/paperclip-runner/drivers/opencode/driver.js"
    : layout === "source" ? "src/drivers/opencode/driver.ts" : "dist/drivers/opencode/driver.js");
  const wrapper = join(root, "node_modules/@opencode/cli");
  const artifact = join(root, "node_modules", name);
  const executable = join(artifact, "bin/opencode");
  await mkdir(dirname(issuer), { recursive: true });
  await mkdir(join(wrapper, "bin"), { recursive: true });
  await mkdir(dirname(executable), { recursive: true });
  await writeFile(join(wrapper, "package.json"), JSON.stringify({ name: "@opencode/cli", version: "2.4.1", optionalDependencies: { [name]: "2.4.1" } }));
  const placeholder = 'echo "postinstall was not run" >&2\nexit 1\n';
  await writeFile(join(wrapper, "bin/opencode.exe"), placeholder, { mode: 0o755 });
  await writeFile(join(artifact, "package.json"), JSON.stringify({ name, version: "2.4.1", os: [platform], cpu: [architecture] }));
  await writeFile(executable, "#!/bin/sh\necho 2.4.1\n", { mode: 0o755 });
  return { issuer: pathToFileURL(issuer), wrapper, artifact, executable, root, placeholder };
}

it.each(["source", "standalone", "vendored"] as const)("resolves the platform binary in a %s install with postinstall skipped", async layout => {
  for (const [platform, architecture, name] of [
    ["darwin", "arm64", "@opencode/cli-darwin-arm64"],
    ["darwin", "x64", "@opencode/cli-darwin-x64-baseline"],
    ["linux", "x64", "@opencode/cli-linux-x64-baseline"],
  ] as const) {
    const install = await installed(layout, platform, architecture, name);
    expect(resolvePinnedOpenCodeCommand(install.issuer, { platform, architecture })).toBe(install.executable);
    expect(await readFile(join(install.wrapper, "bin/opencode.exe"), "utf8")).toBe(install.placeholder);
  }
});

it("rejects missing or mismatched qualified dependencies", async () => {
  const install = await installed("vendored", "darwin", "arm64", "@opencode/cli-darwin-arm64");
  await writeFile(join(install.artifact, "package.json"), JSON.stringify({ name: "@opencode/cli-darwin-arm64", version: "2.4.0", os: ["darwin"], cpu: ["arm64"] }));
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform: "darwin", architecture: "arm64" })).toThrow("identity mismatch");
  await rm(install.artifact, { recursive: true });
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform: "darwin", architecture: "arm64" })).toThrow("qualified platform dependency is missing");
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform: "win32", architecture: "x64" })).toThrow("not qualified");
});

it("rejects executables outside the platform package or without execute permission", async () => {
  const install = await installed("source", "darwin", "arm64", "@opencode/cli-darwin-arm64");
  await chmod(install.executable, 0o644);
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform: "darwin", architecture: "arm64" })).toThrow("Pinned OpenCode runtime unavailable");
  await rm(install.executable);
  const outside = join(install.root, "outside");
  await writeFile(outside, "#!/bin/sh\n", { mode: 0o755 });
  await symlink(outside, install.executable);
  expect(() => resolvePinnedOpenCodeCommand(install.issuer, { platform: "darwin", architecture: "arm64" })).toThrow("escapes its qualified platform package");
});
