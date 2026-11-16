import { useQuery } from "@tanstack/react-query";
import type { DecisionHistoryEntry } from "@paperclipai/shared";
import { decisionModelsApi } from "@/api/decision-models";
import { Link } from "@/lib/router";
import { formatDateTime, formatTokens, formatDetailedCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

export function DecisionHistoryTable({ entries, fastResponse = false, fastResponsesEnabled = true }: { entries: (DecisionHistoryEntry & { publicationStatus?: string; connectionName?: string | null })[]; fastResponse?: boolean; fastResponsesEnabled?: boolean }) {
  const { t } = useTranslation();
  if (!entries.length) return <p className="text-sm text-muted-foreground">{fastResponse ? t("decisionHistory.noFastResponses", { defaultValue: "No fast responses in this period." }) : t("decisionHistory.noRequests", { defaultValue: "No decision requests in this period." })} <Link to={fastResponse && !fastResponsesEnabled ? "/company/settings/instance/experimental" : "/company/settings/connections"} className="underline underline-offset-4">{fastResponse ? fastResponsesEnabled ? t("decisionHistory.configureFastResponse", { defaultValue: "Configure fast response" }) : t("decisionHistory.enableExperimentalFastResponses", { defaultValue: "Enable experimental fast responses" }) : t("decisionHistory.configureDecisionModel", { defaultValue: "Configure a decision model" })}</Link> {t("decisionHistory.suffixToRunTest", { defaultValue: "to run a test." })}</p>;
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{t("decisionHistory.recentRequests", { defaultValue: "Recent requests. Inputs are not retained." })}</p>
    <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={fastResponse ? t("decisionHistory.fastResponsesAria", { defaultValue: "Fast responses" }) : t("decisionHistory.requestsAria", { defaultValue: "Decision requests" })}>
      <thead><tr className="border-b border-border text-muted-foreground">{[t("decisionHistory.thWhenFeature", { defaultValue: "When / feature" }), t("decisionHistory.thResponsible", { defaultValue: "Responsible" }), t("decisionHistory.thTask", { defaultValue: "Task" }), ...(fastResponse ? [t("decisionHistory.thConnection", { defaultValue: "Connection" })] : []), t("decisionHistory.model", { defaultValue: "Model" }), t("decisionHistory.thStatus", { defaultValue: "Status" }), t("decisionHistory.thDuration", { defaultValue: "Duration" }), t("decisionHistory.thTokens", { defaultValue: "Tokens in / out" }), t("decisionHistory.thCost", { defaultValue: "Cost" })].map(label => <th key={label} className="px-3 py-2 text-left font-medium">{label}</th>)}</tr></thead>
      <tbody>{entries.map(row => <tr key={row.id} className="border-b border-border last:border-0">
        <td className="px-3 py-3"><div className="whitespace-nowrap">{formatDateTime(row.startedAt)}</div><div className="text-xs text-muted-foreground">{row.feature === "settings.test" ? t("decisionHistory.setupTest", { defaultValue: "Setup test" }) : row.feature}</div></td>
        <td className="px-3 py-3">{row.actorType === "system" ? t("decisionHistory.paperclipServices", { defaultValue: "Paperclip services" }) : row.userName ?? (row.responsibleUserId === "local-board" ? t("decisionHistory.board", { defaultValue: "Board" }) : t("decisionHistory.formerUser", { defaultValue: "Former user" }))}</td>
        <td className="px-3 py-3">{row.issueId ? <Link className="underline underline-offset-4" to={`/issues/${row.issueIdentifier ?? row.issueId}`}>{row.issueIdentifier ?? t("decisionHistory.viewTask", { defaultValue: "View task" })}</Link> : "—"}</td>
        {fastResponse && <td className="px-3 py-3">{row.connectionName ?? (row.connectionId ? t("decisionHistory.removedConnection", { defaultValue: "Removed connection" }) : "—")}</td>}
        <td className="px-3 py-3 font-mono text-xs">{row.model}</td>
        <td className="px-3 py-3"><div>{row.status === "succeeded" ? t("decisionHistory.statusSucceeded", { defaultValue: "Succeeded" }) : row.status === "running" ? t("decisionHistory.statusRunning", { defaultValue: "Running" }) : row.status === "unknown" ? t("decisionHistory.statusUnresolved", { defaultValue: "Unresolved" }) : row.status === "skipped" ? t("decisionHistory.statusSkipped", { defaultValue: "Skipped" }) : row.status === "pending" ? t("decisionHistory.statusPending", { defaultValue: "Pending" }) : t("decisionHistory.statusFailed", { defaultValue: "Failed" })}</div>{row.publicationStatus && <div className="text-xs text-muted-foreground">{row.publicationStatus}</div>}{row.errorCode && <div className="text-xs text-muted-foreground">{row.errorCode.replaceAll("_", " ")}</div>}</td>
        <td className="px-3 py-3 font-mono">{row.durationMs === null ? "—" : `${(row.durationMs / 1000).toFixed(1)}s`}</td>
        <td className="whitespace-nowrap px-3 py-3 font-mono">{row.inputTokens === null ? "—" : formatTokens(row.inputTokens)} / {row.outputTokens === null ? "—" : formatTokens(row.outputTokens)}</td>
        <td className="px-3 py-3 font-mono"><div>{row.costCents === null ? t("decisionHistory.unknown", { defaultValue: "Unknown" }) : formatDetailedCents(row.costCents)}</div>{row.costStatus !== "unpriced" && row.costStatus && <span className="text-xs text-muted-foreground">{row.costStatus === "estimated" ? t("decisionHistory.estimated", { defaultValue: "Estimated" }) : t("decisionHistory.reported", { defaultValue: "Reported" })}</span>}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
export function DecisionHistory({ companyId, from, to }: { companyId: string; from?: string | null; to?: string | null }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["decision-history", companyId, from, to], queryFn: () => decisionModelsApi.history(companyId, from, to), refetchInterval: q => q.state.data?.some(row => row.status === "running") ? 5000 : false });
  if (query.isPending) return <p className="text-sm text-muted-foreground">{t("decisionHistory.loading", { defaultValue: "Loading decision requests…" })}</p>;
  if (query.error) return <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{t("decisionHistory.loadFailed", { defaultValue: "Could not load decision requests." })}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("common.tryAgain", { defaultValue: "Try again" })}</Button></div>;
  return <DecisionHistoryTable entries={query.data ?? []} />;
}
