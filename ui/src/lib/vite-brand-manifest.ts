import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Rewrite the product name inside the copied PWA manifest.
 *
 * `public/site.webmanifest` is copied verbatim into the build, so its `name` and
 * `short_name` (what the install prompt and the desktop icon label show) would
 * otherwise stay at the upstream name in a white-label build. The served
 * document title is handled at runtime by the server (`applyUiBranding`); this is
 * the build-time counterpart for the manifest, which never passes through HTML.
 *
 * Only the build runs this: a dev server serves `public/` unchanged, and a dev
 * session has no PWA install flow worth branding.
 */
const BRANDED_KEYS = ["name", "short_name"] as const;

export function brandManifestFields(
  manifest: Record<string, unknown>,
  brand: string,
): Record<string, unknown> {
  const next = { ...manifest };
  for (const key of BRANDED_KEYS) {
    const value = next[key];
    if (typeof value !== "string" || !value.includes("Paperclip")) continue;
    next[key] = value.replace(/(?<![-\w])Paperclip(?!\w)/g, brand);
  }
  return next;
}

export function brandManifestPlugin(brand: string): Plugin {
  return {
    name: "paperclip:brand-manifest",
    apply: "build",
    writeBundle(options) {
      const file = path.join(options.dir ?? "dist", "site.webmanifest");
      if (!fs.existsSync(file)) return;
      const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const branded = brandManifestFields(manifest, brand);
      fs.writeFileSync(file, `${JSON.stringify(branded, null, 2)}\n`);
    },
  };
}
