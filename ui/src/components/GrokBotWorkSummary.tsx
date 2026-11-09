import { describeError } from "@/api/errors";
import { useQuery } from "@tanstack/react-query";
import { grokBotApi } from "@/api/grokBot";
import { Link } from "@/lib/router";
import { useTranslation } from "../i18n";
/** Reports observed Paperclip activity; this is not a provider availability indicator. */
export function GrokBotWorkSummary({ companyId, agentId }: { companyId: string; agentId: string }) {
  const { t } = useTranslation();
  const state = useQuery({ queryKey: ["grok-binding", companyId, agentId], queryFn: ({ signal }) => grokBotApi.connection(companyId, agentId, signal), refetchInterval: 10000 });
  const data = state.data, binding = data?.binding, routine = binding?.routine;
  return <div className="space-y-2 text-sm">
    {state.error && <p role="alert" className="text-destructive">{t("grokBotWorkSummary.refreshError", { message: describeError(state.error).body, defaultValue: "Connection status could not be refreshed. {{message}}" })}</p>}
    <p>{data?.recoveryNeeded
      ? t("grokBotConnection.recovery.title", { defaultValue: "Recovery needed" })
      : binding?.assignment?.status === "offered"
        ? t("grokBotConnection.assignmentOffered", { defaultValue: "Awaiting acknowledgement" })
        : binding?.assignment
          ? t("grokBotWorkSummary.working", { defaultValue: "Working in Grok Bot" })
          : routine?.verified
            ? t("grokBotWorkSummary.noActiveSession", { defaultValue: "No active Paperclip work session" })
            : t("grokBotWorkSummary.setupIncomplete", { defaultValue: "Connection setup incomplete" })}</p>
    {data?.currentTask && <Link className="underline" to={`/issues/${data.currentTask.id}`}>{data.currentTask.identifier}: {data.currentTask.title}</Link>}
    <p className="text-muted-foreground">{t("grokBotWorkSummary.queuedTasks", { value: data?.queuedTaskCount ?? t("grokBotWorkSummary.checking", { defaultValue: "Checking…" }), defaultValue: "Queued tasks: {{value}}" })}</p>
    <p className="text-muted-foreground">{t("grokBotWorkSummary.lastContact", { value: routine?.lastContactAt ? new Date(routine.lastContactAt).toLocaleString() : t("museConnection.notObserved", { defaultValue: "Not observed" }), defaultValue: "Last contact: {{value}}" })}</p>
    <p className="text-xs text-muted-foreground">{t("grokBotWorkSummary.footer", { defaultValue: "Shows Paperclip-reported activity. Open the Grok Bot desktop app to inspect the Bot’s complete activity." })}</p>
  </div>;
}
