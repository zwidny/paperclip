import { useMemo } from "react";
import type { CostByBiller, CostByProviderModel } from "@paperclipai/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QuotaBar } from "./QuotaBar";
import { CostAmount } from "./CostAmount";
import { billingTypeDisplayName, formatCents, formatTokens, providerDisplayName } from "@/lib/utils";
import { useTranslation } from "../i18n";

interface BillerSpendCardProps {
  row: CostByBiller;
  weekSpendCents: number;
  budgetMonthlyCents: number;
  /** Only compare a current-month report with the monthly budget. */
  showBudgetUtilization?: boolean;
  totalCompanySpendCents: number;
  providerRows: CostByProviderModel[];
}

export function BillerSpendCard({
  row,
  weekSpendCents,
  budgetMonthlyCents,
  showBudgetUtilization = true,
  totalCompanySpendCents,
  providerRows,
}: BillerSpendCardProps) {
  const { t } = useTranslation();
  const providerBreakdown = useMemo(() => {
    const map = new Map<string, { provider: string; costCents: number; inputTokens: number; outputTokens: number }>();
    for (const entry of providerRows) {
      const current = map.get(entry.provider) ?? {
        provider: entry.provider,
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      current.costCents += entry.costCents;
      current.inputTokens += entry.inputTokens + entry.cachedInputTokens;
      current.outputTokens += entry.outputTokens;
      map.set(entry.provider, current);
    }
    return Array.from(map.values()).sort((a, b) => b.costCents - a.costCents);
  }, [providerRows]);

  const billingTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of providerRows) {
      map.set(entry.billingType, (map.get(entry.billingType) ?? 0) + entry.costCents);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [providerRows]);

  const providerBudgetShare = budgetMonthlyCents;
  const budgetPct =
    providerBudgetShare > 0
      ? Math.min(100, (row.costCents / providerBudgetShare) * 100)
      : 0;

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-0 gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">
              {providerDisplayName(row.biller)}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              <span className="font-mono">{formatTokens(row.inputTokens + row.cachedInputTokens)}</span> {t("common.in", { defaultValue: "in" })}
              {" · "}
              <span className="font-mono">{formatTokens(row.outputTokens)}</span> {t("common.out", { defaultValue: "out" })}
              {" · "}
              {t("billerSpend.providerCount", { count: row.providerCount, defaultValue: "{{count}} provider" })}
              {" · "}
              {t("billerSpend.modelCount", { count: row.modelCount, defaultValue: "{{count}} model" })}
            </CardDescription>
          </div>
          <div className="text-xl shrink-0">
            <CostAmount costCents={row.costCents} eventCount={row.eventCount}
              estimatedEventCount={row.estimatedEventCount} unpricedEventCount={row.unpricedEventCount} showUnavailableCount />
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-3 space-y-4">
        {showBudgetUtilization && budgetMonthlyCents > 0 && (
          <QuotaBar
            label={t("billerSpend.periodSpend", { defaultValue: "Period spend" })}
            percentUsed={budgetPct}
            leftLabel={formatCents(row.costCents)}
            rightLabel={t("billerSpend.ofCompanyBudget", { defaultValue: "{{percent}}% of company budget", percent: Math.round(budgetPct) })}
          />
        )}

        <div className="text-xs text-muted-foreground">
          {t("billerSpend.meteredRuns", { count: row.apiRunCount, defaultValue: "{{count}} metered run" })}
          {" · "}
          {t("billerSpend.subscriptionRuns", { count: row.subscriptionRunCount, defaultValue: "{{count}} subscription run" })}
          {" · "}
          {t("billerSpend.thisWeek", { defaultValue: "{{amount}} this week", amount: formatCents(weekSpendCents) })}
        </div>

        {billingTypeBreakdown.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("billerSpend.billingTypes", { defaultValue: "Billing types" })}
              </p>
              <div className="space-y-1.5">
                {billingTypeBreakdown.map(([billingType, costCents]) => (
                  <div key={billingType} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{billingTypeDisplayName(billingType as any)}</span>
                    <span className="font-medium tabular-nums">{formatCents(costCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {providerBreakdown.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("billerSpend.upstreamProviders", { defaultValue: "Upstream providers" })}
              </p>
              <div className="space-y-1.5">
                {providerBreakdown.map((entry) => (
                  <div key={entry.provider} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{providerDisplayName(entry.provider)}</span>
                    <div className="text-right tabular-nums">
                      <div className="font-medium">{formatCents(entry.costCents)}</div>
                      <div className="text-muted-foreground">
                        {t("billerSpend.tokensShort", { defaultValue: "{{tokens}} tok", tokens: formatTokens(entry.inputTokens + entry.outputTokens) })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
