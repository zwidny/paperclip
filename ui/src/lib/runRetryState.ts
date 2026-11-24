import { formatDateTime } from "./utils";
import { t } from "../i18n";

type RetryAwareRun = {
  status: string;
  retryOfRunId?: string | null;
  scheduledRetryAt?: string | Date | null;
  scheduledRetryAttempt?: number | null;
  scheduledRetryReason?: string | null;
  retryExhaustedReason?: string | null;
};

export type RunRetryStateSummary = {
  kind: "scheduled" | "exhausted" | "attempted";
  badgeLabel: string;
  tone: string;
  detail: string | null;
  secondary: string | null;
  retryOfRunId: string | null;
};

const RETRY_REASON_LABELS: Record<string, string> = {
  native_provider_overloaded: "Model at capacity",
  ai_connection_pool_wait: "Waiting for pool usage to recover",
  transient_failure: "Transient failure",
  missing_issue_comment: "Missing task comment",
  process_lost: "Process lost",
  assignment_recovery: "Assignment recovery",
  issue_continuation_needed: "Continuation needed",
  max_turns_continuation: "Max-turn continuation",
};

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function joinFragments(parts: Array<string | null>) {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(" · ") : null;
}

export function formatRetryReason(reason: string | null | undefined) {
  const normalized = readNonEmptyString(reason);
  if (!normalized) return null;
  const english = RETRY_REASON_LABELS[normalized];
  return english
    ? t(`runRetry.reason.${normalized}`, { defaultValue: english })
    : normalized.replace(/_/g, " ");
}

export function describeRunRetryState(run: RetryAwareRun): RunRetryStateSummary | null {
  const attempt =
    typeof run.scheduledRetryAttempt === "number" && Number.isFinite(run.scheduledRetryAttempt) && run.scheduledRetryAttempt > 0
      ? run.scheduledRetryAttempt
      : null;
  const attemptLabel = attempt
    ? t("runRetry.attempt", { attempt, defaultValue: `Attempt ${attempt}` })
    : null;
  const reasonLabel = formatRetryReason(run.scheduledRetryReason);
  const retryOfRunId = readNonEmptyString(run.retryOfRunId);
  const exhaustedReason = readNonEmptyString(run.retryExhaustedReason);
  const dueAt = run.scheduledRetryAt ? formatDateTime(run.scheduledRetryAt) : null;
  const isMaxTurnContinuation = run.scheduledRetryReason === "max_turns_continuation";

  /** "Next continuation" / "Next retry" without a time, for the pending branch. */
  const nextLabel = () => isMaxTurnContinuation
    ? t("runRetry.nextContinuationLabel", { defaultValue: "Next continuation" })
    : t("runRetry.nextRetryLabel", { defaultValue: "Next retry" });
  const hasRetryMetadata =
    Boolean(retryOfRunId)
    || Boolean(reasonLabel)
    || Boolean(dueAt)
    || Boolean(attemptLabel)
    || Boolean(exhaustedReason);

  if (!hasRetryMetadata) return null;

  if (run.status === "scheduled_retry") {
    return {
      kind: "scheduled",
      badgeLabel: run.scheduledRetryReason === "ai_connection_pool_wait"
        ? t("runRetry.poolExhausted", { defaultValue: "Pool exhausted" })
        : isMaxTurnContinuation
          ? t("runRetry.continuationScheduled", { defaultValue: "Continuation scheduled" })
          : t("runRetry.retryScheduled", { defaultValue: "Retry scheduled" }),
      tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
      detail: joinFragments([attemptLabel, reasonLabel]),
      secondary: dueAt
        ? (isMaxTurnContinuation
            ? t("runRetry.nextContinuation", { when: dueAt, defaultValue: `Next continuation ${dueAt}` })
            : t("runRetry.nextRetry", { when: dueAt, defaultValue: `Next retry ${dueAt}` }))
        : t("runRetry.nextPending", {
            label: nextLabel(),
            defaultValue: `${nextLabel()} pending schedule`,
          }),
      retryOfRunId,
    };
  }

  if (exhaustedReason) {
    return {
      kind: "exhausted",
      badgeLabel: isMaxTurnContinuation
        ? t("runRetry.continuationExhausted", { defaultValue: "Continuation exhausted" })
        : t("runRetry.retryExhausted", { defaultValue: "Retry exhausted" }),
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      detail: joinFragments([
        attemptLabel,
        reasonLabel,
        t("runRetry.autoRetriesExhausted", { defaultValue: "Automatic retries exhausted" }),
      ]),
      secondary: exhaustedReason.includes("Manual intervention required")
        ? exhaustedReason
        : t("runRetry.manualIntervention", {
            reason: exhaustedReason,
            defaultValue: `${exhaustedReason} Manual intervention required.`,
          }),
      retryOfRunId,
    };
  }

  return {
    kind: "attempted",
    badgeLabel: isMaxTurnContinuation
      ? t("runRetry.continuedRun", { defaultValue: "Continued run" })
      : t("runRetry.retriedRun", { defaultValue: "Retried run" }),
    tone: "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    detail: joinFragments([attemptLabel, reasonLabel]),
    secondary: null,
    retryOfRunId,
  };
}
