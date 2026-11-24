import { afterEach, describe, expect, it } from "vitest";
import { changeLocale, t } from ".";
import { brandFor, replaceBrandIn, resolveBrand } from "./brand";

afterEach(async () => {
  // Never leave another test suite rendering in zh-CN.
  await changeLocale("en");
});

describe("brand name", () => {
  it("uses Gnzs by default in a shipped build, for every locale", () => {
    expect(resolveBrand({ locale: "en" })).toBe("Gnzs");
    expect(resolveBrand({ locale: "de" })).toBe("Gnzs");
    expect(resolveBrand({ locale: "zh-CN" })).toBe("Gnzs");
    expect(resolveBrand({ locale: "zh-TW" })).toBe("Gnzs");
  });

  it("keeps the upstream name under test so master's copy assertions stay valid", () => {
    expect(resolveBrand({ locale: "en", testMode: true })).toBe("Paperclip");
    expect(resolveBrand({ locale: "zh-CN", testMode: true })).toBe("Paperclip");
    expect(brandFor("en")).toBe("Paperclip");
  });

  it("lets a build override the name per locale", () => {
    expect(resolveBrand({ locale: "en", env: { VITE_BRAND_NAME: "Acme" } })).toBe("Acme");
    expect(resolveBrand({ locale: "zh-CN", env: { VITE_BRAND_NAME: "Acme", VITE_BRAND_NAME_ZH: "阿克米" } })).toBe("阿克米");
    expect(resolveBrand({ locale: "de", env: { VITE_BRAND_NAME: "Acme", VITE_BRAND_NAME_ZH: "阿克米" } })).toBe("Acme");
    // An explicit override wins over the test-mode default as well.
    expect(resolveBrand({ locale: "en", env: { VITE_BRAND_NAME: "Acme" }, testMode: true })).toBe("Acme");
  });

  it("renames display copy but never header or protocol names", () => {
    expect(replaceBrandIn("Paperclip Cloud", "Gnzs")).toBe("Gnzs Cloud");
    expect(replaceBrandIn("Paperclip's runner", "Gnzs")).toBe("Gnzs's runner");
    expect(replaceBrandIn("Paperclip-managed", "Gnzs")).toBe("Gnzs-managed");
    for (const untouched of [
      "X-Paperclip-Tab-Visible",
      "X-Paperclip-Route",
      "PaperclipRunner",
      "PaperclipLoading",
      "enablePaperclipNotebook",
      "paperclip.ing",
      "PAPERCLIP_HOME",
    ]) {
      expect(replaceBrandIn(untouched, "Gnzs")).toBe(untouched);
    }
  });

  it("substitutes {{brand}} in translated strings and never leaks the placeholder", async () => {
    const sample = "app.cloudCreateUnavailable";

    await changeLocale("en");
    expect(t(sample)).toContain(brandFor("en"));
    expect(t(sample)).not.toContain("{{brand}}");

    try {
      await changeLocale("zh-CN");
      expect(t(sample)).toContain(brandFor("zh-CN"));
      expect(t(sample)).not.toContain("{{brand}}");
    } finally {
      await changeLocale("en");
    }
  });
});
