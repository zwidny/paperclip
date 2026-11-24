import { afterEach, describe, expect, it } from "vitest";
import { changeLocale } from "../i18n";
import { attentionVerbLabel } from "./attention-verb-label";

afterEach(async () => {
  await changeLocale("en");
});

describe("attention verb label", () => {
  it("translates a verb whose label matches the catalog", async () => {
    expect(attentionVerbLabel("unblock", "Unblock")).toBe("Unblock");
    await changeLocale("zh-CN");
    expect(attentionVerbLabel("unblock", "Unblock")).toBe("解除阻塞");
    expect(attentionVerbLabel("reject", "Reject")).toBe("拒绝");
    expect(attentionVerbLabel("approve", "Approve")).toBe("批准");
    expect(attentionVerbLabel("inspect", "Inspect")).toBe("查看");
  });

  it("keeps a caller's more specific label", async () => {
    await changeLocale("zh-CN");
    // The attention-row tests pass id "accept" with a specific label; a generic
    // translation must not overwrite it.
    expect(attentionVerbLabel("accept", "Approve plan")).toBe("Approve plan");
  });

  it("falls back to the given text for an unknown verb", async () => {
    await changeLocale("zh-CN");
    expect(attentionVerbLabel("brand_new_verb", "Do the thing")).toBe("Do the thing");
  });
});
