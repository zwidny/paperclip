import { describe, expect, it } from "vitest";
import { changeLocale, t } from ".";
import { brandFor } from "./brand";

describe("brand name", () => {
  it("defaults to Paperclip for English and Gnzs for Simplified Chinese", () => {
    expect(brandFor("en")).toBe("Paperclip");
    expect(brandFor("de")).toBe("Paperclip");
    expect(brandFor("zh-CN")).toBe("Gnzs");
    expect(brandFor("zh-TW")).toBe("Paperclip");
  });

  it("substitutes {{brand}} in translated strings and follows the locale", async () => {
    // A locale file must never render the raw placeholder.
    const sample = "app.cloudCreateUnavailable";

    await changeLocale("en");
    expect(t(sample)).toContain("Paperclip");
    expect(t(sample)).not.toContain("{{brand}}");

    await changeLocale("zh-CN");
    expect(t(sample)).toContain("Gnzs");
    expect(t(sample)).not.toContain("{{brand}}");

    await changeLocale("en");
  });
});
