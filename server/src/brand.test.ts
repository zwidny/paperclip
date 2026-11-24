import { describe, expect, it } from "vitest";
import { brandName, brandText } from "./brand.js";

/** Run `fn` with a temporary environment patch, then restore every value. */
function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(patch)) {
    saved.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const NEUTRAL_ENV = { BRAND_NAME: undefined, NODE_ENV: undefined, VITEST: undefined };

describe("brandName", () => {
  it("defaults to Gnzs outside tests", () => {
    withEnv(NEUTRAL_ENV, () => expect(brandName()).toBe("Gnzs"));
  });

  it("uses BRAND_NAME when it is set", () => {
    withEnv({ ...NEUTRAL_ENV, BRAND_NAME: "Acme" }, () => expect(brandName()).toBe("Acme"));
  });

  it("trims BRAND_NAME and ignores a blank value", () => {
    withEnv({ ...NEUTRAL_ENV, BRAND_NAME: "  Acme  " }, () => expect(brandName()).toBe("Acme"));
    withEnv({ ...NEUTRAL_ENV, BRAND_NAME: "   " }, () => expect(brandName()).toBe("Gnzs"));
  });

  it("keeps the upstream name in test mode", () => {
    withEnv({ ...NEUTRAL_ENV, NODE_ENV: "test" }, () => expect(brandName()).toBe("Paperclip"));
    withEnv({ ...NEUTRAL_ENV, VITEST: "true" }, () => expect(brandName()).toBe("Paperclip"));
  });

  it("reads the environment on each call instead of caching it", () => {
    withEnv({ ...NEUTRAL_ENV }, () => {
      expect(brandName()).toBe("Gnzs");
      process.env.BRAND_NAME = "Acme";
      expect(brandName()).toBe("Acme");
    });
  });
});

describe("brandText", () => {
  it("replaces the whole-word product name", () => {
    withEnv({ ...NEUTRAL_ENV, BRAND_NAME: "Acme" }, () => {
      expect(brandText("Paperclip is ready.")).toBe("Acme is ready.");
      expect(brandText("Paperclip Cloud")).toBe("Acme Cloud");
      expect(brandText("Paperclip's job")).toBe("Acme's job");
    });
  });

  it("keeps the upstream name in test mode", () => {
    withEnv({ ...NEUTRAL_ENV, NODE_ENV: "test" }, () => {
      expect(brandText("Paperclip is ready.")).toBe("Paperclip is ready.");
    });
  });

  it("returns text without the product name unchanged", () => {
    withEnv({ ...NEUTRAL_ENV, BRAND_NAME: "Acme" }, () => {
      expect(brandText("Nothing to rename here.")).toBe("Nothing to rename here.");
    });
  });

  it("does not touch camelCase, lowercase hosts, paths or uppercase identifiers", () => {
    withEnv({ ...NEUTRAL_ENV, BRAND_NAME: "Acme" }, () => {
      const untouched = [
        "enablePaperclipNotebook",
        "@paperclipai/shared",
        "paperclip.ing",
        "/paperclip/instances/abc",
        "PAPERCLIP_HOME",
        "PAPERCLIP_RUN_ID",
        "paperclip_session",
        // A plain \b would rewrite the header prefix: the dash is a non-word
        // character, so `-Paperclip-` looks like a standalone word.
        "X-Paperclip-Tab-Visible",
        "X-Paperclip-Route",
        "X-Paperclip-Idempotency-Scope",
        "PaperclipRunner",
        "PaperclipLoading",
      ];
      for (const value of untouched) expect(brandText(value)).toBe(value);
    });
  });

  it("still renames a hyphenated compound that is display copy", () => {
    withEnv({ ...NEUTRAL_ENV, BRAND_NAME: "Acme" }, () => {
      expect(brandText("Paperclip-managed prompts")).toBe("Acme-managed prompts");
    });
  });
});
