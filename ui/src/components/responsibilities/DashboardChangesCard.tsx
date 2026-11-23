import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProposeDashboardChangesInteraction, ResponsibilityDashboardChange } from "@paperclipai/shared";
import { Check, Loader2, X } from "lucide-react";
import { agentsApi } from "@/api/agents";
import { describeError } from "@/api/errors";
import { issuesApi } from "@/api/issues";
import { responsibilityDashboardApi } from "@/api/responsibility-dashboard";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import {
  dashboardChangeGroups,
  dashboardChangeWords,
  droppedWithArea,
  isDashboardAreaChange,
  keptDashboardChanges,
  lettingGoWith,
  toggleDashboardChange,
} from "@/lib/responsibility-dashboard";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { NotRightForm } from "./BarProposalCard";

/**
 * Applying proposed dashboard changes (optionally only some, by index) and
 * saying they are not right (the person's words wake the agent in the
 * conversation). Both refresh every read that shows the dashboard.
 */
export function useDashboardChangesActions(interaction: Pick<ProposeDashboardChangesInteraction, "id" | "issueId">) {
  const queryClient = useQueryClient();
  const settle = async (updated: ProposeDashboardChangesInteraction) => {
    queryClient.setQueriesData<ProposeDashboardChangesInteraction[]>(
      { queryKey: ["issues", "interactions"] },
      (current) => current?.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["issues", "interactions"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.responsibilities.all }),
    ]);
  };
  const accept = useMutation({
    mutationFn: (keep?: number[]) => responsibilityDashboardApi.accept(interaction.issueId, interaction.id, keep),
    onSuccess: (response) => settle(response.interaction),
  });
  const decline = useMutation({
    mutationFn: async (text: string) => {
      const updated = await responsibilityDashboardApi.decline(interaction.issueId, interaction.id);
      // The person's words wake the agent, which reopens the conversation when it had finished.
      await issuesApi.addComment(interaction.issueId, text, true);
      return updated;
    },
    onSuccess: async (updated) => {
      await Promise.all([
        settle(updated),
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(interaction.issueId) }),
      ]);
    },
  });
  return { accept, decline, busy: accept.isPending || decline.isPending, error: accept.error ?? decline.error };
}

const CHANGE_LABEL_KEYS: Record<ResponsibilityDashboardChange["op"], string> = {
  add_area: "responsibilities.dashboardChanges.addArea",
  rename_area: "responsibilities.dashboardChanges.renameArea",
  remove_area: "responsibilities.dashboardChanges.removeArea",
  add_responsibility: "responsibilities.dashboardChanges.addResponsibility",
  reword_responsibility: "responsibilities.dashboardChanges.rewordResponsibility",
  move_responsibility: "responsibilities.dashboardChanges.moveResponsibility",
  remove_responsibility: "responsibilities.dashboardChanges.removeResponsibility",
};

const CHANGE_LABELS: Record<ResponsibilityDashboardChange["op"], string> = {
  add_area: "New area",
  rename_area: "Rename area",
  remove_area: "Remove area",
  add_responsibility: "New responsibility",
  reword_responsibility: "Reword responsibility",
  move_responsibility: "Move responsibility",
  remove_responsibility: "Let go of responsibility",
};

function ChangeRow({
  change,
  changes,
  dropped,
  busy,
  onToggle,
}: {
  change: ResponsibilityDashboardChange;
  changes: readonly ResponsibilityDashboardChange[];
  dropped: ReadonlySet<number>;
  busy: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const isDropped = dropped.has(change.index);
  const words = dashboardChangeWords(change);
  const areaChange = isDashboardAreaChange(change);
  const Row = areaChange ? "div" : "li";
  const withArea = isDropped ? droppedWithArea(changes, dropped, change) : null;
  const lettingGo = change.op === "remove_area" && !isDropped ? lettingGoWith(changes, dropped, change) : [];
  return (
    <Row
      className="flex min-w-0 items-start gap-2"
      data-dashboard-change={change.op}
      data-dropped={isDropped ? "" : undefined}
    >
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", isDropped && "text-muted-foreground")}>
        {areaChange ? (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className={cn("min-w-0 break-words text-base font-semibold", isDropped ? "line-through" : "text-foreground")}>
              {words.before ? <span className="text-muted-foreground line-through">{words.before}{" "}</span> : null}
              {words.after}
            </h3>
            <span data-change-label="" className="text-xs text-muted-foreground">
              {t(CHANGE_LABEL_KEYS[change.op], { defaultValue: CHANGE_LABELS[change.op] })}
            </span>
          </div>
        ) : (
          <>
            <span data-change-label="" className="text-xs text-muted-foreground">
              {t(CHANGE_LABEL_KEYS[change.op], { defaultValue: CHANGE_LABELS[change.op] })}
            </span>
            {words.before ? <p className="break-words text-sm text-muted-foreground line-through">{words.before}</p> : null}
            {words.after ? <p className={cn("break-words text-sm", isDropped ? "line-through" : "text-foreground")}>{words.after}</p> : null}
          </>
        )}
        {words.note ? <p className="text-xs text-muted-foreground">{words.note}</p> : null}
        {lettingGo.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("responsibilities.dashboardChanges.alsoLetsGoOf", {
              defaultValue: "Also lets go of: {{items}}",
              items: lettingGo.join("; "),
            })}
          </p>
        ) : null}
        {change.reason ? <p className="break-words text-xs text-muted-foreground">{change.reason}</p> : null}
      </div>
      {isDropped ? (
        <div className="flex max-w-1/3 shrink-0 flex-col items-end gap-1">
          {withArea ? (
            <span className="text-xs text-muted-foreground">
              {t("responsibilities.dashboardChanges.goesWith", { defaultValue: "Goes with {{area}}", area: withArea })}
            </span>
          ) : null}
          <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={onToggle}>
            {t("responsibilities.bar.keep", { defaultValue: "Keep" })}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          aria-label={t("responsibilities.dashboardChanges.dropThisChange", { defaultValue: "Drop this change" })}
          title={t("responsibilities.bar.drop", { defaultValue: "Drop" })}
          disabled={busy}
          onClick={onToggle}
          data-drop-change=""
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </Row>
  );
}

/**
 * Changes an agent proposed to a person's Dashboard, grouped by area as a
 * before and after: what is new, what is reworded (the old sentence struck
 * through above the new one), what moves and what is let go, each with the
 * agent's reason. Any change can be dropped before applying; dropping a new
 * area drops what is filed under it, and keeping one of those keeps the area.
 * **Apply changes** applies what is kept; **Not right** says what should
 * change and the conversation carries on. Shown in the conversation and on
 * the Dashboard while it waits.
 */
export function DashboardChangesCard({
  interaction,
  agentName: knownAgentName,
  showConversationLink = false,
}: {
  interaction: ProposeDashboardChangesInteraction;
  /** The proposing agent's name when the caller has it; otherwise it is looked up. */
  agentName?: string;
  /** On the Dashboard: a way into the conversation it came from. */
  showConversationLink?: boolean;
}) {
  const { t } = useTranslation();
  const { payload, result } = interaction;
  const changes = payload.changes;
  const groups = useMemo(() => dashboardChangeGroups(changes), [changes]);
  const [dropped, setDropped] = useState<ReadonlySet<number>>(() => new Set());
  const [notRight, setNotRight] = useState(false);
  const { accept, decline, busy, error } = useDashboardChangesActions(interaction);
  const agentId = interaction.createdByAgentId;
  const agentQuery = useQuery({
    queryKey: [...queryKeys.agents.detail(agentId ?? ""), interaction.companyId],
    queryFn: () => agentsApi.get(agentId!, interaction.companyId),
    enabled: interaction.status === "pending" && !!agentId && !knownAgentName,
    staleTime: 60_000,
  });

  if (interaction.status === "accepted") {
    return (
      <div id={`interaction-${interaction.id}`} data-testid="dashboard-changes-accepted" className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          {t("responsibilities.dashboardChanges.changed", { defaultValue: "Dashboard changed" })}
          {result?.summary ? `: ${result.summary}` : ""}.
        </span>
      </div>
    );
  }
  if (interaction.status === "rejected" || result?.outcome === "replaced") {
    return (
      <p id={`interaction-${interaction.id}`} data-testid="dashboard-changes-closed" className="text-sm text-muted-foreground">
        {result?.outcome === "replaced"
          ? t("responsibilities.dashboardChanges.replaced", { defaultValue: "Proposed dashboard changes, replaced by newer ones." })
          : t("responsibilities.dashboardChanges.notThese", { defaultValue: "Not these dashboard changes." })}
      </p>
    );
  }
  if (interaction.status !== "pending") return null;

  const agentName = knownAgentName ?? agentQuery.data?.name ?? t("responsibilities.bar.yourAgent", { defaultValue: "Your agent" });
  const keptCount = changes.length - dropped.size;
  return (
    <article
      id={`interaction-${interaction.id}`}
      data-testid="dashboard-changes"
      aria-label={t("responsibilities.dashboardChanges.proposed", { defaultValue: "Proposed dashboard changes" })}
      className="flex flex-col gap-4 rounded-md border border-border bg-card px-4 py-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {t("responsibilities.bar.proposes", { defaultValue: "{{agent}} proposes", agent: agentName })}
        </p>
        {payload.message ? <p className="text-sm text-foreground">{payload.message}</p> : null}
      </div>
      <div className="flex flex-col gap-6">
        {groups.map((group) => {
          const { areaChanges, responsibilityChanges } = group;
          const row = (change: ResponsibilityDashboardChange) => (
            <ChangeRow
              key={change.index}
              change={change}
              changes={changes}
              dropped={dropped}
              busy={busy}
              onToggle={() => setDropped((current) => toggleDashboardChange(changes, current, change.index))}
            />
          );
          return (
            <section key={group.key} aria-label={group.name} data-dashboard-change-group={group.key} className="flex min-w-0 flex-col gap-3">
              {areaChanges.length > 0 ? areaChanges.map(row) : (
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="min-w-0 break-words text-base font-semibold text-foreground">{group.name}</h3>
                  {group.hasExistingArea ? (
                    <span className="text-xs text-muted-foreground">
                      {t("responsibilities.dashboardChanges.existingArea", { defaultValue: "Existing area" })}
                    </span>
                  ) : null}
                </div>
              )}
              {responsibilityChanges.length > 0 ? (
                <ul aria-label={t("responsibilities.dashboardChanges.responsibilitiesIn", { defaultValue: "Responsibilities in {{area}}", area: group.name })} className="flex min-w-0 flex-col gap-3 pl-4 sm:pl-6">
                  {responsibilityChanges.map(row)}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{describeError(error).body}</p> : null}
      {notRight ? (
        <NotRightForm
          busy={busy}
          sending={decline.isPending}
          onSend={(text) => decline.mutate(text, { onSuccess: () => setNotRight(false) })}
          onBack={() => setNotRight(false)}
          defaultText={t("responsibilities.dashboardChanges.notRightDefault", {
            defaultValue: "Those dashboard changes aren't right yet.",
          })}
          placeholder={t("responsibilities.dashboardChanges.notRightPlaceholder", {
            defaultValue: "e.g. Keep Hiring, and fewer responsibilities under Fundraising",
          })}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {showConversationLink ? (
              <Button asChild type="button" variant="ghost" size="sm">
                <Link to={`/issues/${interaction.issueId}`}>
                  {t("responsibilities.bar.openConversation", { defaultValue: "Open the conversation" })}
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setNotRight(true)}>
              {t("responsibilities.bar.notRight", { defaultValue: "Not right" })}
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy || keptCount === 0}
            onClick={() => accept.mutate(keptDashboardChanges(changes, dropped))}
          >
            {accept.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {t("responsibilities.dashboardChanges.applyChanges", { defaultValue: "Apply changes" })}
          </Button>
        </div>
      )}
    </article>
  );
}
