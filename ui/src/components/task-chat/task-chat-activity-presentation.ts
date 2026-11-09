import type { TFunction } from "i18next";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CircleCheck,
  CircleDashed,
  CircleX,
  Box,
  Clock3,
  Database,
  FileCheck2,
  FilePenLine,
  FileText,
  Globe,
  Info,
  ListChecks,
  PackageCheck,
  Search,
  TerminalSquare,
  Users,
} from "lucide-react";
import type {
  TaskChatMaterializedResourceItem,
  TaskChatProtocolItem,
  TaskChatProviderActivityItem,
  TaskChatWorkspaceChangeItem,
  TaskChatWorkspaceFileItem,
} from "./task-chat-model";
import {
  humanizeToolName,
  isGenericToolName,
  mcpToolIdentity,
  toolActivityPresentation,
  type ToolIcon,
} from "./tool-taxonomy";
import { governancePresentation, type GovernanceTone } from "./governance-presentation";

export interface TaskChatActivityPresentation {
  icon: ToolIcon;
  runningLabel: string;
  completedLabel: string;
  failedLabel?: string;
  interruptedLabel?: string;
  detail?: string;
  /** Governance rows tint a stopped action and carry its reason as a note. */
  tone?: GovernanceTone;
  note?: string;
}

/** Canonical English label → stable locale key suffix. */
function activitySlug(english: string): string {
  return english
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Localize a canonical English activity label; English stays the default. */
function activityLabel(t: TFunction | undefined, english: string): string {
  return t
    ? t(`taskChat.activity.${activitySlug(english)}`, { defaultValue: english })
    : english;
}

export function providerNoticeSeverity(item: TaskChatProviderActivityItem): "info" | "warning" | "error" {
  const severity = item.details.find((entry) => entry.label === "Severity")?.value;
  if (item.status === "failed" || severity === "error") return "error";
  return severity === "info" ? "info" : "warning";
}

function providerDetail(item: TaskChatProviderActivityItem, ...labels: string[]): string | undefined {
  return item.details.find((entry) => labels.includes(entry.label))?.value;
}

function meaningfulToolDetail(value: string | undefined): string | undefined {
  if (!value || isGenericToolName(value) || /^tool(?:\s+|_)call\b/i.test(value)) return undefined;
  return value;
}

/** Host and path without scheme or query, for one-line web activity. */
export function compactUrl(href: string): string {
  try {
    const url = new URL(href);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return href;
  }
}

/** Whole-second duration such as "30s" or "2m 5s" from a millisecond detail. */
export function durationLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function modelRouteDetail(item: TaskChatProviderActivityItem): string | undefined {
  const from = providerDetail(item, "From Model") ?? providerDetail(item, "Requested Model");
  const to = providerDetail(item, "Effective Model");
  if (!to || to === "unknown") return undefined;
  const reason = providerDetail(item, "Reason");
  const route = from && from !== "unknown" && from !== to ? `${from} → ${to}` : to;
  return reason && reason !== "provider reroute" ? `${route} · ${reason}` : route;
}

export function providerActivityPresentation(item: TaskChatProviderActivityItem, t?: TFunction): TaskChatActivityPresentation {
  const detail = item.summary
    ?? providerDetail(item, "Query", "URL", "Target", "Name", "Reference", "Reason", "Summary");
  switch (item.family) {
    case "research": {
      const action = providerDetail(item, "Action")?.toLowerCase();
      const query = providerDetail(item, "Query");
      const url = providerDetail(item, "Url");
      if (action === "open_page") {
        return { icon: Globe, runningLabel: activityLabel(t, "Opening a web page"), completedLabel: activityLabel(t, "Opened a web page"), failedLabel: activityLabel(t, "Couldn’t open the web page"), interruptedLabel: activityLabel(t, "Stopped opening the web page"), detail: url ? compactUrl(url) : detail };
      }
      if (action === "find_in_page") {
        const pattern = providerDetail(item, "Pattern");
        return { icon: Search, runningLabel: activityLabel(t, "Searching the page"), completedLabel: activityLabel(t, "Searched the page"), failedLabel: activityLabel(t, "Page search failed"), interruptedLabel: activityLabel(t, "Page search stopped"), detail: [pattern ? `“${pattern}”` : undefined, url ? compactUrl(url) : undefined].filter(Boolean).join(" in ") || detail };
      }
      return { icon: Search, runningLabel: activityLabel(t, "Searching the web"), completedLabel: activityLabel(t, "Searched the web"), failedLabel: activityLabel(t, "Web search failed"), interruptedLabel: activityLabel(t, "Web search stopped"), detail: query ? `“${query}”` : detail };
    }
    case "tool_execution": {
      const name = providerDetail(item, "Name");
      const target = providerDetail(item, "Target");
      const progress = providerDetail(item, "Progress");
      const tool = toolActivityPresentation(
        {
          name,
          transport: providerDetail(item, "Transport"),
          namespace: providerDetail(item, "Namespace"),
          operation: providerDetail(item, "Operation"),
          target,
          progress,
        },
      );
      const englishRunningLabel = toolActivityPresentation({ name }).runningLabel;
      const boundedActivity = meaningfulToolDetail(item.summary)
        ?? meaningfulToolDetail(progress)
        ?? meaningfulToolDetail(target);
      const activityIsIdentity = Boolean(
        boundedActivity && name && humanizeToolName(boundedActivity) === humanizeToolName(name),
      );
      const technicalName = name ? mcpToolIdentity(name)?.name ?? name : tool.displayName;
      const source = tool.sourceLabel
        ? `${tool.sourceLabel} · ${technicalName}`
        : name && !isGenericToolName(name) && humanizeToolName(name) !== englishRunningLabel.replace(/^Running /, "")
          ? name
          : undefined;
      return {
        icon: tool.icon,
        runningLabel: tool.runningLabel,
        completedLabel: tool.completedLabel,
        failedLabel: tool.failedLabel,
        interruptedLabel: tool.interruptedLabel,
        detail: [activityIsIdentity ? undefined : boundedActivity, source].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "plan_proposal":
      return { icon: FileText, runningLabel: "Writing a plan", completedLabel: "Proposed a plan", failedLabel: "Plan proposal failed", interruptedLabel: "Plan proposal stopped", detail };
    case "plan":
      return { icon: ListChecks, runningLabel: activityLabel(t, "Updating the plan"), completedLabel: activityLabel(t, "Updated the plan"), failedLabel: activityLabel(t, "Plan update failed"), interruptedLabel: activityLabel(t, "Plan update stopped"), detail };
    case "delegation": {
      const action = providerDetail(item, "Action")?.toLowerCase();
      if (action === "message") return { icon: Users, runningLabel: activityLabel(t, "Messaging a subagent"), completedLabel: activityLabel(t, "Messaged a subagent"), failedLabel: activityLabel(t, "Subagent message failed"), interruptedLabel: activityLabel(t, "Subagent message stopped"), detail };
      if (action === "resume") return { icon: Users, runningLabel: activityLabel(t, "Resuming a subagent"), completedLabel: activityLabel(t, "Resumed a subagent"), failedLabel: activityLabel(t, "Couldn’t resume the subagent"), interruptedLabel: activityLabel(t, "Subagent resume stopped"), detail };
      if (action === "close") return { icon: Users, runningLabel: activityLabel(t, "Closing a subagent"), completedLabel: activityLabel(t, "Closed a subagent"), failedLabel: activityLabel(t, "Couldn’t close the subagent"), interruptedLabel: activityLabel(t, "Subagent close stopped"), detail };
      if (action === "wait") return { icon: Users, runningLabel: activityLabel(t, "Waiting for subagents"), completedLabel: activityLabel(t, "Finished waiting for subagents"), failedLabel: activityLabel(t, "Subagent wait failed"), interruptedLabel: activityLabel(t, "Stopped waiting for subagents"), detail };
      return { icon: Users, runningLabel: activityLabel(t, "Starting a subagent"), completedLabel: activityLabel(t, "Started a subagent"), failedLabel: activityLabel(t, "Subagent start failed"), interruptedLabel: activityLabel(t, "Subagent start stopped"), detail };
    }
    case "model_identity":
      return item.eventType === "model.route.changed"
        ? { icon: Bot, runningLabel: activityLabel(t, "Switching models"), completedLabel: activityLabel(t, "Switched models"), failedLabel: activityLabel(t, "Model switch failed"), interruptedLabel: activityLabel(t, "Model switch stopped"), detail: modelRouteDetail(item) ?? detail }
        : { icon: Bot, runningLabel: activityLabel(t, "Verifying the model"), completedLabel: activityLabel(t, "Verified the model"), failedLabel: activityLabel(t, "Model verification failed"), interruptedLabel: activityLabel(t, "Model verification stopped"), detail };
    case "context":
      return { icon: Database, runningLabel: activityLabel(t, "Compacting context"), completedLabel: activityLabel(t, "Compacted context"), failedLabel: activityLabel(t, "Context compaction failed"), interruptedLabel: activityLabel(t, "Context compaction stopped"), detail };
    case "artifact": {
      const viewed = item.eventType === "artifact.viewed";
      return viewed
        ? { icon: Box, runningLabel: activityLabel(t, "Viewing an artifact"), completedLabel: activityLabel(t, "Viewed an artifact"), failedLabel: activityLabel(t, "Couldn’t view the artifact"), interruptedLabel: activityLabel(t, "Artifact view stopped"), detail }
        : { icon: Box, runningLabel: activityLabel(t, "Generating an artifact"), completedLabel: activityLabel(t, "Generated an artifact"), failedLabel: activityLabel(t, "Artifact generation failed"), interruptedLabel: activityLabel(t, "Artifact generation stopped"), detail };
    }
    case "review": {
      const state = providerDetail(item, "State")?.toLowerCase();
      return state === "exited"
        ? { icon: FileCheck2, runningLabel: activityLabel(t, "Leaving review mode"), completedLabel: activityLabel(t, "Left review mode"), failedLabel: activityLabel(t, "Couldn’t leave review mode"), interruptedLabel: activityLabel(t, "Review-mode change stopped"), detail }
        : { icon: FileCheck2, runningLabel: activityLabel(t, "Entering review mode"), completedLabel: activityLabel(t, "Entered review mode"), failedLabel: activityLabel(t, "Couldn’t enter review mode"), interruptedLabel: activityLabel(t, "Review-mode change stopped"), detail };
    }
    case "hook":
    case "safety": {
      const governance = governancePresentation(item)!;
      return {
        icon: governance.icon,
        runningLabel: governance.label,
        completedLabel: governance.label,
        failedLabel: governance.label,
        interruptedLabel: governance.label,
        detail: governance.detail,
        tone: governance.tone,
        note: governance.note,
      };
    }
    case "memory":
      return { icon: BookOpen, runningLabel: activityLabel(t, "Checking memory"), completedLabel: activityLabel(t, "Referenced memory"), failedLabel: activityLabel(t, "Memory lookup failed"), interruptedLabel: activityLabel(t, "Memory lookup stopped"), detail };
    case "terminal":
      return { icon: TerminalSquare, runningLabel: activityLabel(t, "Sending terminal input"), completedLabel: activityLabel(t, "Sent terminal input"), failedLabel: activityLabel(t, "Terminal input failed"), interruptedLabel: activityLabel(t, "Terminal input stopped"), detail };
    case "wait": {
      const planned = durationLabel(providerDetail(item, "Planned Duration Ms"));
      const elapsed = durationLabel(providerDetail(item, "Elapsed Duration Ms"));
      return {
        icon: Clock3,
        runningLabel: planned ? `${activityLabel(t, "Waiting")} ${planned}` : activityLabel(t, "Waiting"),
        completedLabel: elapsed ?? planned ? `${activityLabel(t, "Waited")} ${elapsed ?? planned}` : activityLabel(t, "Finished waiting"),
        failedLabel: activityLabel(t, "Wait failed"),
        interruptedLabel: elapsed ? `${activityLabel(t, "Stopped waiting after")} ${elapsed}` : activityLabel(t, "Wait stopped"),
      };
    }
    case "verification": {
      const status = providerDetail(item, "Status");
      return {
        icon: status === "passed" ? CircleCheck : status === "failed" ? CircleX : CircleDashed,
        runningLabel: activityLabel(t, "Running a check"),
        completedLabel: status === "not_run" ? activityLabel(t, "Check not run") : activityLabel(t, "Check passed"),
        failedLabel: activityLabel(t, "Check failed"),
        interruptedLabel: activityLabel(t, "Check not run"),
        detail: item.summary,
      };
    }
    case "provider_notice":
      return { icon: providerNoticeSeverity(item) === "info" ? Info : AlertTriangle, runningLabel: activityLabel(t, "Provider notice"), completedLabel: activityLabel(t, "Provider notice"), failedLabel: activityLabel(t, "Provider error"), interruptedLabel: activityLabel(t, "Provider notice"), detail };
  }
}

function workspaceChangePresentation(item: TaskChatWorkspaceChangeItem, t?: TFunction): TaskChatActivityPresentation {
  const count = item.totals.files || item.files.length;
  const detail = count > 0
    ? t
      ? t("taskChat.activity.fileCount", { count, defaultValue: count === 1 ? "{{count}} file" : "{{count}} files" })
      : `${count} ${count === 1 ? "file" : "files"}`
    : undefined;
  return { icon: FilePenLine, runningLabel: activityLabel(t, "Editing files"), completedLabel: activityLabel(t, "Edited files"), detail };
}

function workspaceFilePresentation(item: TaskChatWorkspaceFileItem, t?: TFunction): TaskChatActivityPresentation {
  return {
    icon: FileText,
    runningLabel: activityLabel(t, "Referencing a file"),
    completedLabel: activityLabel(t, "Referenced a file"),
    detail: item.line == null ? item.path : `${item.path}:${item.line}`,
  };
}

function resourcePresentation(item: TaskChatMaterializedResourceItem, t?: TFunction): TaskChatActivityPresentation {
  return {
    icon: item.resourceKind === "document" ? FileText : PackageCheck,
    runningLabel: activityLabel(t, "Saving a resource"),
    completedLabel: item.resourceKind === "document"
      ? activityLabel(t, "Added a document")
      : activityLabel(t, "Added a deliverable"),
    detail: item.title,
  };
}

export function protocolActivityPresentation(item: TaskChatProtocolItem, t?: TFunction): TaskChatActivityPresentation | null {
  switch (item.surface) {
    case "provider_activity": return providerActivityPresentation(item, t);
    case "workspace_change": return workspaceChangePresentation(item, t);
    case "workspace_file": return workspaceFilePresentation(item, t);
    case "resource": return resourcePresentation(item, t);
    case "runtime_request":
    case "run_result":
    case "run_terminal":
      return null;
  }
}

export function protocolActivityIsRunning(item: TaskChatProtocolItem): boolean {
  if (item.surface === "provider_activity") return item.status === "running";
  if (item.surface === "workspace_change") return !item.complete;
  return false;
}

export function protocolActivityLabel(item: TaskChatProtocolItem, presentation: TaskChatActivityPresentation, t?: TFunction): string {
  if (item.surface !== "provider_activity") {
    return protocolActivityIsRunning(item) ? presentation.runningLabel : presentation.completedLabel;
  }
  if (item.status === "failed")
    return presentation.failedLabel ?? (t
      ? t("taskChat.activity.failedSuffix", { defaultValue: "{{label}} · failed", label: presentation.completedLabel })
      : `${presentation.completedLabel} · failed`);
  if (item.status === "interrupted")
    return presentation.interruptedLabel ?? (t
      ? t("taskChat.activity.interruptedSuffix", { defaultValue: "{{label}} · interrupted", label: presentation.completedLabel })
      : `${presentation.completedLabel} · interrupted`);
  return item.status === "running" ? presentation.runningLabel : presentation.completedLabel;
}
