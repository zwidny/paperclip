import { afterEach, describe, expect, it } from "vitest";
import { changeLocale } from "../i18n";
import { formatDate, relativeTime } from "./utils";

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

afterEach(async () => {
  await changeLocale("en");
});

describe("relativeTime", () => {
  it("keeps the English abbreviations by default", () => {
    expect(relativeTime(secondsAgo(30))).toBe("just now");
    expect(relativeTime(secondsAgo(5 * 60))).toBe("5m ago");
    expect(relativeTime(secondsAgo(3600))).toBe("1h ago");
    expect(relativeTime(secondsAgo(3 * 86400))).toBe("3d ago");
  });

  it("localizes to Chinese", async () => {
    await changeLocale("zh-CN");
    expect(relativeTime(secondsAgo(30))).toBe("刚刚");
    expect(relativeTime(secondsAgo(5 * 60))).toBe("5 分钟前");
    expect(relativeTime(secondsAgo(3600))).toBe("1 小时前");
    expect(relativeTime(secondsAgo(3 * 86400))).toBe("3 天前");
  });

  it("falls back to an absolute date past the relative window", async () => {
    const longAgo = secondsAgo(60 * 86400);
    await changeLocale("zh-CN");
    const zh = relativeTime(longAgo);
    expect(zh).toMatch(/年/);
    await changeLocale("en");
    expect(relativeTime(longAgo)).toMatch(/\d{4}/);
  });
});

describe("formatDate", () => {
  it("follows the active locale", async () => {
    const date = new Date("2026-11-24T12:00:00Z");
    await changeLocale("en");
    expect(formatDate(date)).toMatch(/Nov/);
    await changeLocale("zh-CN");
    expect(formatDate(date)).toMatch(/11月/);
  });
});
