import { useState, type ReactNode } from "react";
import type { Agent, ResponsibilityArea, ResponsibilityWithRollup } from "@paperclipai/shared";
import { ChevronDown, CircleAlert, CircleCheck, MoreHorizontal, Plus, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/lib/router";
import {
  agentIdsFromSignals,
  attentionItems,
  givableFromSignal,
  RESPONSIBILITY_HEALTH_LABEL,
  responsibilityPath,
  runningSignals,
  signalHref,
  type AttentionItem,
} from "@/lib/responsibilities";
import { cn } from "@/lib/utils";
import { AgentsWorkingLabel } from "./AgentsWorking";
import { GiveToAgentMenu } from "./GiveToAgent";
import { healthStatusStyle } from "./ResponsibilityHealthBadge";
import { WorkSignalList } from "./WorkSignalList";
import { useTranslation } from "@/i18n";

type AreaRef = Pick<ResponsibilityArea, "id" | "title" | "status">;

export interface AreaActions {
  onAddHere: (areaId: string) => void;
  onRename: (area: AreaRef) => void;
  onArchive: (area: AreaRef) => void;
  onRestore: (area: AreaRef) => void;
}

/** An area's heading: its name (areas carry no status of their own) and what you can do to it. */
export function AreaHeading({
  area,
  count,
  actions,
}: {
  area: AreaRef | null;
  count: number;
  actions: AreaActions;
}) {
  const headingId = `area-heading-${area?.id ?? "none"}`;
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 id={headingId} className="flex min-w-0 items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="truncate">{area ? area.title : t("responsibilities.notInArea", { defaultValue: "Not in an area" })}</span>
        <span className="font-normal normal-case tabular-nums tracking-normal">{count}</span>
        {area?.status === "archived" ? (
          <span className="font-normal normal-case tracking-normal"> · {t("responsibilities.archived", { defaultValue: "Archived" })}</span>
        ) : null}
      </h3>
      {area ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label={`${t("responsibilities.areaMoreAriaPrefix", { defaultValue: "More for the" })} ${area.title} ${t("responsibilities.areaWord", { defaultValue: "area" })}`}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {area.status === "archived" ? (
              <DropdownMenuItem onSelect={() => actions.onRestore(area)}>{t("responsibilities.restoreArea", { defaultValue: "Restore area" })}</DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => actions.onAddHere(area.id)}>
                  <Plus aria-hidden="true" />
                  {t("responsibilities.addResponsibilityHere", { defaultValue: "Add a responsibility here" })}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onRename(area)}>{t("responsibilities.renameArea", { defaultValue: "Rename area" })}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.onArchive(area)}>{t("responsibilities.archiveAreaEllipsis", { defaultValue: "Archive area…" })}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/**
 * Active areas where this person owns nothing: discoverable behind one quiet
 * line so they do not crowd the page.
 */
export function OtherAreas({ areas, actions }: { areas: readonly AreaRef[]; actions: AreaActions }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (areas.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant="ghost"
        className="w-fit text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown aria-hidden="true" className={cn("transition-transform", !open && "-rotate-90")} />
        {t("responsibilities.moreAreas", { count: areas.length, defaultValue_one: "{{count}} more area in the company", defaultValue_other: "{{count}} more areas in the company" })}
      </Button>
      {open ? (
        <div className="flex flex-col gap-1 pl-2">
          <p className="text-xs text-muted-foreground">{t("responsibilities.otherAreasHint", { defaultValue: "Areas the company cares about where you own nothing yet." })}</p>
          <ul className="flex flex-col">
            {areas.map((area) => (
              <li key={area.id} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 truncate text-sm text-foreground">{area.title}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button size="xs" variant="ghost" onClick={() => actions.onAddHere(area.id)}>
                    <Plus aria-hidden="true" />
                    {t("responsibilities.addResponsibilityHere", { defaultValue: "Add a responsibility here" })}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-xs" variant="ghost" aria-label={`${t("responsibilities.areaMoreAriaPrefix", { defaultValue: "More for the" })} ${area.title} ${t("responsibilities.areaWord", { defaultValue: "area" })}`}>
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => actions.onRename(area)}>{t("responsibilities.renameArea", { defaultValue: "Rename area" })}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => actions.onArchive(area)}>{t("responsibilities.archiveAreaEllipsis", { defaultValue: "Archive area…" })}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** "New task for an agent", prefilled with the reason: for a line that names no single item. */
function NewTaskButton({ text, onClick }: { text: string; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button size="xs" variant="outline" className="shrink-0" onClick={onClick} aria-label={`${t("responsibilities.newTaskForAgentAria", { defaultValue: "New task for an agent" })}: ${text}`}>
      <SquarePen aria-hidden="true" />
      {t("responsibilities.parts.newTask", { defaultValue: "New task for an agent" })}
    </Button>
  );
}

/**
 * "Needs you": an action queue, not another list of responsibilities. Each
 * row is one thing to deal with (a late project, a blocked task, a number
 * short of its target) with the responsibility it belongs to as small
 * context underneath, the reverse of a responsibility row. It sits on the
 * "needs you" amber so it reads apart from the neutral cards around it.
 *
 * A reason that names a project, task or routine offers giving that item to
 * an agent; any other reason offers a new task for an agent under the
 * responsibility.
 */
export function NeedsYouSection({
  companyId,
  responsibilities,
  agents,
  onNewTask,
}: {
  companyId: string;
  responsibilities: readonly ResponsibilityWithRollup[];
  agents: readonly Agent[];
  onNewTask: (responsibility: ResponsibilityWithRollup, item: AttentionItem) => void;
}) {
  const { t } = useTranslation();
  const rows = responsibilities.flatMap((responsibility) =>
    attentionItems(responsibility).map((item) => ({ responsibility, item })),
  );
  if (rows.length === 0) {
    return (
      <section aria-labelledby="responsibilities-needs-you-heading" className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-(--status-task-icon-done)" />
        {/* Sits inside "What you own", between where things stand and the area groups. */}
        <h3 id="responsibilities-needs-you-heading" className="sr-only">{t("responsibilities.needsYou", { defaultValue: "Needs you" })}</h3>
        <p>{t("responsibilities.nothingNeedsYou", { defaultValue: "Nothing needs you right now. Everything you own is on track or quiet." })}</p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="responsibilities-needs-you-heading"
      className="overflow-hidden rounded-lg border border-(--status-task-todo)/30 bg-(--status-task-todo)/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-(--status-task-todo)/30 px-5 py-3">
        <div className="flex items-center gap-2">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-(--status-task-icon-todo)" />
          <h3 id="responsibilities-needs-you-heading" className="text-base font-semibold text-foreground">{t("responsibilities.needsYou", { defaultValue: "Needs you" })}</h3>
          <span className="text-sm tabular-nums text-muted-foreground">
            {rows.length}
            <span className="sr-only">{rows.length === 1 ? t("responsibilities.itemOne", { defaultValue: " item" }) : t("responsibilities.itemOther", { defaultValue: " items" })}</span>
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t("responsibilities.needsYouDescription", { defaultValue: "What is holding your responsibilities back. Give any of it to an agent." })}</p>
      </div>
      <ul className="flex flex-col">
        {rows.map(({ responsibility, item }) => {
          const { signal } = item;
          const givable = signal ? givableFromSignal(signal) : null;
          const itemHref = signal
            ? signal.refType === "responsibility" && signal.refId
              ? responsibilityPath(signal.refId)
              : signalHref(signal)
            : responsibilityPath(responsibility.id);
          const { health } = responsibility.rollup;
          return (
            <li
              key={`${responsibility.id}:${signal ? `${signal.kind}:${signal.refId ?? ""}` : "status"}:${item.text}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-(--status-task-todo)/30 px-5 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                {itemHref ? (
                  <Link to={itemHref} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                    {item.text}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-foreground">{item.text}</span>
                )}
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <span className="status-fill size-1.5 shrink-0 rounded-full" style={healthStatusStyle(health)} aria-hidden="true" />
                  <span>{RESPONSIBILITY_HEALTH_LABEL[health]}</span>
                  <span aria-hidden="true">·</span>
                  <Link to={responsibilityPath(responsibility.id)} className="truncate underline-offset-4 hover:underline">
                    {responsibility.title}
                  </Link>
                </span>
              </div>
              {givable ? (
                <GiveToAgentMenu companyId={companyId} item={givable} agents={agents} variant="outline" />
              ) : (
                <NewTaskButton text={item.text} onClick={() => onNewTask(responsibility, item)} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * "Running without you": responsibilities where agents hold tasks or
 * routines are running, with what that work is doing.
 */
export function RunningWithoutYouSection({
  responsibilities,
  agentsById,
  summary,
}: {
  responsibilities: readonly ResponsibilityWithRollup[];
  agentsById: ReadonlyMap<string, Agent>;
  /** The agent-powered measure, shown above the list. */
  summary: ReactNode;
}) {
  const { t } = useTranslation();
  const running = responsibilities
    .map((responsibility) => ({ responsibility, signals: runningSignals(responsibility) }))
    .filter((entry) => entry.signals.length > 0);
  return (
    <section aria-labelledby="responsibilities-running-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="responsibilities-running-heading" className="text-base font-semibold text-foreground">
          {t("responsibilities.runningWithoutYou", { defaultValue: "Running without you" })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {running.length > 0
            ? t("responsibilities.runningDescription", { defaultValue: "What agents and routines are doing under your responsibilities." })
            : t("responsibilities.nothingRunning", { defaultValue: "Nothing is running without you yet. Give a task, a routine or a project to an agent to start." })}
        </p>
      </div>
      {summary}
      {running.length > 0 ? (
        <Card elevation="low" className="gap-0 py-1">
          <ul className="flex flex-col">
            {running.map(({ responsibility, signals }) => (
              <li key={responsibility.id} className="flex flex-col gap-2 border-b border-border px-5 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={responsibilityPath(responsibility.id)}
                    className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {responsibility.title}
                  </Link>
                  <AgentsWorkingLabel agentIds={agentIdsFromSignals(responsibility.rollup)} agentsById={agentsById} />
                </div>
                <WorkSignalList signals={signals} size="xs" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
