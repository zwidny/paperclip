import { afterEach, describe, expect, it } from "vitest";
import { changeLocale } from "../i18n";
import { timeAgo } from "./timeAgo";

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

afterEach(async () => {
  await changeLocale("en");
});

describe("timeAgo", () => {
  it("keeps the English abbreviations by default", () => {
    expect(timeAgo(secondsAgo(10))).toBe("just now");
    expect(timeAgo(secondsAgo(5 * 60))).toBe("5m ago");
    expect(timeAgo(secondsAgo(3 * 3600))).toBe("3h ago");
    expect(timeAgo(secondsAgo(2 * 86400))).toBe("2d ago");
    expect(timeAgo(secondsAgo(2 * 7 * 86400))).toBe("2w ago");
    expect(timeAgo(secondsAgo(90 * 86400))).toBe("3mo ago");
  });

  it("localizes to Chinese, including the week and month rungs", async () => {
    await changeLocale("zh-CN");
    expect(timeAgo(secondsAgo(10))).toBe("刚刚");
    expect(timeAgo(secondsAgo(5 * 60))).toBe("5 分钟前");
    expect(timeAgo(secondsAgo(3 * 3600))).toBe("3 小时前");
    expect(timeAgo(secondsAgo(2 * 86400))).toBe("2 天前");
    expect(timeAgo(secondsAgo(2 * 7 * 86400))).toBe("2 周前");
    expect(timeAgo(secondsAgo(90 * 86400))).toBe("3 个月前");
  });
});
