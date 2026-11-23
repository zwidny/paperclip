import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RESPONSIBILITY_DETAIL_TASK_LIMIT } from "@paperclipai/shared";
import { Card } from "@/components/ui/card";
import { describeStale } from "@/lib/responsibilities";
import { responsibilityWorkList } from "@/lib/responsibility-views";
import { ResponsibilityHealthBadge, StaleFlag } from "./ResponsibilityHealthBadge";
import { ProposalsNotice, ResponsibilityViewHeader, SkillArtifactStrip, WorkItemRow } from "./ResponsibilityViewParts";
import type { ResponsibilityViewProps } from "./view-props";
import { WorkSignalList } from "./WorkSignalList";

const STATUS_ANCHOR = "#responsibility-status";

/**
 * "What's moving": the status line, then what the work underneath says
 * (attention first) as the heart of the page, then the work itself as one
 * list, anything needing attention first, each row marked with its kind.
 * Skills and artifacts close it as a short strip of cards.
 */
export function ResponsibilityWhatsMoving({ responsibility, agentsById, now, notices, onReviewProposal }: ResponsibilityViewProps) {
  const { t } = useTranslation();
  const { rollup } = responsibility;
  const attention = useMemo(() => rollup.workSummary.filter((signal) => signal.tone === "attention"), [rollup.workSummary]);
  const moving = useMemo(() => rollup.workSummary.filter((signal) => signal.tone !== "attention"), [rollup.workSummary]);
  const work = useMemo(() => responsibilityWorkList(responsibility, now), [responsibility, now]);
  const stale = rollup.metric?.stale && rollup.metric.updatedAt ? describeStale(rollup.metric.updatedAt, now) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8" data-responsibility-view="moving">
      <div className="flex flex-col gap-3">
        <ResponsibilityViewHeader responsibility={responsibility}>{notices}</ResponsibilityViewHeader>
        <p id="responsibility-status" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ResponsibilityHealthBadge health={rollup.health} overridden={rollup.healthOverridden} />
          <span className="text-sm text-foreground">{rollup.statusSentence}</span>
          {stale ? <StaleFlag label={stale} /> : null}
        </p>
      </div>
      {responsibility.status === "proposed" ? <ProposalsNotice count={1} subject="this" onReview={onReviewProposal} /> : null}

      <section aria-labelledby="moving-summary-heading" className="flex flex-col gap-3">
        <h2 id="moving-summary-heading" className="text-base font-semibold text-foreground">{t("responsibilities.moving.heading", { defaultValue: "What's moving" })}</h2>
        {rollup.workSummary.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("responsibilities.page.nothingToReport", { defaultValue: "Nothing to report yet. Once projects, tasks or routines are filed here, what they need shows up here." })}
          </p>
        ) : (
          <Card elevation="low" className="gap-5 px-5 py-4">
            {attention.length > 0 ? (
              <div className="flex flex-col gap-2" data-signal-group="attention">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("responsibilities.moving.needsAttention", { defaultValue: "Needs attention" })}</h3>
                <WorkSignalList signals={attention} responsibilityHref={() => STATUS_ANCHOR} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("responsibilities.moving.nothingNeedsAttention", { defaultValue: "Nothing in the work needs attention." })}</p>
            )}
            {moving.length > 0 ? (
              <div className="flex flex-col gap-2" data-signal-group="moving">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("responsibilities.moving.everythingElse", { defaultValue: "Everything else" })}</h3>
                <WorkSignalList signals={moving} responsibilityHref={() => STATUS_ANCHOR} />
              </div>
            ) : null}
          </Card>
        )}
      </section>

      <section aria-labelledby="moving-work-heading" className="flex flex-col gap-2">
        <h2 id="moving-work-heading" className="text-base font-semibold text-foreground">
          {t("responsibilities.scorecard.theWork", { defaultValue: "The work" })} <span className="text-sm font-normal tabular-nums text-muted-foreground">{work.items.length}</span>
        </h2>
        {work.items.length > 0 ? (
          <Card elevation="low" className="gap-0 overflow-hidden py-0">
            <ul className="flex flex-col divide-y divide-border">
              {work.items.map((item) => (
                <WorkItemRow key={`${item.kind}:${item.id}`} item={item} />
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">{t("responsibilities.moving.noOpenWork", { defaultValue: "No open projects, tasks or routines are filed here." })}</p>
        )}
        {work.finished > 0 || responsibility.tasksTruncated ? (
          <p className="text-xs text-muted-foreground">
            {work.finished > 0
              ? t("responsibilities.moving.finishedItems", {
                  count: work.finished,
                  defaultValue_one: "{{count}} finished item is not listed.",
                  defaultValue_other: "{{count}} finished items are not listed.",
                })
              : null}
            {work.finished > 0 && responsibility.tasksTruncated ? " " : null}
            {responsibility.tasksTruncated
              ? t("responsibilities.moving.tasksTruncated", { limit: RESPONSIBILITY_DETAIL_TASK_LIMIT, defaultValue: "Only the first {{limit}} tasks are listed." })
              : null}
          </p>
        ) : null}
      </section>

      <SkillArtifactStrip
        skills={responsibility.skills}
        artifacts={responsibility.artifacts}
        artifactsTotal={responsibility.artifactsTotal}
        agentsById={agentsById}
      />
    </div>
  );
}
