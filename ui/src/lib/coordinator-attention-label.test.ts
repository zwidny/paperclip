import { afterEach, describe, expect, it } from "vitest";
import { changeLocale } from "../i18n";
import { decisionHistoryHeadline, decisionHistoryOutcomeLabel } from "./coordinator-attention";

const base = {
  outcome: "answered",
  resultOutcome: null,
  label: "Answers recorded",
} as const;

afterEach(async () => {
  await changeLocale("en");
});

describe("decision history outcome label", () => {
  it("keeps the server's English label by default", () => {
    expect(decisionHistoryOutcomeLabel({ ...base, sourceKind: "issue_thread_interaction" }))
      .toBe("Answers recorded");
  });

  it("localizes interactions and approvals", async () => {
    await changeLocale("zh-CN");
    expect(decisionHistoryOutcomeLabel({ ...base, sourceKind: "issue_thread_interaction" }))
      .toBe("已回答");
    expect(decisionHistoryOutcomeLabel({
      sourceKind: "approval",
      outcome: "rejected",
      resultOutcome: null,
      label: "Rejected",
    })).toBe("已拒绝");
    // The same outcome code differs by source kind: an interaction "rejected" is
    // "Changes requested", an approval "rejected" is "Rejected".
    expect(decisionHistoryOutcomeLabel({ ...base, sourceKind: "issue_thread_interaction", outcome: "rejected", label: "Changes requested" }))
      .toBe("已请求修改");
  });

  it("prefers resultOutcome over the stored status", async () => {
    await changeLocale("zh-CN");
    expect(decisionHistoryOutcomeLabel({
      sourceKind: "issue_thread_interaction",
      outcome: "cancelled",
      resultOutcome: "withdrawn",
      label: "Withdrawn",
    })).toBe("已撤回");
    expect(decisionHistoryOutcomeLabel({
      sourceKind: "issue_thread_interaction",
      outcome: "cancelled",
      resultOutcome: "issue_closed",
      label: "Closed with task",
    })).toBe("任务关闭时结束");
  });

  it("falls back to the server label for an unknown outcome", async () => {
    await changeLocale("zh-CN");
    expect(decisionHistoryOutcomeLabel({
      sourceKind: "issue_thread_interaction",
      outcome: "brand_new_outcome",
      resultOutcome: null,
      label: "Decision recorded",
    })).toBe("Decision recorded");
  });
});

describe("decision history headline", () => {
  it("localizes the withdrawal line", async () => {
    await changeLocale("zh-CN");
    const headline = decisionHistoryHeadline({
      ...base,
      sourceKind: "issue_thread_interaction",
      outcome: "cancelled",
      resultOutcome: "withdrawn",
      resolvedByUserId: "u1",
      action: null,
    } as never, new Map([["u1", "Ana"]]) as never);
    expect(headline).toBe("由 @Ana 撤回");
  });

  it("uses the localized placeholder when the actor is unknown", async () => {
    await changeLocale("zh-CN");
    const headline = decisionHistoryHeadline({
      ...base,
      sourceKind: "issue_thread_interaction",
      resolvedByUserId: "missing",
      action: null,
    } as never, new Map() as never);
    expect(headline).toBe("已回答");
  });
});
