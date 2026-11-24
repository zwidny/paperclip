import { afterEach, describe, expect, it } from "vitest";
import { changeLocale } from "../i18n";
import {
  externalObjectCategoryLabel,
  externalObjectLivenessLabel,
  externalObjectProviderLabel,
  externalObjectTypeLabel,
} from "./external-objects";

afterEach(async () => {
  await changeLocale("en");
});

describe("external object labels", () => {
  it("keeps English by default", () => {
    expect(externalObjectCategoryLabel("open")).toBe("Open");
    expect(externalObjectCategoryLabel("auth_required")).toBe("Authorization required");
    expect(externalObjectLivenessLabel("fresh")).toBe("Fresh");
    expect(externalObjectTypeLabel("pull_request")).toBe("pull request");
    expect(externalObjectProviderLabel("github")).toBe("GitHub");
    expect(externalObjectProviderLabel(null)).toBe("External");
    expect(externalObjectTypeLabel(null)).toBe("object");
  });

  it("localizes to Chinese and keeps unknown values humanized", async () => {
    await changeLocale("zh-CN");
    expect(externalObjectCategoryLabel("open")).toBe("打开");
    expect(externalObjectCategoryLabel("rate_limited")).toBe("触发限流");
    expect(externalObjectLivenessLabel("stale")).toBe("已过期");
    expect(externalObjectTypeLabel("workflow_run")).toBe("工作流运行");
    // Product names stay as-is.
    expect(externalObjectProviderLabel("github")).toBe("GitHub");
    expect(externalObjectProviderLabel(null)).toBe("外部");
    expect(externalObjectTypeLabel(null)).toBe("对象");
    // Unknown codes still fall back to the humanized raw value.
    expect(externalObjectCategoryLabel("brand_new_state")).toBe("brand new state");
  });
});
