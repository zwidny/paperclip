import { centsToUsd, usdToCents } from "@paperclipai/shared";
import { useEffect, useId, useState } from "react";
import type { BudgetPolicySummary } from "@paperclipai/shared";
import { AlertTriangle, PauseCircle, ShieldAlert, Wallet } from "lucide-react";
import { cn, formatCents } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { i18n, useTranslation } from "@/i18n";

function centsInputValue(value: number) {
  return (value / 100).toFixed(2);
}

function parseDollarInput(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function windowLabel(windowKind: BudgetPolicySummary["windowKind"]) {
  return windowKind === "lifetime"
    ? i18n.t("budgetPolicy.windowLifetime", { defaultValue: "Lifetime budget" })
    : i18n.t("budgetPolicy.windowMonthly", { defaultValue: "Monthly UTC budget" });
}

function statusTone(status: BudgetPolicySummary["status"]) {
  if (status === "hard_stop") return "text-red-700 dark:text-red-300 border-red-500/30 bg-red-500/10";
  if (status === "warning") return "text-amber-700 dark:text-amber-200 border-amber-500/30 bg-amber-500/10";
  return "text-emerald-700 dark:text-emerald-200 border-emerald-500/30 bg-emerald-500/10";
}

export function BudgetPolicyCard({
  summary,
  onSave,
  onUnpricedUsagePolicyChange,
  onReservationChange,
  isSaving,
  compact = false,
  variant = "card",
}: {
  summary: BudgetPolicySummary;
  onSave?: (amountCents: number) => void;
  onReservationChange?: (cents: string) => void;
  onUnpricedUsagePolicyChange?: (policy: "block" | "allow") => void;
  isSaving?: boolean;
  compact?: boolean;
  variant?: "card" | "plain";
}) {
  const { t } = useTranslation();
  const [draftBudget, setDraftBudget] = useState(centsInputValue(summary.amount));

  useEffect(() => {
    setDraftBudget(centsInputValue(summary.amount));
  }, [summary.amount]);

  const [reservation, setReservation] = useState(centsToUsd(summary.reservationCents ?? 0));
  const reservationErrorId = useId();
  useEffect(() => setReservation(centsToUsd(summary.reservationCents ?? 0)), [summary.reservationCents]);
  let reservationCents: string | null = null;
  try { if (!reservation.trim().startsWith("-")) reservationCents = usdToCents(reservation.trim()); } catch { /* Shown as invalid input below. */ }
  const reservationSection = onReservationChange ? <div className="space-y-2">
    <label className="text-sm">{t("budgetPolicy.reservePerRun", { defaultValue: "Reserve per run (USD)" })}
      <Input aria-label={t("budgetPolicy.reservePerRun", { defaultValue: "Reserve per run (USD)" })} aria-invalid={reservationCents === null} aria-describedby={reservationCents === null ? reservationErrorId : undefined}
        value={reservation} onChange={event => setReservation(event.target.value)} inputMode="decimal" />
    </label>
    {reservationCents === null && <p id={reservationErrorId} role="alert" className="text-xs text-destructive">{t("budgetPolicy.reserveInvalid", { defaultValue: "Enter a valid amount of zero or more." })}</p>}
    <p className="text-xs text-muted-foreground">{t("budgetPolicy.reserveHint", { defaultValue: "An estimate held before each run starts. Zero disables the estimate. Actual provider charges may exceed it." })}</p>
    <Button variant="outline" disabled={isSaving || reservationCents === null || reservationCents === (summary.reservationCents ?? "0.0000000")}
      onClick={() => { if (reservationCents !== null) onReservationChange(reservationCents); }}>{t("budgetPolicy.updateReservation", { defaultValue: "Update reservation" })}</Button>
  </div> : null;

  const advancedSettings = onReservationChange || onUnpricedUsagePolicyChange ? (
    <details className="space-y-3">
      <summary className="cursor-pointer text-sm font-medium">{t("budgetPolicy.advancedSettings", { defaultValue: "Advanced settings" })}</summary>
      <div className="space-y-4">
        {onUnpricedUsagePolicyChange && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={summary.unpricedUsagePolicy !== "allow"} disabled={isSaving}
              onChange={(event) => onUnpricedUsagePolicyChange(event.target.checked ? "block" : "allow")} />
            {t("budgetPolicy.blockUnpriced", { defaultValue: "Block new work when usage has no reliable price" })}
          </label>
        )}
        {reservationSection}
      </div>
    </details>
  ) : null;

  const parsedDraft = parseDollarInput(draftBudget);
  const canSave = typeof parsedDraft === "number" && parsedDraft !== summary.amount && Boolean(onSave);
  const progress = summary.amount > 0 ? Math.min(100, summary.utilizationPercent) : 0;
  const StatusIcon = summary.status === "hard_stop" ? ShieldAlert : summary.status === "warning" ? AlertTriangle : Wallet;
  const isPlain = variant === "plain";

  const observedBudgetGrid = isPlain ? (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <div className="text-(length:--text-micro) uppercase tracking-(--tracking-caps) text-muted-foreground">{t("budgetPolicy.observed", { defaultValue: "Observed" })}</div>
        <div className="mt-2 text-xl font-semibold tabular-nums">{formatCents(summary.observedAmount)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {summary.amount > 0
            ? t("budgetPolicy.percentOfLimit", { defaultValue: "{{percent}}% of limit", percent: summary.utilizationPercent })
            : t("budgetPolicy.noCap", { defaultValue: "No cap configured" })}
        </div>
      </div>
      <div>
        <div className="text-(length:--text-micro) uppercase tracking-(--tracking-caps) text-muted-foreground">{t("budgetPolicy.budget", { defaultValue: "Budget" })}</div>
        <div className="mt-2 text-xl font-semibold tabular-nums">
          {summary.amount > 0
            ? formatCents(summary.amount)
            : t("budgetPolicy.disabled", { defaultValue: "Disabled" })}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t("budgetPolicy.softAlert", { defaultValue: "Soft alert at {{percent}}%", percent: summary.warnPercent })}{summary.paused && summary.pauseReason
            ? t("budgetPolicy.pauseSuffix", { defaultValue: " · {{reason}} pause", reason: summary.pauseReason })
            : ""}
        </div>
      </div>
    </div>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border/70 bg-black/[0.18] px-4 py-3">
        <div className="text-(length:--text-micro) uppercase tracking-(--tracking-caps) text-muted-foreground">{t("budgetPolicy.observed", { defaultValue: "Observed" })}</div>
        <div className="mt-2 text-xl font-semibold tabular-nums">{formatCents(summary.observedAmount)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {summary.amount > 0
            ? t("budgetPolicy.percentOfLimit", { defaultValue: "{{percent}}% of limit", percent: summary.utilizationPercent })
            : t("budgetPolicy.noCap", { defaultValue: "No cap configured" })}
        </div>
      </div>
      <div className="rounded-xl border border-border/70 bg-black/[0.18] px-4 py-3">
        <div className="text-(length:--text-micro) uppercase tracking-(--tracking-caps) text-muted-foreground">{t("budgetPolicy.budget", { defaultValue: "Budget" })}</div>
        <div className="mt-2 text-xl font-semibold tabular-nums">
          {summary.amount > 0
            ? formatCents(summary.amount)
            : t("budgetPolicy.disabled", { defaultValue: "Disabled" })}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t("budgetPolicy.softAlert", { defaultValue: "Soft alert at {{percent}}%", percent: summary.warnPercent })}{summary.paused && summary.pauseReason
            ? t("budgetPolicy.pauseSuffix", { defaultValue: " · {{reason}} pause", reason: summary.pauseReason })
            : ""}
        </div>
      </div>
    </div>
  );

  const progressSection = (
    <div className="space-y-2">
      {summary.pendingRunCount > 0 && <p className="text-sm text-destructive">{summary.pendingRunCount === 1
        ? t("budgetPolicy.pendingRuns_one", { defaultValue: "{{count}} completed run awaits accounting.", count: summary.pendingRunCount })
        : t("budgetPolicy.pendingRuns_other", { defaultValue: "{{count}} completed runs await accounting.", count: summary.pendingRunCount })}</p>}
      {summary.unpricedEventCount > 0 && (
        <p className="text-sm text-destructive">{summary.unpricedEventCount === 1
          ? t("budgetPolicy.unpricedEvents_one", { defaultValue: "{{count}} usage event is unpriced. Known spend excludes its unknown cost.", count: summary.unpricedEventCount })
          : t("budgetPolicy.unpricedEvents_other", { defaultValue: "{{count}} usage events are unpriced. Known spend excludes their unknown cost.", count: summary.unpricedEventCount })}</p>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("budgetPolicy.remaining", { defaultValue: "Remaining" })}</span>
        <span>{summary.amount > 0
          ? formatCents(summary.remainingAmount)
          : t("budgetPolicy.unlimited", { defaultValue: "Unlimited" })}</span>
      </div>
      <div className={cn("h-2 overflow-hidden rounded-full", isPlain ? "bg-border/70" : "bg-muted/70")}>
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("budgetPolicy.utilizationAria", { defaultValue: "Budget utilization: {{percent}}% used", percent: Math.round(progress) })}
          className={cn(
            "h-full rounded-full transition-(--tp-width-background-color) duration-200",
            summary.status === "hard_stop"
              ? "bg-(--status-task-blocked)"
              : summary.status === "warning"
                ? "bg-(--status-task-todo)"
                : "bg-(--status-task-done)",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );

  const pausedPane = summary.paused ? (
    <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-900 dark:text-red-100">
      <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {summary.scopeType === "project"
          ? t("budgetPolicy.pausedProject", { defaultValue: "Execution is paused for this project until the budget block is resolved." })
          : t("budgetPolicy.pausedScope", { defaultValue: "Heartbeats are paused for this scope until the budget block is resolved." })}
      </div>
    </div>
  ) : null;

  const saveSection = onSave ? (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end", isPlain ? "" : "rounded-xl border border-border/70 bg-background/50 p-3")}>
      <div className="min-w-0 flex-1">
        <label className="text-(length:--text-micro) uppercase tracking-(--tracking-caps) text-muted-foreground">
          {t("budgetPolicy.budgetUsd", { defaultValue: "Budget (USD)" })}
        </label>
        <Input
          value={draftBudget}
          onChange={(event) => setDraftBudget(event.target.value)}
          className="mt-2"
          inputMode="decimal"
          placeholder="0.00"
        />
      </div>
      <Button
        onClick={() => {
          if (typeof parsedDraft === "number" && onSave) onSave(parsedDraft);
        }}
        disabled={!canSave || isSaving || parsedDraft === null}
      >
        {isSaving
          ? t("budgetPolicy.saving", { defaultValue: "Saving..." })
          : summary.amount > 0
            ? t("budgetPolicy.updateBudget", { defaultValue: "Update budget" })
            : t("budgetPolicy.setBudget", { defaultValue: "Set budget" })}
      </Button>
    </div>
  ) : null;

  if (isPlain) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-(length:--text-micro) uppercase tracking-(--tracking-caps) text-muted-foreground">
              {summary.scopeType}
            </div>
            <div className="mt-2 text-xl font-semibold">{summary.scopeName}</div>
            <div className="mt-2 text-sm text-muted-foreground">{windowLabel(summary.windowKind)}</div>
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-2 text-(length:--text-micro) uppercase tracking-(--tracking-caps)",
              summary.status === "hard_stop"
                ? "text-red-700 dark:text-red-300"
                : summary.status === "warning"
                  ? "text-amber-800 dark:text-amber-200"
                  : "text-muted-foreground",
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {summary.paused
              ? t("budgetPolicy.statusPaused", { defaultValue: "Paused" })
              : summary.status === "warning"
                ? t("budgetPolicy.statusWarning", { defaultValue: "Warning" })
                : summary.status === "hard_stop"
                  ? t("budgetPolicy.statusHardStop", { defaultValue: "Hard stop" })
                  : t("budgetPolicy.statusHealthy", { defaultValue: "Healthy" })}
          </div>
        </div>

        {observedBudgetGrid}
        {progressSection}
        {pausedPane}
        {saveSection}
        {advancedSettings}
        {parsedDraft === null ? (
          <p className="text-xs text-destructive">{t("budgetPolicy.invalidAmount", { defaultValue: "Enter a valid non-negative dollar amount." })}</p>
        ) : null}
      </div>
    );
  }

  return (
    <Card className={cn("overflow-hidden border-border/70 bg-card/80", compact ? "" : "shadow-(--shadow-extract-2)")}>
      <CardHeader className={cn("gap-3", compact ? "px-4 pt-4 pb-2" : "px-5 pt-5 pb-3")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-(length:--text-micro) uppercase tracking-(--tracking-caps) text-muted-foreground">
              {summary.scopeType}
            </div>
            <CardTitle className="mt-1 text-base">{summary.scopeName}</CardTitle>
            <CardDescription className="mt-1">{windowLabel(summary.windowKind)}</CardDescription>
          </div>
          <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-(length:--text-micro) uppercase tracking-(--tracking-caps)", statusTone(summary.status))}>
            <StatusIcon className="h-3.5 w-3.5" />
            {summary.paused
              ? t("budgetPolicy.statusPaused", { defaultValue: "Paused" })
              : summary.status === "warning"
                ? t("budgetPolicy.statusWarning", { defaultValue: "Warning" })
                : summary.status === "hard_stop"
                  ? t("budgetPolicy.statusHardStop", { defaultValue: "Hard stop" })
                  : t("budgetPolicy.statusHealthy", { defaultValue: "Healthy" })}
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4", compact ? "px-4 pb-4 pt-0" : "px-5 pb-5 pt-0")}>
        {observedBudgetGrid}
        {progressSection}
        {pausedPane}
        {saveSection}
        {advancedSettings}
        {parsedDraft === null ? (
          <p className="text-xs text-destructive">{t("budgetPolicy.invalidAmount", { defaultValue: "Enter a valid non-negative dollar amount." })}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
