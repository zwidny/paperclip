import { useMutation } from "@tanstack/react-query";
import { ENVIRONMENT_LEASE_POLICIES, WORKSPACE_SOURCE_VERIFICATION_REASONS } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { Button } from "./ui/button";
import type { TFunction } from "i18next";
import { formatDateTime } from "../lib/utils";
import { WorkspaceExportRecovery } from "./WorkspaceExportRecovery";
import { useTranslation } from "../i18n";

function recordedFailure(evidence: Record<string, unknown>, t: TFunction): string {
  const recovery = evidence.systemRecovery;
  if (!recovery || typeof recovery !== "object" || !("failure" in recovery)) return t("runWorkspaceSourceInspection.noRecordedFailure", { defaultValue: "No recorded system recovery failure." });
  const failure = recovery.failure;
  if (!failure || typeof failure !== "object" || !("code" in failure) || typeof failure.code !== "string")
    return t("runWorkspaceSourceInspection.noRecordedFailure", { defaultValue: "No recorded system recovery failure." });
  const detail = "sourceVerification" in failure ? failure.sourceVerification : null;
  if (!detail || typeof detail !== "object" || !("reason" in detail) || typeof detail.reason !== "string" ||
    !(WORKSPACE_SOURCE_VERIFICATION_REASONS as readonly string[]).includes(detail.reason)) return failure.code;
  const policy = "observedLeasePolicy" in detail ? detail.observedLeasePolicy : null;
  const allowedPolicy = typeof policy === "string" &&
    (policy === "unrecognized" || (ENVIRONMENT_LEASE_POLICIES as readonly string[]).includes(policy));
  return [failure.code, detail.reason, ...(allowedPolicy ? [`${t("runWorkspaceSourceInspection.leasePolicy", { defaultValue: "lease policy" })} ${policy}`] : [])].join(" · ");
}

export function RunWorkspaceSourceInspection({ issueId, runId, companyId }: { issueId: string; runId: string; companyId: string }) {
  const { t } = useTranslation();
  const listing = useMutation({ mutationFn: () => issuesApi.recoveryActions(issueId, { runId }) });
  const inspection = useMutation({ mutationFn: (actionId: string) => issuesApi.recoveryActions(issueId, { runId, actionId }) });
  const pending = listing.isPending || inspection.isPending;
  const error = listing.error ?? inspection.error;
  const current = inspection.data?.sourceInspection;
  return (
    <div className="space-y-2" data-testid="run-workspace-source-inspection">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => { inspection.reset(); listing.mutate(); }}>
        {pending ? t("runWorkspaceSourceInspection.inspecting", { defaultValue: "Inspecting recovery…" }) : t("runWorkspaceSourceInspection.inspectRecovery", { defaultValue: "Inspect recovery" })}
      </Button>
      {error ? <p role="alert" className="text-xs text-destructive">
        {error instanceof Error ? error.message : t("runWorkspaceSourceInspection.inspectFailed", { defaultValue: "Recovery inspection failed. Try inspecting again." })}
      </p> : null}
      {listing.data?.actions.length === 0 ? <p className="text-xs text-muted-foreground">{t("runWorkspaceSourceInspection.noRecordedAction", { defaultValue: "No recorded recovery action for this run." })}</p> : null}
      {listing.data?.actions.map(action => (
        <div key={action.id} className="space-y-2 text-xs">
          <p>{t("runWorkspaceSourceInspection.recordedFailure", { defaultValue: "Recorded failure:" })} <code className="font-mono">{recordedFailure(action.evidence, t)}</code></p>
          <p className="font-mono text-muted-foreground">{action.id} · {action.status}</p>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => inspection.mutate(action.id)}>
            {t("runWorkspaceSourceInspection.inspectCurrentSource", { defaultValue: "Inspect current source" })}
          </Button>
          {action.evidence.runId === runId ? <WorkspaceExportRecovery action={action}
            issueId={issueId} companyId={companyId} showStatus={false} /> : null}
        </div>
      ))}
      {current ? <div className="space-y-2 text-xs" role="status">
        <p className="font-medium">{t("runWorkspaceSourceInspection.currentIdentity", { defaultValue: "Current recorded-source identity" })}</p>
        <p className="font-mono text-muted-foreground">{t("runWorkspaceSourceInspection.actionId", { id: current.actionId, defaultValue: "Action {{id}}" })}</p>
        <p className="text-muted-foreground">{t("runWorkspaceSourceInspection.observationNote", { defaultValue: "This read-only observation checks recorded identity. It does not confirm provider termination, local files, or successful preservation." })}</p>
        {current.status === "verified" ? <p>{t("runWorkspaceSourceInspection.verified", { defaultValue: "Recorded-source identity verified." })}</p>
          : current.status === "not_inspected" ? <p>{t("runWorkspaceSourceInspection.notInspected", { defaultValue: "Source not inspected: this record exceeds the inspection limit." })}</p>
          : <p>{t("runWorkspaceSourceInspection.blocked", { defaultValue: "Blocked:" })} <code className="font-mono">{current.sourceVerification?.reason ?? current.failureCode}</code>
            {current.sourceVerification?.observedLeasePolicy ? <> · {t("runWorkspaceSourceInspection.leasePolicy", { defaultValue: "lease policy" })} <code className="font-mono">{current.sourceVerification.observedLeasePolicy}</code></> : null}</p>}
        <p className="font-mono text-muted-foreground">{t("runWorkspaceSourceInspection.observedAt", { time: formatDateTime(current.observedAt), defaultValue: "Observed {{time}}" })}</p>
      </div> : null}
    </div>
  );
}
