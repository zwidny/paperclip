import { useMemo, useState } from "react";
import { Clock, X } from "lucide-react";
import type { Issue, IssueWorkProduct } from "@paperclipai/shared";
import type { TOptions, TFunction } from "i18next";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { InlineBanner } from "@/components/InlineBanner";
import { IssuePullRequestLinks } from "@/components/IssuePullRequestLinks";
import { getIssuePullRequests, pullRequestNeedsReview } from "@/lib/issue-pull-requests";
import { cn } from "@/lib/utils";
import {
  areAutomaticMonitorChecksPaused,
  canCheckIssueMonitorNow,
  deriveMonitorState,
  formatMonitorAbsolute,
  formatMonitorEta,
  formatMonitorEtaLabel,
  useMonitorCountdown,
  type DerivedMonitorState,
  type MonitorDisplayState,
} from "@/lib/issue-monitor";
import { useTranslation } from "../i18n";

/** Matches the `Date | string` inputs accepted by the issue-monitor helpers. */
type MonitorDate = Date | string;

/**
 * States in which the waiting-monitor surfaces (top banner + composer strip)
 * are shown. `cleared` and `none` hide both surfaces entirely — see
 * wireframe 04 (PAP-14557).
 */
const WAITING_STATES: readonly MonitorDisplayState[] = [
  "scheduled",
  "retrying",
  "due-now",
  "overdue",
];

export function isWaitingMonitorState(state: MonitorDisplayState): boolean {
  return WAITING_STATES.includes(state);
}

export function hasVisibleMonitorSurface(issue: Issue): boolean {
  const derived = deriveMonitorState(issue);
  return isWaitingMonitorState(derived.state) && derived.nextCheckAt !== null;
}

export interface MonitorSurfaceCopy {
  /** Prominent lead for the top banner, e.g. "Waiting on monitor — resumes in 2h 12m". */
  bannerTitle: string;
  /** Prominent lead for the composer strip, e.g. "Resumes in 2h 12m". */
  stripTitle: string;
  /** Muted detail line for the banner (absolute time carries a "(your time)" hint). */
  bannerMeta: string[];
  /** Muted detail line for the composer strip. */
  stripMeta: string[];
  /** `warning` (amber) once overdue, `info` (blue) while still on schedule. */
  tone: "info" | "warning";
  workspaceWait?: boolean;
  pullRequestReview?: boolean;
  automaticChecksPaused?: boolean;
  checkUnavailable?: boolean;
  executionWait?: boolean;
}

/**
 * Resolve one display fragment. Surfaces that pass a `t` get the active locale's
 * copy; a caller that passes none keeps the English this builder has always
 * returned, so the pure-function tests and any untranslated host still render
 * exactly what they used to.
 */
function monitorCopy(
  t: TFunction | undefined,
  key: string,
  options: TOptions & { defaultValue: string },
): string {
  if (t) return t(key, options);
  const { defaultValue, ...params } = options;
  return defaultValue.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (match, name: string) =>
    name in params ? String((params as Record<string, unknown>)[name]) : match,
  );
}

/**
 * Pure copy builder shared by the banner and the composer strip so both
 * surfaces render one consistent copy system (see wireframe 04). Kept free of
 * hooks/`Date.now()` so it is deterministic under test.
 */
export function buildMonitorSurfaceCopy(
  derived: DerivedMonitorState,
  now: MonitorDate,
  scheduledRetryReason?: string | null,
  pendingPullRequestReviews = 0,
  issueStatus?: string,
  hasActiveRun = false,
  t?: TFunction,
): MonitorSurfaceCopy | null {
  if (!isWaitingMonitorState(derived.state) || !derived.nextCheckAt) return null;

  if (derived.source === "monitor" && areAutomaticMonitorChecksPaused({ status: issueStatus })) {
    const canCheckNow = canCheckIssueMonitorNow({ status: issueStatus }, derived.serviceName);
    const hint = canCheckNow
      ? monitorCopy(t, "monitorBanner.blockedCheckNowHint", {
          defaultValue: "This task is blocked. You can ask the agent to check now.",
        })
      : monitorCopy(t, "monitorBanner.blockedResumeHint", { defaultValue: "Resume this task to continue checking." });
    return {
      bannerTitle: monitorCopy(t, "monitorBanner.automaticChecksPaused", { defaultValue: "Automatic checks paused" }),
      stripTitle: monitorCopy(t, "monitorBanner.automaticChecksPaused", { defaultValue: "Automatic checks paused" }),
      bannerMeta: [hint],
      stripMeta: [hint],
      tone: "info",
      automaticChecksPaused: true,
      checkUnavailable: !canCheckNow,
    };
  }

  if (derived.source === "scheduled-retry" && scheduledRetryReason === "workspace_busy") {
    return {
      bannerTitle: monitorCopy(t, "monitorBanner.workspaceTitle", { defaultValue: "Waiting for workspace" }),
      stripTitle: monitorCopy(t, "monitorBanner.workspaceTitle", { defaultValue: "Waiting for workspace" }),
      bannerMeta: [
        monitorCopy(t, "monitorBanner.workspaceBannerMeta", {
          defaultValue: "Another task is using this workspace. Work starts automatically when it is available.",
        }),
      ],
      stripMeta: [
        monitorCopy(t, "monitorBanner.workspaceStripMeta", {
          defaultValue: "Work starts automatically when the workspace is available.",
        }),
      ],
      tone: "info",
      workspaceWait: true,
    };
  }

  const eta = formatMonitorEta(derived.nextCheckAt, now); // "in 2h 12m" | "due now" | "overdue by 18m"
  const absolute = formatMonitorAbsolute(derived.nextCheckAt, {}, now); // local time, e.g. "Today, 4:08 PM"
  const awaitingPullRequestReview = derived.source === "monitor" && derived.serviceName?.toLowerCase() === "github" && pendingPullRequestReviews > 0;
  if (derived.source === "monitor" && hasActiveRun) {
    const hint = monitorCopy(t, "monitorBanner.executionWaitHint", {
      defaultValue: "The check can start after the current run finishes saving its work.",
    });
    return {
      bannerTitle: monitorCopy(t, "monitorBanner.executionWaitTitle", { defaultValue: "Monitor waits for current run" }),
      stripTitle: monitorCopy(t, "monitorBanner.executionWaitTitle", { defaultValue: "Monitor waits for current run" }),
      bannerMeta: [hint, monitorCopy(t, "monitorBanner.scheduledForYourTime", { absolute, defaultValue: "Scheduled for {{absolute}} (your time)" })],
      stripMeta: [hint, monitorCopy(t, "monitorBanner.scheduledFor", { absolute, defaultValue: "Scheduled for {{absolute}}" })],
      tone: "info",
      executionWait: true,
      checkUnavailable: true,
      pullRequestReview: awaitingPullRequestReview,
    };
  }
  if (awaitingPullRequestReview) {
    return {
      bannerTitle: monitorCopy(t, "monitorBanner.prReviewTitle", { defaultValue: "Pull request review requested" }),
      stripTitle: monitorCopy(t, "monitorBanner.prReviewTitle", { defaultValue: "Pull request review requested" }),
      bannerMeta: [monitorCopy(t, "monitorBanner.nextCheckYourTime", {
        eta,
        absolute,
        defaultValue: "Next check {{eta}} · {{absolute}} (your time)",
      })],
      stripMeta: [monitorCopy(t, "monitorBanner.nextCheck", {
        eta,
        absolute,
        defaultValue: "Next check {{eta}} · {{absolute}}",
      })],
      tone: derived.state === "overdue" ? "warning" : "info",
      pullRequestReview: true,
    };
  }
  if (derived.source === "scheduled-retry" && scheduledRetryReason === "ai_connection_pool_wait") {
    return {
      bannerTitle: monitorCopy(t, "monitorBanner.poolExhausted", { defaultValue: "Pool exhausted" }),
      stripTitle: monitorCopy(t, "monitorBanner.poolExhausted", { defaultValue: "Pool exhausted" }),
      bannerMeta: [
        monitorCopy(t, "monitorBanner.usageRecheckYourTime", {
          eta,
          absolute,
          defaultValue: "Usage recheck {{eta}} · {{absolute}} (your time)",
        }),
        monitorCopy(t, "monitorBanner.poolBannerMeta", {
          defaultValue: "Tasks with a selected account keep it while waiting. Work resumes when usage permits.",
        }),
      ],
      stripMeta: [
        monitorCopy(t, "monitorBanner.usageRecheck", {
          eta,
          absolute,
          defaultValue: "Usage recheck {{eta}} · {{absolute}}",
        }),
        monitorCopy(t, "monitorBanner.poolStripMeta", {
          defaultValue: "Tasks with a selected account keep it while waiting.",
        }),
      ],
      tone: "info",
    };
  }

  const isScheduledRetryOnly = derived.source === "scheduled-retry";

  let bannerTitle: string;
  let stripTitle: string;
  let statusHint: string | null = null;
  switch (derived.state) {
    case "scheduled":
    case "retrying":
      bannerTitle = isScheduledRetryOnly
        ? monitorCopy(t, "monitorBanner.agentResumes", { eta, defaultValue: "Agent resumes {{eta}}" })
        : monitorCopy(t, "monitorBanner.monitorResumes", { eta, defaultValue: "Waiting on monitor — resumes {{eta}}" });
      stripTitle = monitorCopy(t, "monitorBanner.resumes", { eta, defaultValue: "Resumes {{eta}}" });
      break;
    case "due-now":
      bannerTitle = isScheduledRetryOnly
        ? monitorCopy(t, "monitorBanner.agentRetryDueNow", { defaultValue: "Agent retry due now" })
        : monitorCopy(t, "monitorBanner.monitorDueNow", { defaultValue: "Waiting on monitor — due now" });
      stripTitle = monitorCopy(t, "monitorBanner.dueNow", { defaultValue: "Due now" });
      statusHint = monitorCopy(t, "monitorBanner.checkingMomentarily", { defaultValue: "Checking momentarily…" });
      break;
    case "overdue":
    default:
      bannerTitle = isScheduledRetryOnly
        ? monitorCopy(t, "monitorBanner.agentRetry", { eta, defaultValue: "Agent retry {{eta}}" })
        : monitorCopy(t, "monitorBanner.monitorEta", { eta, defaultValue: "Waiting on monitor — {{eta}}" });
      // Capitalize the first letter of the localized ETA instead of the English
      // text, so locales without letter case stay untouched.
      stripTitle = formatMonitorEtaLabel(derived.nextCheckAt, now);
      statusHint = monitorCopy(t, "monitorBanner.firesOnNextTick", { defaultValue: "Fires on next tick" });
      break;
  }

  const attemptLabel = derived.attemptCount >= 1
    ? monitorCopy(t, "monitorBanner.attempt", { count: derived.attemptCount, defaultValue: "Attempt {{count}}" })
    : null;
  const serviceLabel = derived.serviceName
    ? monitorCopy(t, "monitorBanner.watching", { service: derived.serviceName, defaultValue: "Watching: {{service}}" })
    : null;

  const bannerMeta = [
    statusHint,
    monitorCopy(t, "monitorBanner.absoluteYourTime", { absolute, defaultValue: "{{absolute}} (your time)" }),
    attemptLabel,
    serviceLabel,
  ].filter(
    (piece): piece is string => Boolean(piece),
  );
  const stripMeta = [statusHint, absolute, attemptLabel, serviceLabel].filter(
    (piece): piece is string => Boolean(piece),
  );

  return {
    bannerTitle,
    stripTitle,
    bannerMeta,
    stripMeta,
    tone: derived.state === "overdue" ? "warning" : "info",
  };
}

function useMonitorSurfaceCopy(issue: Issue, pendingPullRequestReviews: number, hasActiveRun: boolean): MonitorSurfaceCopy | null {
  // `nextCheckAt` is stable for a given issue; derive once to seed the ticking
  // countdown cadence, then re-derive against the live clock so the surfaces
  // roll scheduled → due → overdue on their own.
  const nextCheckAt = useMemo(() => {
    const derived = deriveMonitorState(issue);
    return derived.source === "monitor" && areAutomaticMonitorChecksPaused(issue) ? null : derived.nextCheckAt;
  }, [issue]);
  const now = useMonitorCountdown(nextCheckAt);
  const { t } = useTranslation();
  return useMemo(() => buildMonitorSurfaceCopy(deriveMonitorState(issue, now), now, issue.scheduledRetry?.scheduledRetryReason, pendingPullRequestReviews, issue.status, hasActiveRun, t), [issue, now, pendingPullRequestReviews, hasActiveRun, t]);
}

function CheckNowButton({
  onCheckNow,
  checkingNow,
  reviewRequested = false,
}: {
  onCheckNow: () => void;
  checkingNow: boolean;
  reviewRequested?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 shadow-none"
      onClick={onCheckNow}
      disabled={checkingNow}
    >
      {checkingNow
        ? t("monitorBanner.checking", { defaultValue: "Checking…" })
        : reviewRequested
          ? t("monitorBanner.checkStatus", { defaultValue: "Check status" })
          : t("monitorBanner.checkNow", { defaultValue: "Check now" })}
    </Button>
  );
}

function CancelMonitorButton({ onCancel }: { onCancel: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = async () => {
    setPending(true);
    setError(null);
    try {
      await onCancel();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : t("monitorBanner.cancelFailed", { defaultValue: "Unable to cancel the monitor. Try again." }));
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(null); } }}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2"
          aria-label={t("monitorBanner.cancelMonitorAria", { defaultValue: "Cancel monitor" })}
          title={t("monitorBanner.cancelMonitorAria", { defaultValue: "Cancel monitor" })}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("monitorBanner.cancelTitle", { defaultValue: "Cancel monitor?" })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("monitorBanner.cancelDescription", {
              defaultValue: "This removes the scheduled monitor check. The agent will no longer resume from this monitor. You can send a message to continue the task.",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("monitorBanner.keepMonitor", { defaultValue: "Keep monitor" })}
          </AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => void cancel()}>
            {pending
              ? t("monitorBanner.cancelling", { defaultValue: "Cancelling…" })
              : t("monitorBanner.cancelMonitor", { defaultValue: "Cancel monitor" })}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface IssueMonitorSurfaceProps {
  issue: Issue;
  hasActiveRun?: boolean;
  onCheckNow?: (() => void) | null;
  checkingNow?: boolean;
  workProducts?: IssueWorkProduct[] | null;
  checkError?: string | null;
  onCancelMonitor?: (() => Promise<unknown>) | null;
}

/**
 * Pinned banner rendered between the issue title and description while a
 * monitor is waiting. Replaces the description-area "Monitor scheduled" card
 * for the waiting state (PAP-14557 decision 1) — the two never render at once.
 */
export function IssueMonitorBanner({
  issue,
  hasActiveRun = false,
  onCheckNow = null,
  checkingNow = false,
  workProducts,
  checkError,
  onCancelMonitor,
}: IssueMonitorSurfaceProps) {
  const reviews = getIssuePullRequests(workProducts).filter(pullRequestNeedsReview);
  const copy = useMonitorSurfaceCopy(issue, reviews.length, hasActiveRun);
  if (!copy) return null;

  // A busy workspace is a transient system wait the user cannot act on. It stays
  // a quiet status (composer strip, properties row), never a pinned notice.
  if (copy.workspaceWait) return null;

  const canCancel = onCancelMonitor && deriveMonitorState(issue).source === "monitor";

  return (
    <InlineBanner
      tone={copy.tone}
      icon={Clock}
      title={copy.bannerTitle}
      className={cn("relative my-3", canCancel && "pr-12")}
      actions={onCheckNow && !copy.workspaceWait && !copy.checkUnavailable ? <CheckNowButton onCheckNow={onCheckNow} checkingNow={checkingNow} reviewRequested={copy.pullRequestReview} /> : null}
    >
      {canCancel ? <CancelMonitorButton key={issue.id} onCancel={onCancelMonitor} /> : null}
      <div className="flex flex-col gap-2">
        {copy.pullRequestReview ? <IssuePullRequestLinks products={reviews} /> : null}
        <span>{copy.bannerMeta.join("  ·  ")}</span>
        {checkError ? <p role="alert">{checkError}</p> : null}
      </div>
    </InlineBanner>
  );
}

/**
 * Slim, inline (not sticky) strip anchored directly above the reply composer.
 * Mirrors the banner's monitor state and reminds the reader that replying wakes
 * the agent early (PAP-14557 decisions 2 + wireframe 02).
 */
export function IssueMonitorComposerStrip({
  issue,
  hasActiveRun = false,
  onCheckNow = null,
  checkingNow = false,
  workProducts,
  checkError,
  className,
}: IssueMonitorSurfaceProps & { className?: string }) {
  const { t } = useTranslation();
  const reviews = getIssuePullRequests(workProducts).filter(pullRequestNeedsReview);
  const copy = useMonitorSurfaceCopy(issue, reviews.length, hasActiveRun);
  if (!copy) return null;

  return (
    <div
      role="note"
      data-testid="issue-monitor-composer-strip"
      className={cn("rounded-lg border border-border bg-muted/30 px-3 py-2", className)}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Clock className={cn("mt-0.5 h-4 w-4 shrink-0", issue.displayStatus === "monitoring" ? "text-(--status-task-icon-monitoring)" : "text-muted-foreground")} aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="text-sm font-medium text-foreground">{copy.stripTitle}</div>
            {copy.pullRequestReview ? <IssuePullRequestLinks products={reviews} /> : null}
            <div className="text-xs text-muted-foreground">{copy.stripMeta.join(" · ")}</div>
          </div>
        </div>
        {onCheckNow && !copy.workspaceWait && !copy.checkUnavailable ? <CheckNowButton onCheckNow={onCheckNow} checkingNow={checkingNow} reviewRequested={copy.pullRequestReview} /> : null}
      </div>
      {!copy.automaticChecksPaused ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {copy.pullRequestReview && copy.executionWait
            ? "Review on GitHub while the current run finishes saving its work."
            : copy.pullRequestReview
            ? "Review on GitHub, then check status to have the agent verify the result."
            : copy.workspaceWait || copy.executionWait
            ? "You can keep sending instructions while the agent waits."
            : "Sending a reply wakes the agent now — before the scheduled check."}
        </p>
      ) : null}
      {checkError ? <p role="alert" className="text-sm text-destructive">{checkError}</p> : null}
    </div>
  );
}
