import { Clock3 } from "lucide-react";
import type { CaseDetail, CaseHandoffView } from "@/api/cases";
import { AgentIdentity } from "@/components/AgentIdentity";
import type { AvatarAgent } from "@/components/AgentAvatar";
import { IssueReferencePill } from "@/components/IssueReferencePill";
import { IssueStatusBadge } from "@/components/StatusBadge";
import { PropertyRow } from "@/components/issue-properties/primitives";
import { taskStatusIconProps } from "@/lib/task-status-presentation";
import { useTranslation } from "../../i18n";

export type CaseAgentMap = ReadonlyMap<string, AvatarAgent & { status?: string }>;

export function CaseWorkSummary({ caseData, pendingHandoff, agents }: {
  caseData: CaseDetail;
  pendingHandoff?: CaseHandoffView | null;
  agents?: CaseAgentMap;
}) {
  const { t } = useTranslation();
  const task = caseData.workIssue;
  const pending = pendingHandoff === undefined ? caseData.pendingHandoff : pendingHandoff;
  const assignee = task?.assigneeAgentId ? agents?.get(task.assigneeAgentId) ?? {
    id: task.assigneeAgentId,
    name: task.assigneeAgentName ?? t("caseWork.agentFallback", { defaultValue: "Agent" }),
  } : null;
  const from = pending?.fromAgentId ? agents?.get(pending.fromAgentId)?.name ?? pending.fromAgentName ?? t("caseWork.previousAgent", { defaultValue: "the previous agent" }) : t("caseWork.previousAgent", { defaultValue: "the previous agent" });
  const to = pending ? (pending.toAgentId ? agents?.get(pending.toAgentId)?.name : null) ?? pending.toAgentName ?? t("caseWork.receivingAgent", { defaultValue: "the receiving agent" }) : null;
  const destination = pending?.toAgentId ? agents?.get(pending.toAgentId) : null;
  const waiting = pending?.destinationKind === "done" ? t("caseWork.willClose", { defaultValue: "Case will close when the task is complete." }) : pending?.lastError
    ?? (pending?.state === "awaiting_release" ? t("caseWork.waitingForFinish", { from, defaultValue: "Waiting for {{from}} to finish." })
      : destination?.status === "paused" ? t("caseWork.isPaused", { to, defaultValue: "{{to}} is paused." }) : t("caseWork.waitingForStart", { to, defaultValue: "Waiting for {{to}} to start." }));

  return <section className="space-y-3" aria-label={t("caseWork.aria", { defaultValue: "Case work" })}>
    <h2 className="text-sm font-semibold">{t("caseWork.title", { defaultValue: "Work" })}</h2>
    {caseData.workIssueId ? <div className="space-y-3">
      {task ? <div>
        <PropertyRow label={t("caseWork.task", { defaultValue: "Task" })}><IssueReferencePill issue={task} className="min-h-11 md:min-h-0" /></PropertyRow>
        <PropertyRow label={t("caseWork.workflow", { defaultValue: "Workflow" })}><span className="text-sm">{caseData.workflow?.name ?? t("caseWork.caseInstructions", { defaultValue: "Case instructions" })}</span></PropertyRow>
        {caseData.phase && <PropertyRow label={t("caseWork.phase", { defaultValue: "Phase" })}><span className="text-sm">{caseData.phase}</span></PropertyRow>}
        <PropertyRow label={t("profiles.agent", { defaultValue: "Agent" })}>{assignee ? <AgentIdentity agent={assignee} size="xs" /> : <span className="text-sm text-muted-foreground">{t("caseWork.unassigned", { defaultValue: "Unassigned" })}</span>}</PropertyRow>
        <PropertyRow label={t("caseWork.taskStatus", { defaultValue: "Task status" })}><IssueStatusBadge {...taskStatusIconProps(task)} /></PropertyRow>
      </div> : <p className="text-sm text-muted-foreground">{t("caseWork.taskUnavailable", { defaultValue: "The primary task is unavailable." })}</p>}
      {pending && pending.state !== "delivered" && pending.state !== "completed" && pending.state !== "cancelled" && <div className="flex items-start gap-2 text-sm">
        <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          {pending.state === "awaiting_release" && <p>{t("caseWork.next", { next: pending.workflowTransition?.to.name ?? t("caseWork.caseInstructions", { defaultValue: "Case instructions" }), phase: pending.phase, defaultValue: "Next: {{next}} · {{phase}}" })}</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">{waiting}</p>
        </div>
      </div>}
    </div> : <p className="text-sm text-muted-foreground">{t("caseWork.noTaskLinked", { defaultValue: "No task linked" })}</p>}
  </section>;
}
