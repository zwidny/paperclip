import {
  RESPONSIBILITY_AUTOMATION_LEVELS,
  responsibilityAutomationPercent,
  type AutomationCandidate,
  type AutomationStart,
  type ResponsibilityArea,
  type ResponsibilityAutomation,
  type ResponsibilityAutomationAreaTotals,
  type ResponsibilityAutomationItem,
  type ResponsibilityAutomationLevel,
  type ResponsibilityAutomationOverview,
  type ResponsibilityAutomationStalled,
  type ResponsibilityWithRollup,
} from "@paperclipai/shared";
import { describeReadingAge } from "./responsibilities";
import { outlineAreaGroups, type OutlineAreaGroup } from "./responsibility-views";
import { i18n } from "../i18n";

/**
 * Derivations for the Dashboard's Automation view and the automation line on
 * a responsibility page (experimental, `enableResponsibilities`). The rule
 * itself (levels, share, ranking, the trigger hint) is in `@paperclipai/shared`;
 * this joins the server's automation read with the overview the page already
 * has and puts it in words. Pure, so the view stays a plain renderer.
 */

/** "40% automated", or null with no share. */
export function automationShareLabel(share: number | null): string | null {
  const percent = responsibilityAutomationPercent(share);
  return percent === null
    ? null
    : i18n.t("responsibilities.automationWords.percentAutomated", { percent, defaultValue: "{{percent}}% automated" });
}

/** "2 automations · 5 manual tasks": the counts in words. */
export function automationSplitWords(automations: number, manualTasks: number): string {
  const separator = i18n.t("responsibilities.automationWords.splitSeparator", { defaultValue: " · " });
  const automationCount = i18n.t("responsibilities.agentWork.automations", {
    count: automations,
    defaultValue_one: "{{count}} automation",
    defaultValue_other: "{{count}} automations",
  });
  const manualCount = i18n.t("responsibilities.agentWork.manualTasks", {
    count: manualTasks,
    defaultValue_one: "{{count}} manual task",
    defaultValue_other: "{{count}} manual tasks",
  });
  return `${automationCount}${separator}${manualCount}`;
}

/**
 * The counts under the meter, or why there are none ("Nothing is filed under
 * this yet.").
 */
export function automationCountsLine(automation: Pick<ResponsibilityAutomation, "automationCount" | "manualTaskCount" | "nothingFiled">): string {
  if (automation.nothingFiled) {
    return i18n.t("responsibilities.words.nothingFiled", { defaultValue: "Nothing is filed under this yet." });
  }
  if (automation.automationCount + automation.manualTaskCount === 0) {
    return i18n.t("responsibilities.automationWords.noneFiled", { defaultValue: "No automations and no recent manual tasks." });
  }
  return automationSplitWords(automation.automationCount, automation.manualTaskCount);
}

/** Each responsibility's automation, by id. */
export function automationById(read: Pick<ResponsibilityAutomationOverview, "responsibilities">): Map<string, ResponsibilityAutomation> {
  return new Map(read.responsibilities.map((item) => [item.responsibilityId, item]));
}

export interface AutomationAreaGroup extends OutlineAreaGroup {
  /** "40% automated" for the area, counting each automation and task once. */
  automationShare: string | null;
}

/**
 * The Automation view's groups: the Board's areas, and inside each area the
 * most manual responsibilities first (lowest share, with no share counting
 * as none; then the most manual tasks; then the area's own order). A
 * responsibility the read does not cover yet (just added) counts as manual.
 * `levels`, when given, keeps only responsibilities at those levels and drops
 * areas left empty.
 */
export function automationAreaGroups(
  areas: readonly Pick<ResponsibilityArea, "id" | "title" | "status">[],
  responsibilities: readonly ResponsibilityWithRollup[],
  read: Pick<ResponsibilityAutomationOverview, "responsibilities" | "areas">,
  levels?: ReadonlySet<ResponsibilityAutomationLevel> | null,
): AutomationAreaGroup[] {
  const byId = automationById(read);
  const areaTotals = new Map<string | null, ResponsibilityAutomationAreaTotals>(read.areas.map((area) => [area.areaId, area]));
  const known = new Set(areas.map((area) => area.id));
  const order = (item: ResponsibilityWithRollup, index: number) => {
    const automation = byId.get(item.id);
    return { item, index, share: automation?.share ?? 0, manual: automation?.manualTaskCount ?? 0 };
  };
  return outlineAreaGroups(areas, responsibilities).flatMap((group) => {
    const items = group.items
      .map(order)
      .sort((a, b) => a.share - b.share || b.manual - a.manual || a.index - b.index)
      .map((entry) => entry.item)
      .filter((item) => !levels || levels.size === 0 || levels.has(byId.get(item.id)?.level ?? "manual"));
    if (items.length === 0) return [];
    // Responsibilities in an area the page does not list are grouped as "Not in an area", like the Board.
    const areaKey = group.area && known.has(group.area.id) ? group.area.id : null;
    const totals = areaTotals.get(areaKey) ?? null;
    return [{ ...group, items, automationShare: totals ? automationShareLabel(totals.share) : null }];
  });
}

/** How many responsibilities are at each level, among those listed. */
export function automationLevelCounts(
  responsibilities: readonly Pick<ResponsibilityWithRollup, "id">[],
  read: Pick<ResponsibilityAutomationOverview, "responsibilities">,
): Record<ResponsibilityAutomationLevel, number> {
  const byId = automationById(read);
  const counts = Object.fromEntries(RESPONSIBILITY_AUTOMATION_LEVELS.map((level) => [level, 0])) as Record<ResponsibilityAutomationLevel, number>;
  for (const item of responsibilities) counts[byId.get(item.id)?.level ?? "manual"] += 1;
  return counts;
}

/** Distinct manual tasks not marked "doesn't repeat": what could still be automated. */
export function remainingCandidateCount(
  read: Pick<ResponsibilityAutomationOverview, "responsibilities">,
  dismissed: ReadonlySet<string>,
): number {
  const ids = new Set<string>();
  for (const item of read.responsibilities) for (const id of item.manualTaskIds) if (!dismissed.has(id)) ids.add(id);
  return ids.size;
}

/**
 * The overall sentence: "9 of your 20 responsibilities have nothing automated
 * yet; 14 manual tasks could be automated." Reads sensibly at the ends.
 */
export function automationSentence(input: { total: number; manual: number; candidates: number }): string {
  const { total, manual, candidates } = input;
  if (total === 0) {
    return i18n.t("responsibilities.words.noResponsibilitiesYet", { defaultValue: "You do not own any responsibilities yet." });
  }
  const tail = candidates > 0
    ? i18n.t("responsibilities.agentWork.candidateTail", {
      count: candidates,
      defaultValue_one: "{{count}} manual task could be automated.",
      defaultValue_other: "{{count}} manual tasks could be automated.",
    })
    : null;
  if (manual === 0) {
    return tail
      ? i18n.t("responsibilities.automationWords.everyWithTail", {
        tail,
        defaultValue: "Every responsibility you own has something automated; {{tail}}",
      })
      : i18n.t("responsibilities.automationWords.everythingAutomated", { defaultValue: "Everything you own is automated." });
  }
  const lead = manual === total
    ? total === 1
      ? i18n.t("responsibilities.automationWords.yourResponsibilityNothing", { defaultValue: "Your responsibility has nothing automated yet" })
      : i18n.t("responsibilities.automationWords.noneOfTotal", {
        total,
        defaultValue: "None of your {{total}} responsibilities has anything automated yet",
      })
    : i18n.t("responsibilities.automationWords.partialLead", {
      manual,
      total,
      count: manual,
      defaultValue_one: "{{manual}} of your {{total}} responsibilities has nothing automated yet",
      defaultValue_other: "{{manual}} of your {{total}} responsibilities have nothing automated yet",
    });
  return tail
    ? i18n.t("responsibilities.automationWords.leadWithTail", { lead, tail, defaultValue: "{{lead}}; {{tail}}" })
    : i18n.t("responsibilities.automationWords.leadAsSentence", { lead, defaultValue: "{{lead}}." });
}

type AgentName = (id: string) => string | undefined;

function agentLabel(id: string | null | undefined, agentName: AgentName, fallback?: string): string {
  return (id ? agentName(id) : undefined)
    ?? fallback
    ?? i18n.t("responsibilities.words.anAgent", { defaultValue: "an agent" });
}

/** "3 minutes ago", "2 hours ago", else the day words ("yesterday", "4 days ago"). */
export function describeCheckAge(at: Date | string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(at).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) {
    return i18n.t("responsibilities.words.justNow", { defaultValue: "just now" });
  }
  if (minutes < 60) {
    return i18n.t("responsibilities.words.minutesAgo", {
      count: minutes,
      defaultValue_one: "{{count}} minute ago",
      defaultValue_other: "{{count}} minutes ago",
    });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return i18n.t("responsibilities.words.hoursAgo", {
      count: hours,
      defaultValue_one: "{{count}} hour ago",
      defaultValue_other: "{{count}} hours ago",
    });
  }
  return describeReadingAge(at, now);
}

/** How an automation starts, in words: the kind and its detail. */
export interface AutomationStartWords {
  kind: AutomationStart["kind"];
  /** "On a schedule", "From a webhook", "Standing check", "On request". */
  label: string;
  /** "Every Monday at 9 AM", "on each wake-up", "when someone runs it". */
  detail: string | null;
  /** A second quiet line: the last check, the last call, the next run. Null when there is nothing to say. */
  status: string | null;
}

/** "On a schedule · Every Monday at 9 AM", "Standing check · on each wake-up", with the last thing that happened. */
export function automationStartWords(item: Pick<ResponsibilityAutomationItem, "start">, now: Date): AutomationStartWords {
  const { start } = item;
  switch (start.kind) {
    case "schedule":
      return {
        kind: start.kind,
        label: i18n.t("responsibilities.automationWords.triggerSchedule", { defaultValue: "On a schedule" }),
        detail: start.cadenceLabel,
        status: null,
      };
    case "webhook":
      return {
        kind: start.kind,
        label: i18n.t("responsibilities.automationWords.triggerWebhook", { defaultValue: "From a webhook" }),
        detail: i18n.t("responsibilities.automationWords.whenSystemCalls", { defaultValue: "when another system calls it" }),
        status: start.lastDeliveryAt
          ? i18n.t("responsibilities.automationWords.lastCalled", {
            age: describeCheckAge(start.lastDeliveryAt, now),
            defaultValue: "Last called {{age}}",
          })
          : i18n.t("responsibilities.automationWords.notCalledYet", { defaultValue: "Not called yet" }),
      };
    case "standing_check": {
      const last = start.lastResult;
      return {
        kind: start.kind,
        label: i18n.t("responsibilities.automationWords.triggerStandingCheck", { defaultValue: "Standing check" }),
        detail: i18n.t("responsibilities.automationWords.onEachWakeUp", { defaultValue: "on each wake-up" }),
        status: last
          ? i18n.t("responsibilities.automationWords.lastChecked", {
            age: describeCheckAge(last.checkedAt, now),
            outcome: last.outcome === "acted"
              ? last.note
                ? i18n.t("responsibilities.automationWords.actedWithNote", { note: last.note, defaultValue: "acted ({{note}})" })
                : i18n.t("responsibilities.automationWords.acted", { defaultValue: "acted" })
              : i18n.t("responsibilities.automationWords.nothingNeeded", { defaultValue: "nothing needed" }),
            defaultValue: "Last checked {{age}}: {{outcome}}",
          })
          : i18n.t("responsibilities.automationWords.notCheckedYet", { defaultValue: "Not checked yet" }),
      };
    }
    case "on_request":
      return {
        kind: start.kind,
        label: i18n.t("responsibilities.automationWords.triggerOnRequest", { defaultValue: "On request" }),
        detail: i18n.t("responsibilities.automationWords.whenSomeoneRunsIt", { defaultValue: "when someone runs it" }),
        status: null,
      };
  }
}

/** Why an automation filed here is not running, in a few words. */
export function stalledWords(stalled: Pick<ResponsibilityAutomationStalled, "reason" | "assigneeAgentId">, agentName: AgentName): string {
  switch (stalled.reason) {
    case "paused":
      return i18n.t("responsibilities.words.paused", { defaultValue: "Paused" });
    case "no_agent":
      return i18n.t("responsibilities.automationWords.noAgentToRunIt", { defaultValue: "No agent to run it" });
    case "no_wakeups":
      return i18n.t("responsibilities.automationWords.noWakeups", {
        agent: agentLabel(
          stalled.assigneeAgentId,
          agentName,
          i18n.t("responsibilities.automationWords.itsAgent", { defaultValue: "its agent" }),
        ),
        defaultValue: "Not running: {{agent}} doesn’t wake up on its own (heartbeat off)",
      });
  }
}

/**
 * Why a task is listed when the hint has nothing to say, in a few words, or
 * null: "Analyst offered: Every Monday at 9 AM", "Done by Analyst 3 days ago",
 * "Done by hand yesterday", "With Analyst now".
 */
export function candidateReasonWords(candidate: AutomationCandidate, agentName: AgentName, now: Date): string | null {
  switch (candidate.reason) {
    case "pending_offer": {
      const offer = candidate.pendingOffer;
      if (!offer) {
        return i18n.t("responsibilities.automationWords.anAgentOffered", { defaultValue: "An agent offered to repeat it" });
      }
      return i18n.t("responsibilities.automationWords.agentOffered", {
        agent: agentName(offer.agentId ?? "")
          ?? i18n.t("responsibilities.automationWords.yourAgent", { defaultValue: "Your agent" }),
        cadence: offer.cadenceLabel,
        defaultValue: "{{agent}} offered: {{cadence}}",
      });
    }
    case "hint":
      return candidate.hint?.why ?? null;
    case "done_by_agent":
      return i18n.t("responsibilities.automationWords.doneByAgent", {
        agent: agentLabel(candidate.assigneeAgentId, agentName),
        age: describeReadingAge(candidate.completedAt ?? candidate.updatedAt, now),
        defaultValue: "Done by {{agent}} {{age}}",
      });
    case "done":
      return i18n.t("responsibilities.automationWords.doneByHand", {
        age: describeReadingAge(candidate.completedAt ?? candidate.updatedAt, now),
        defaultValue: "Done by hand {{age}}",
      });
    case "with_agent":
      return i18n.t("responsibilities.automationWords.withAgentNow", {
        agent: agentLabel(candidate.assigneeAgentId, agentName),
        defaultValue: "With {{agent}} now",
      });
    case "open":
      return null;
  }
}

/** The primary action's label: start, continue, or review the agent's proposal. */
export function conversationButtonLabel(candidate: Pick<AutomationCandidate, "conversation" | "responsibleAgentId">, agentName: AgentName): string {
  const who = agentLabel(
    candidate.responsibleAgentId,
    agentName,
    i18n.t("responsibilities.automationWords.yourAgentLower", { defaultValue: "your agent" }),
  );
  if (candidate.conversation?.state === "proposal_waiting") {
    return i18n.t("responsibilities.automationWords.reviewProposal", { agent: who, defaultValue: "Review {{agent}}’s proposal" });
  }
  if (candidate.conversation?.state === "discussing") {
    return i18n.t("responsibilities.automationWords.continueWith", { agent: who, defaultValue: "Continue with {{agent}}" });
  }
  return i18n.t("responsibilities.automationWords.automateWith", { agent: who, defaultValue: "Automate with {{agent}}" });
}

/**
 * When nothing is left to suggest, something true and short to say instead,
 * or null to say nothing (nothing filed is said above).
 */
export function noCandidatesWords(automation: Pick<ResponsibilityAutomation, "automationCount" | "manualTaskCount" | "nothingFiled">): string | null {
  if (automation.nothingFiled) return null;
  if (automation.manualTaskCount > 0) {
    return i18n.t("responsibilities.automationWords.nothingElseWorth", { defaultValue: "Nothing else here looks worth automating." });
  }
  if (automation.automationCount > 0) {
    return i18n.t("responsibilities.automationWords.coveringWork", { defaultValue: "The automations are covering the work." });
  }
  return i18n.t("responsibilities.automationWords.noRecentManual", { defaultValue: "No recent manual tasks to automate." });
}

// ---------------------------------------------------------------------------
// "Doesn't repeat", remembered in this browser
// ---------------------------------------------------------------------------

/**
 * Prototype only: which suggested tasks the person said do not repeat is kept
 * in this browser's local storage, per company, so the list stops suggesting
 * them here. It is not shared across browsers or people, and the page works
 * the same (suggesting them again) when storage is blocked.
 */
export function automationDismissedStorageKey(companyId: string): string {
  return `paperclip:responsibilities:automation-dismissed:${companyId}`;
}

export function readDismissedCandidates(companyId: string): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(automationDismissedStorageKey(companyId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeDismissedCandidates(companyId: string, ids: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(automationDismissedStorageKey(companyId), JSON.stringify([...ids]));
  } catch {
    // Blocked storage: the choice lasts for this visit only.
  }
}

/** A candidate worth showing up front: the hint has a suggestion, an agent offered, or a conversation is open. */
function isRelevant(candidate: AutomationCandidate): boolean {
  return candidate.hint !== null || candidate.pendingOffer !== null || candidate.conversation !== null;
}

/**
 * The manual tasks a row shows: up to `limit` relevant ones up front (or, with
 * none relevant, the first one, offered to work out with the agent); the rest
 * of those the read listed behind "and N more"; and how many more the read
 * only counted (reachable on the responsibility's page). Dismissed tasks are
 * left out everywhere.
 */
export function visibleCandidates(
  automation: Pick<ResponsibilityAutomation, "candidates" | "candidateTotal" | "manualTaskIds">,
  dismissed: ReadonlySet<string>,
  limit = 3,
): { shown: AutomationCandidate[]; others: AutomationCandidate[]; unlisted: number; more: number } {
  const open = automation.candidates.filter((candidate) => !dismissed.has(candidate.issueId));
  const relevant = open.filter(isRelevant);
  const shown = (relevant.length > 0 ? relevant : open).slice(0, relevant.length > 0 ? limit : 1);
  const shownIds = new Set(shown.map((candidate) => candidate.issueId));
  const others = open.filter((candidate) => !shownIds.has(candidate.issueId));
  const dismissedHere = automation.manualTaskIds.filter((id) => dismissed.has(id)).length;
  const remaining = Math.max(0, automation.candidateTotal - dismissedHere - shown.length);
  return { shown, others, unlisted: Math.max(0, remaining - others.length), more: remaining };
}
