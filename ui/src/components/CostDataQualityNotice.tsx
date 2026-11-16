import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "../lib/router";
import type { CostDataQualityItem, CostDataQualityReason } from "@paperclipai/shared";
import { costsApi } from "../api/costs";
import { formatDateTime } from "../lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AgentAvatar } from "./AgentAvatar";
import { useToastActions } from "../context/ToastContext";
import { useTranslation } from "@/i18n";

const explanations: Record<CostDataQualityReason, {
  labelKey: string; defaultLabel: string; descriptionKey: string; defaultDescription: string;
}> = {
  unknown_billing: {
    labelKey: "costQuality.reason.unknownBillingLabel",
    defaultLabel: "Billing category unknown",
    descriptionKey: "costQuality.reason.unknownBillingDescription",
    defaultDescription: "This run did not identify API or subscription billing. Any recorded charges are included in the inference ledger. For future runs, select an AI connection in the agent’s configuration so Paperclip can identify its billing.",
  },
  missing_model: {
    labelKey: "costQuality.reason.missingModelLabel",
    defaultLabel: "Model not reported",
    descriptionKey: "costQuality.reason.missingModelDescription",
    defaultDescription: "Token usage was recorded without a model, so Paperclip cannot estimate its cost. Select an explicit model in the agent’s configuration for future runs. Changing settings will not reprice this past run.",
  },
  missing_price: {
    labelKey: "costQuality.reason.missingPriceLabel",
    defaultLabel: "Cost unavailable",
    descriptionKey: "costQuality.reason.missingPriceDescription",
    defaultDescription: "The provider did not supply a reliable price for this usage. There is no action required for this past entry. New API runs with complete usage and a supported model are estimated automatically.",
  },
  waiting_for_receipt: {
    labelKey: "costQuality.reason.waitingForReceiptLabel",
    defaultLabel: "Receiving usage",
    descriptionKey: "costQuality.reason.waitingForReceiptDescription",
    defaultDescription: "This run has stopped. Paperclip is waiting for its final usage data and will record it automatically. You do not need to rerun the agent.",
  },
  receipt_unavailable: {
    labelKey: "costQuality.reason.receiptUnavailableLabel",
    defaultLabel: "Final usage unavailable",
    descriptionKey: "costQuality.reason.receiptUnavailableDescription",
    defaultDescription: "This run stopped without final usage data. Its cost remains unresolved for budget checks. Paperclip will record a late receipt if one arrives; rerunning the agent will not recover this usage.",
  },
  retryable: {
    labelKey: "costQuality.reason.retryableLabel",
    defaultLabel: "Ready to record",
    descriptionKey: "costQuality.reason.retryableDescription",
    defaultDescription: "Saved usage data is ready to be recorded. Paperclip retries automatically, or you can retry now. This records costs only; it does not rerun the agent.",
  },
};

export function CostDataQualityNotice({ companyId, from, to, reportKey, unpricedCount, pendingCount, unknownBillingCount }: {
  companyId: string; from?: string; to?: string; reportKey: readonly unknown[];
  unpricedCount: number; pendingCount: number; unknownBillingCount: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const unavailableCount = unpricedCount + pendingCount;
  const hasCostGaps = unavailableCount > 0 || unknownBillingCount > 0;
  const detailsId = useId();
  const client = useQueryClient();
  const { pushToast } = useToastActions();
  const key = [...reportKey, "data-quality"];
  const { data, error, isPending, refetch } = useQuery({
    queryKey: key,
    queryFn: () => costsApi.dataQuality(companyId, from, to),
    enabled: open && hasCostGaps,
    refetchInterval: open && hasCostGaps ? 30_000 : false,
  });
  const retry = useMutation({
    mutationFn: (runId: string) => costsApi.retryAccounting(companyId, runId),
    onSuccess: result => {
      pushToast({
        title: result.accounted
          ? t("costQuality.toast.recordedTitle", { defaultValue: "Costs recorded." })
          : t("costQuality.toast.noNewDataTitle", { defaultValue: "No new cost data is available." }),
        body: t("costQuality.toast.notRerunBody", { defaultValue: "The agent was not rerun." }),
        tone: result.accounted ? "success" : "info",
      });
      client.invalidateQueries({ queryKey: ["costs", companyId] });
      client.invalidateQueries({ queryKey: key });
      client.invalidateQueries({ queryKey: ["cost-subscriptions", companyId] });
    },
  });
  const label = unavailableCount > 0
    ? unavailableCount === 1
      ? t("costQuality.unavailableRuns_one", { defaultValue: "{{count}} run cost unavailable", count: unavailableCount })
      : t("costQuality.unavailableRuns_other", { defaultValue: "{{count}} run costs unavailable", count: unavailableCount })
    : unknownBillingCount === 1
      ? t("costQuality.unknownBillingTypes_one", { defaultValue: "{{count}} billing type unknown", count: unknownBillingCount })
      : t("costQuality.unknownBillingTypes_other", { defaultValue: "{{count}} billing types unknown", count: unknownBillingCount });

  const groups = new Map<string | null, {
    agent: { id?: string; name: string; appearance?: CostDataQualityItem["agentAppearance"] };
    items: { item: CostDataQualityItem; source: "event" | "run" }[];
  }>();
  for (const [source, items] of [["event", data?.events ?? []], ["run", data?.runs ?? []]] as const) {
    for (const item of items) {
      let group = groups.get(item.agentId);
      if (!group) {
        group = { agent: { id: item.agentId ?? undefined, name: item.agentName ?? (item.agentId
          ? t("costQuality.unknownAgent", { defaultValue: "Unknown agent" })
          : t("costQuality.paperclipServices", { defaultValue: "Paperclip services" })), appearance: item.agentAppearance }, items: [] };
        groups.set(item.agentId, group);
      }
      group.items.push({ item, source });
    }
  }
  const sortedGroups = [...groups.values()].sort((a, b) =>
    a.agent.name.localeCompare(b.agent.name, "en", { sensitivity: "base", numeric: true })
    || (a.agent.id ?? "").localeCompare(b.agent.id ?? ""));
  for (const group of sortedGroups) group.items.sort((a, b) =>
    Date.parse(b.item.occurredAt) - Date.parse(a.item.occurredAt)
    || `${a.source}:${a.item.id}`.localeCompare(`${b.source}:${b.item.id}`));

  function itemRow(item: CostDataQualityItem, source: "event" | "run") {
    const explanation = explanations[item.reason];
    return <li key={`${source}:${item.id}`} className="space-y-2 border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-normal text-muted-foreground">{t(explanation.labelKey, { defaultValue: explanation.defaultLabel })}</Badge>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time>
          {item.runId && item.agentId && <Link className="text-primary underline underline-offset-4 hover:text-primary/80" to={`/agents/${item.agentId}/runs/${item.runId}`}>{t("costQuality.viewRun", { defaultValue: "View run" })}</Link>}
          {item.reason === "retryable" && item.runId && data?.canRetry && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs font-normal underline hover:text-primary/80" disabled={retry.isPending}
            onClick={() => { retry.reset(); retry.mutate(item.runId!); }}>{t("costQuality.retryCostRecording", { defaultValue: "Retry cost recording" })}</Button>}
        </div>
      </div>
      <p>{t(explanation.descriptionKey, { defaultValue: explanation.defaultDescription })}</p>
      {retry.variables === item.runId && retry.isPending && <p role="status">{t("costQuality.recordingSavedCosts", { defaultValue: "Recording saved costs…" })}</p>}
      {retry.variables === item.runId && retry.error && <p role="status">{t("costQuality.recordingFailed", { defaultValue: "Cost recording failed. Try again shortly." })}</p>}
    </li>;
  }

  return <div className="space-y-2 text-sm text-muted-foreground">
    <Button type="button" variant="ghost" size="sm" className="h-auto justify-start gap-1 px-0 py-1 font-normal has-[>svg]:px-0" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(value => !value)}>
      {open ? <ChevronDown className="size-3" aria-hidden="true" /> : <ChevronRight className="size-3" aria-hidden="true" />}
      {label}
    </Button>
    {open && <div id={detailsId} className="space-y-2">
      {hasCostGaps && isPending && <p role="status">{t("costQuality.loadingAffectedRuns", { defaultValue: "Loading affected runs…" })}</p>}
      {hasCostGaps && error && !data && <div className="flex flex-wrap items-center gap-2"><p role="status">{t("costQuality.loadFailed", { defaultValue: "Cost details could not be loaded." })}</p><Button variant="outline" size="sm" onClick={() => refetch()}>{t("costQuality.retryLoading", { defaultValue: "Retry loading" })}</Button></div>}
      {hasCostGaps && data && <>
        {error && <p role="status">{t("costQuality.staleDetails", { defaultValue: "Showing the last loaded cost details. Updates will resume automatically." })}</p>}
        {data.events.length === 0 && data.runs.length === 0 && <p role="status">{t("costQuality.noGaps", { defaultValue: "No cost gaps remain in this period." })}</p>}
        <ul aria-label={t("costQuality.detailsByAgent", { defaultValue: "Cost details by agent" })} className="space-y-4">
          {sortedGroups.map(group => <li key={group.agent.id ?? "services"}>
            <h3 className="flex items-center gap-2 font-medium text-foreground">
              <AgentAvatar agent={group.agent} size={20} />
              {group.agent.id ? <Link className="text-primary underline underline-offset-4 hover:text-primary/80" to={`/agents/${group.agent.id}/configuration`}>{group.agent.name}</Link> : group.agent.name}
            </h3>
            <ul aria-label={t("costQuality.detailsForAgent", { defaultValue: "{{agent}} cost details", agent: group.agent.name })}>{group.items.map(({ item, source }) => itemRow(item, source))}</ul>
          </li>)}
        </ul>
        {(data.hasMoreEvents || data.hasMoreRuns) && <p className="text-xs">{t("costQuality.moreEntries", { defaultValue: "Showing the 25 most recent entries in each category. Select a shorter date range to inspect more." })}</p>}
      </>}
    </div>}
  </div>;
}
