import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import type { AiConnectionUsage, AiConnectionUsageLimit, AiManagedConnectionSummary } from "@paperclipai/shared";
import { supportsAiConnectionUsage } from "@paperclipai/shared";
import { aiConnectionsApi } from "@/api/ai-connections";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { QuotaBar } from "@/components/QuotaBar";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { useTranslation } from "../../i18n";

const usageNumber = (value: number) => formatNumber(value, { maximumFractionDigits: 20 });
const amount = (value: number, unit: string | null) => unit === "USD"
  ? formatNumber(value, { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 20 })
  : `${usageNumber(value)}${unit ? ` ${unit}` : ""}`;

function limitLabel(t: TFunction, window: AiConnectionUsageLimit) {
  const weekly = t("aiConnections.usage.weekly", { defaultValue: "Weekly" });
  const label = window.label.replace(/\b(\d+(?:\.\d+)?) hour limit\b/i, "$1h").replace(/\bweekly limit\b/i, weekly);
  if (window.windowDurationSeconds == null) return label;
  const hours = window.windowDurationSeconds / 3600;
  const period = hours === 168 ? weekly : `${usageNumber(hours)}h`;
  if (/\b(?:Primary|Secondary)$/.test(label)) return `${label} · ${period}`;
  if ((hours === 168 && /weekly/i.test(label)) || label.split(/[\s·()]+/).includes(period)) return label;
  return `${label} · ${period}`;
}

function limitValue(t: TFunction, window: AiConnectionUsageLimit) {
  if (window.used === 0 && window.limit === 0) return t("aiConnections.usage.cap", { amount: amount(window.limit, window.unit), defaultValue: "{{amount}} cap" });
  if (window.used != null && window.limit != null) return t("aiConnections.usage.usedOfLimit", { used: amount(window.used, window.unit), limit: amount(window.limit, window.unit), defaultValue: "{{used}} / {{limit}} used" });
  if (window.usedPercent != null) return t("aiConnections.usage.percentUsed", { percent: usageNumber(window.usedPercent), defaultValue: "{{percent}}% used" });
  if (window.used != null) return t("aiConnections.usage.amountUsed", { amount: amount(window.used, window.unit), defaultValue: "{{amount}} used" });
  if (window.remainingPercent != null) return t("aiConnections.usage.percentLeft", { percent: usageNumber(window.remainingPercent), defaultValue: "{{percent}}% left" });
  return t("aiConnections.usage.notReported", { defaultValue: "Not reported" });
}

function limitDetails(t: TFunction, window: AiConnectionUsageLimit) {
  const details: string[] = [];
  if (window.allowed === false) details.push(t("aiConnections.usage.blocked", { defaultValue: "Blocked" }));
  else if (window.limitReached === true) details.push(t("aiConnections.usage.limitReached", { defaultValue: "Limit reached" }));
  if (window.allowed === true && (window.limitReached === true || window.usedPercent == null)) details.push(t("aiConnections.usage.allowed", { defaultValue: "Usage allowed" }));
  if (window.used == null || window.limit == null) {
    if (window.remaining != null) details.push(t("aiConnections.usage.left", { amount: amount(window.remaining, window.unit), defaultValue: "{{amount}} left" }));
    if (window.limit != null) details.push(t("aiConnections.usage.cap", { amount: amount(window.limit, window.unit), defaultValue: "{{amount}} cap" }));
  }
  if (window.resetsAt) details.push(t("aiConnections.usage.resetsAt", { date: formatDateTime(window.resetsAt, { includeYear: false }), defaultValue: "Resets {{date}}" }));
  else if (window.resetInterval) details.push(t("aiConnections.usage.resetsEvery", { interval: window.resetInterval, defaultValue: "Resets {{interval}}" }));
  return details.join(" · ");
}

function overageSummary(t: TFunction, usage: AiConnectionUsage) {
  const overage = usage.overage!;
  const details = [overage.available === true ? t("aiConnections.usage.available", { defaultValue: "Available" })
    : overage.enabled === false ? t("aiConnections.usage.off", { defaultValue: "Off" })
    : overage.available === false ? (overage.enabled === true ? t("aiConnections.usage.onUnavailable", { defaultValue: "On · Unavailable" }) : t("aiConnections.usage.unavailable", { defaultValue: "Unavailable" }))
    : overage.enabled === true ? t("aiConnections.usage.availabilityUnknown", { defaultValue: "On · Availability unknown" }) : t("aiConnections.usage.notReported", { defaultValue: "Not reported" })];
  if (overage.unlimited === true) details.push(t("aiConnections.usage.unlimited", { defaultValue: "Unlimited" }));
  else if (overage.balance != null && (overage.balance !== 0 || overage.enabled !== false)) details.push(amount(overage.balance, overage.unit));
  if (overage.remaining != null && (overage.remaining !== 0 || overage.enabled !== false)
    && !usage.limits.some((window) => window.scope === "overage" && window.remaining === overage.remaining && window.unit === overage.unit)) {
    details.push(t("aiConnections.usage.left", { amount: amount(overage.remaining, overage.unit), defaultValue: "{{amount}} left" }));
  }
  return details.join(" · ");
}

function usageError(t: TFunction, usage: AiConnectionUsage) {
  switch (usage.errorCode) {
    case "authentication_required": return t("aiConnections.usage.error.authenticationRequired", { defaultValue: "Sign in again to check usage." });
    case "permission_denied": return t("aiConnections.usage.error.permissionDenied", { defaultValue: "Usage access denied." });
    case "rate_limited": return t("aiConnections.usage.error.rateLimited", { defaultValue: "Too many checks. Try again later." });
    case "provider_unavailable": return t("aiConnections.usage.error.providerUnavailable", { defaultValue: "Provider unavailable. Try again." });
    case "invalid_response": return t("aiConnections.usage.error.invalidResponse", { defaultValue: "Couldn’t read usage. Try again." });
    case "connection_unavailable": return t("aiConnections.usage.error.connectionUnavailable", { defaultValue: "Reconnect to check usage." });
    case "unsupported": return t("aiConnections.usage.error.unsupported", { defaultValue: "Usage unavailable." });
    default: return usage.message ?? t("aiConnections.usage.error.unsupported", { defaultValue: "Usage unavailable." });
  }
}

export function AiConnectionUsagePanel({ account, observation, cachedOnly = false }: { account: AiManagedConnectionSummary; observation?: AiConnectionUsage; cachedOnly?: boolean }) {
  const { t } = useTranslation();
  const probe = useMutation({
    mutationFn: () => aiConnectionsApi.probeUsage(account.companyId, account.id, account.grantId),
  });
  const supported = supportsAiConnectionUsage(account.provider, account.method);
  const usage = cachedOnly ? observation : probe.isSuccess ? probe.data : undefined;
  return (
    <section aria-label={t("aiConnections.usage.limitsAria", { defaultValue: "Account usage limits" })} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t("aiConnections.usage.title", { defaultValue: "Usage" })}</h3>
        {supported && !cachedOnly && <Button variant="outline" size="sm" disabled={probe.isPending || account.status !== "connected"} onClick={() => probe.mutate()}>
          {probe.isPending ? t("aiConnections.usage.checking", { defaultValue: "Checking…" }) : usage?.status === "ok" ? t("aiConnections.usage.refresh", { defaultValue: "Refresh" }) : t("aiConnections.usage.check", { defaultValue: "Check usage" })}
        </Button>}
      </div>
      {cachedOnly && !usage && <p className="text-xs text-muted-foreground">{t("aiConnections.usage.notObserved", { defaultValue: "Usage not observed." })}</p>}
      {!supported && <p className="text-xs text-muted-foreground">{t("aiConnections.usage.unsupportedMethod", { defaultValue: "Unavailable for this sign-in method." })}</p>}
      {probe.error && <p role="alert" className="text-sm text-destructive">{describeError(probe.error).body}</p>}
      {usage && usage.status !== "ok" && <p role={usage.status === "unsupported" ? "status" : "alert"} className="text-sm text-muted-foreground">{usageError(t, usage)}</p>}
      {usage?.status === "ok" && (
        <div className="space-y-3" aria-live="polite">
          {usage.limits.length === 0 && <p className="text-xs text-muted-foreground">{t("aiConnections.usage.noneReported", { defaultValue: "Usage not reported." })}</p>}
          {usage.limits.map((window) => {
            const details = limitDetails(t, window);
            return <div key={window.id} className="space-y-1.5">
              {window.usedPercent != null ? <QuotaBar label={limitLabel(t, window)} percentUsed={window.usedPercent} leftLabel={limitValue(t, window)} />
                : <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{limitLabel(t, window)}</span>
                  <span className="font-mono">{limitValue(t, window)}</span>
                </div>}
              {details && <p className="text-xs text-muted-foreground">{details}</p>}
            </div>;
          })}
          {usage.overage && <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{t("aiConnections.usage.overage", { defaultValue: "Overage" })}</span>
            <span className="font-mono">{overageSummary(t, usage)}</span>
          </div>}
          <p className="text-xs text-muted-foreground">{t("aiConnections.usage.updated", { defaultValue: "Updated" })} <time className="font-mono" dateTime={usage.checkedAt} title={formatDateTime(usage.checkedAt)}>{formatDateTime(usage.checkedAt, { includeYear: false })}</time>{usage.planType ? ` · ${usage.planType}` : ""}</p>
        </div>
      )}
    </section>
  );
}
