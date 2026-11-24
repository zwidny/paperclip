import { Fragment, useMemo, type ReactNode } from "react";
import type { ResponsibilityDetail } from "@paperclipai/shared";
import { RESPONSIBILITY_ARTIFACT_COUNT_LIMIT } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Card } from "@/components/ui/card";
import { skillRoute } from "@/lib/company-skill-routes";
import { describeMetricReading, describeStale } from "@/lib/responsibilities";
import { responsibilityWorkCounts, type WorkCount } from "@/lib/responsibility-views";
import { Link } from "@/lib/router";
import { cn, intlLocale } from "@/lib/utils";
import { MetricMeter } from "./MetricGlance";
import { ResponsibilityHealthBadge, StaleFlag } from "./ResponsibilityHealthBadge";
import { ProposalsNotice, ResponsibilityViewHeader } from "./ResponsibilityViewParts";
import type { ResponsibilityViewProps } from "./view-props";

/** The number against its target, large, with the status and its sentence. */
export function ScoreHero({ responsibility, now, className }: { responsibility: ResponsibilityDetail; now: Date; className?: string }) {
  const { rollup } = responsibility;
  const { t } = useTranslation();
  const metric = rollup.metric;
  const reading = metric ? describeMetricReading(metric) : null;
  return (
    <Card id="responsibility-score" elevation="low" className={cn("gap-6 px-6 py-6", className)}>
      {metric && reading ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{metric.name}</p>
          <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
            {reading.current ? (
              <>
                <span className="text-4xl font-semibold text-foreground">{reading.current}</span>
                <span className="text-lg text-muted-foreground">{reading.targetLabel}</span>
              </>
            ) : (
              <>
                <span className="text-2xl font-semibold text-muted-foreground">{t("responsibilities.metric.noReading", { defaultValue: "No reading yet" })}</span>
                <span className="text-lg text-muted-foreground">{reading.targetLabel}</span>
              </>
            )}
          </p>
          <MetricMeter reading={reading} health={rollup.health} label={t("responsibilities.metric.towardBar", { defaultValue: "{{name}}, toward its bar", name: metric.name })} className="h-2" />
        </div>
      ) : (
        <p className="text-2xl font-semibold text-muted-foreground">{t("responsibilities.metric.noNumber", { defaultValue: "No number to track yet" })}</p>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <ResponsibilityHealthBadge health={rollup.health} overridden={rollup.healthOverridden} />
          {metric?.stale && metric.updatedAt ? <StaleFlag label={describeStale(metric.updatedAt, now)} /> : null}
        </div>
        <p className="text-sm text-foreground">{rollup.statusSentence}</p>
      </div>
    </Card>
  );
}

function CountCell({ id, label, count }: { id: string; label: string; count: WorkCount }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-4" data-count={id}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums text-foreground">{count.value}</dd>
      <dd className={cn("text-sm", count.alert ? "text-(--status-task-icon-blocked)" : "text-muted-foreground")}>{count.line}</dd>
    </div>
  );
}

function CompactCount({ id, label, value, children }: { id: string; label: string; value: string; children: ReactNode }) {
  return (
    <Card elevation="low" className="min-w-0 gap-0.5 px-4 py-3" data-count={id}>
      <dt className="flex items-baseline gap-2 text-sm text-muted-foreground">
        {label} <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </dt>
      <dd className="truncate text-xs text-muted-foreground">{children}</dd>
    </Card>
  );
}

/**
 * "Scorecard": the number against its target, large, with the status and
 * its sentence; projects, tasks and routines as three counts with one
 * exception each; skills and artifacts as two compact counts.
 */
export function ResponsibilityScorecard({ responsibility, now, notices, onReviewProposal }: ResponsibilityViewProps) {
  const { t } = useTranslation();
  const counts = useMemo(() => responsibilityWorkCounts(responsibility), [responsibility]);
  const { skills, artifacts, artifactsTotal } = responsibility;
  const newest = artifacts[0] ?? null;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col" data-responsibility-view="scorecard">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <ResponsibilityViewHeader responsibility={responsibility}>{notices}</ResponsibilityViewHeader>
        {responsibility.status === "proposed" ? <ProposalsNotice count={1} subject="this" onReview={onReviewProposal} /> : null}

        <ScoreHero responsibility={responsibility} now={now} />

        <Card elevation="low" className="gap-0 py-0">
          <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label={t("responsibilities.scorecard.theWork", { defaultValue: "The work" })}>
            <CountCell id="routines" label={t("responsibilities.scorecard.routines", { defaultValue: "Routines" })} count={counts.routines} />
            <CountCell id="projects" label={t("responsibilities.scorecard.projects", { defaultValue: "Projects" })} count={counts.projects} />
            <CountCell id="tasks" label={t("responsibilities.scorecard.tasks", { defaultValue: "Tasks" })} count={counts.tasks} />
          </dl>
        </Card>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CompactCount id="skills" label={t("responsibilities.scorecard.skills", { defaultValue: "Skills" })} value={String(skills.length)}>
            {skills.length === 0
              ? t("responsibilities.scorecard.noneYet", { defaultValue: "None yet" })
              : skills.slice(0, 3).map((skill, index) => (
                  <Fragment key={skill.id}>
                    {index > 0 ? ", " : null}
                    <Link to={skillRoute(skill)} className="underline-offset-4 hover:text-foreground hover:underline">{skill.name}</Link>
                  </Fragment>
                ))}
            {skills.length > 3 ? t("responsibilities.scorecard.andMore", { defaultValue: " and {{count}} more", count: skills.length - 3 }) : null}
          </CompactCount>
          <CompactCount
            id="artifacts"
            label={t("responsibilities.scorecard.artifacts", { defaultValue: "Artifacts" })}
            value={artifactsTotal >= RESPONSIBILITY_ARTIFACT_COUNT_LIMIT ? `${RESPONSIBILITY_ARTIFACT_COUNT_LIMIT.toLocaleString(intlLocale())}+` : artifactsTotal.toLocaleString(intlLocale())}
          >
            {newest ? (
              <>
                {t("responsibilities.scorecard.newest", { defaultValue: "Newest:" })}{" "}
                <Link to={newest.href} className="underline-offset-4 hover:text-foreground hover:underline">{newest.title}</Link>
              </>
            ) : (
              t("responsibilities.scorecard.noneYet", { defaultValue: "None yet" })
            )}
          </CompactCount>
        </dl>
      </div>
    </div>
  );
}
