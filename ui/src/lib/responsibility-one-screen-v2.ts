import type {
  ResponsibilityProjectSummary,
  ResponsibilityRecentRun,
  ResponsibilityRoutineSummary,
  ResponsibilityTaskSummary,
} from "@paperclipai/shared";
import { t } from "../i18n";
import { isTerminalTaskStatus, localDateKey } from "./responsibilities";
import { timeAgo } from "./timeAgo";

/**
 * The one fact each row of the "One screen v2" responsibility tables shows
 * (experimental, `enableResponsibilities`), in plain words.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Kept for callers that pass an explicit `now`; delegates to the shared helper. */
export function ago(at: Date | string, now: Date): string {
  return timeAgo(at, now.getTime());
}

/** "Paused", "Not run yet", "Last successful run 8h ago", "Failed 2d ago", "Running, started 3h ago". */
export function routineStat(routine: Pick<ResponsibilityRoutineSummary, "status" | "lastRun">, now: Date): string {
  if (routine.status === "paused") return t("responsibility.paused", { defaultValue: "Paused" });
  const run = routine.lastRun;
  if (!run) return t("responsibility.notRunYet", { defaultValue: "Not run yet" });
  const when = ago(run.at, now);
  if (run.outcome === "succeeded") {
    return t("responsibility.lastSuccessfulRun", { when, defaultValue: `Last successful run ${when}` });
  }
  if (run.outcome === "failed") {
    return t("responsibility.failedWhen", { when, defaultValue: `Failed ${when}` });
  }
  return t("responsibility.runningStarted", { when, defaultValue: `Running, started ${when}` });
}

/** Whole calendar days from today (local) to a `YYYY-MM-DD` date; negative once it has passed. */
function daysUntil(date: string, now: Date): number | null {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const [todayYear, todayMonth, todayDay] = localDateKey(now).split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear!, todayMonth! - 1, todayDay!)) / DAY);
}

/** "Due in 14 days", "Due tomorrow", "Due today", "1 day late", "5 days late"; null without a date. */
export function projectDueStat(project: Pick<ResponsibilityProjectSummary, "targetDate">, now: Date): string | null {
  if (!project.targetDate) return null;
  const days = daysUntil(project.targetDate, now);
  if (days === null) return null;
  if (days === 0) return t("responsibility.dueToday", { defaultValue: "Due today" });
  if (days === 1) return t("responsibility.dueTomorrow", { defaultValue: "Due tomorrow" });
  if (days > 1) {
    return t("responsibility.dueInDays", { days, defaultValue: `Due in ${days} days` });
  }
  return days === -1
    ? t("responsibility.oneDayLate", { defaultValue: "1 day late" })
    : t("responsibility.daysLate", { days: -days, defaultValue: `${-days} days late` });
}

/** "4 of 10 tasks done", for the progress meter's words. */
export function projectProgressLabel(progress: NonNullable<ResponsibilityProjectSummary["progress"]>): string {
  const unit = progress.total === 1
    ? t("responsibility.taskSingular", { defaultValue: "task" })
    : t("responsibility.taskPlural", { defaultValue: "tasks" });
  return t("responsibility.progress", {
    done: progress.done,
    total: progress.total,
    unit,
    defaultValue: `${progress.done} of ${progress.total} ${unit} done`,
  });
}

/** Open tasks in the order given, and the done ones the table can reveal (cancelled ones are not shown). */
export function splitTasksForTable(tasks: readonly ResponsibilityTaskSummary[]): {
  open: ResponsibilityTaskSummary[];
  done: ResponsibilityTaskSummary[];
} {
  return {
    open: tasks.filter((task) => !isTerminalTaskStatus(task.status)),
    done: tasks.filter((task) => task.status === "done"),
  };
}

const RUN_ENDED_KEYS: Record<string, { key: string; english: string }> = {
  succeeded: { key: "responsibility.runSucceeded", english: "Succeeded" },
  failed: { key: "responsibility.runFailed", english: "Failed" },
  cancelled: { key: "responsibility.runCancelled", english: "Cancelled" },
  timed_out: { key: "responsibility.runTimedOut", english: "Timed out" },
};

/** "Succeeded 1d ago", "Failed 2d ago", "Running, started 3m ago", "Queued 3m ago". */
export function runStat(run: Pick<ResponsibilityRecentRun, "status" | "createdAt" | "startedAt" | "finishedAt">, now: Date): string {
  if (run.status === "running") {
    const when = ago(run.startedAt ?? run.createdAt, now);
    return t("responsibility.runningStarted", { when, defaultValue: `Running, started ${when}` });
  }
  if (run.status === "queued") {
    const when = ago(run.createdAt, now);
    return t("responsibility.queuedWhen", { when, defaultValue: `Queued ${when}` });
  }
  const entry = RUN_ENDED_KEYS[run.status];
  const word = entry
    ? t(entry.key, { defaultValue: entry.english })
    : `${run.status.charAt(0).toUpperCase()}${run.status.slice(1).replace(/_/g, " ")}`;
  const when = ago(run.finishedAt ?? run.startedAt ?? run.createdAt, now);
  return `${word} ${when}`;
}
