import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { Bot, User, Cog, ChevronDown, ListFilter } from "lucide-react";
import type { CaseEvent, CaseEventKind } from "@/api/cases";
import { Button } from "@/components/ui/button";
import { StatusIcon } from "@/components/StatusIcon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, relativeTime } from "@/lib/utils";
import type { TFunction } from "i18next";
import { taskStatusIconProps } from "@/lib/task-status-presentation";
import { useTranslation } from "../i18n";

const EVENT_LABEL: Record<CaseEventKind, { key: string; defaultValue: string }> = {
  created: { key: "caseActivityFeed.eventCreated", defaultValue: "created" },
  updated: { key: "caseActivityFeed.eventUpdated", defaultValue: "updated" },
  fields_changed: { key: "caseActivityFeed.eventFieldsChanged", defaultValue: "fields changed" },
  status_changed: { key: "caseActivityFeed.eventStatusChanged", defaultValue: "status changed" },
  issue_linked: { key: "caseActivityFeed.eventIssueLinked", defaultValue: "issue linked" },
  issue_unlinked: { key: "caseActivityFeed.eventIssueUnlinked", defaultValue: "issue unlinked" },
  document_revised: { key: "caseActivityFeed.eventDocumentRevised", defaultValue: "document revised" },
  child_linked: { key: "caseActivityFeed.eventChildLinked", defaultValue: "child linked" },
  attachment_added: { key: "caseActivityFeed.eventAttachmentAdded", defaultValue: "attachment added" },
  label_added: { key: "caseActivityFeed.eventLabelAdded", defaultValue: "label added" },
  label_removed: { key: "caseActivityFeed.eventLabelRemoved", defaultValue: "label removed" },
  handoff_requested: { key: "caseActivityFeed.eventHandoffRequested", defaultValue: "handoff requested" },
  handoff_applied: { key: "caseActivityFeed.eventHandoffApplied", defaultValue: "task handed off" },
  handoff_delivered: { key: "caseActivityFeed.eventHandoffDelivered", defaultValue: "agent wake queued" },
  handoff_completed: { key: "caseActivityFeed.eventHandoffCompleted", defaultValue: "case completed" },
  handoff_cancelled: { key: "caseActivityFeed.eventHandoffCancelled", defaultValue: "handoff cancelled" },
};

/** Human label for the actor, preferring the resolved agent name. */
function actorLabel(event: CaseEvent, t: TFunction): string {
  if (event.actorType === "agent") {
    return event.actorAgentName ?? t("caseActivityFeed.actorAgent", { defaultValue: "Agent" });
  }
  if (event.actorType === "user") return t("caseActivityFeed.actorUser", { defaultValue: "User" });
  return t("caseActivityFeed.actorSystem", { defaultValue: "System" });
}

function ActorIcon({ event }: { event: CaseEvent }) {
  const Icon = event.actorType === "agent" ? Bot : event.actorType === "user" ? User : Cog;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

function issueRelationLabel(event: CaseEvent, t: TFunction): string {
  return event.kind === "issue_linked" || event.kind === "issue_unlinked"
    ? t("caseActivityFeed.relationIssue", { defaultValue: "issue" })
    : t("caseActivityFeed.relationVia", { defaultValue: "via" });
}

/** One event with actor + run→issue attribution (P4 §1). */
export function CaseEventRow({ event, compact = false }: { event: CaseEvent; compact?: boolean }) {
  const { t } = useTranslation();
  const labels = EVENT_LABEL[event.kind];
  const detail =
    event.kind === "status_changed" && event.payload
      ? `${(event.payload.previousStatus as string) ?? "?"} → ${(event.payload.status as string) ?? "?"}`
      : "";
  return (
    <div className={cn("flex items-start gap-2 text-xs", compact ? "py-1.5" : "py-2")}>
      <span className="mt-1"><ActorIcon event={event} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-medium">{labels ? t(labels.key, { defaultValue: labels.defaultValue }) : event.kind}</span>
          {detail && <span className="text-muted-foreground">· {detail}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
          <span>{actorLabel(event, t)}</span>
          {event.issue && (
            <>
              <span aria-hidden>·</span>
              <span>{issueRelationLabel(event, t)}</span>
              <Link
                to={`/issues/${event.issue.identifier}`}
                className="inline-flex min-w-0 items-center gap-1 text-foreground/80 hover:underline"
                title={event.issue.title}
              >
                <StatusIcon {...taskStatusIconProps(event.issue)} size="sm" />
                <span className="shrink-0 font-mono">{event.issue.identifier}</span>
                <span className="min-w-0 truncate">{event.issue.title}</span>
              </Link>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{relativeTime(event.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

/** The full activity feed with kind filters (detail-page Activity tab). */
export function CaseActivityFeed({ events }: { events: CaseEvent[] }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Set<CaseEventKind>>(new Set());

  // Only offer filters for kinds actually present, in first-seen order.
  const presentKinds = useMemo(() => {
    const seen: CaseEventKind[] = [];
    for (const e of events) if (!seen.includes(e.kind)) seen.push(e.kind);
    return seen;
  }, [events]);

  const filtered = useMemo(
    () => (active.size === 0 ? events : events.filter((e) => active.has(e.kind))),
    [events, active],
  );

  function toggle(kind: CaseEventKind) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const singleKind = active.size === 1 ? [...active][0]! : null;
  const singleLabel = singleKind ? EVENT_LABEL[singleKind] : undefined;
  const filterLabel = active.size === 0
    ? t("caseActivityFeed.allActivity", { defaultValue: "All activity" })
    : active.size === 1
      ? singleLabel && singleKind
        ? t(singleLabel.key, { defaultValue: singleLabel.defaultValue })
        : singleKind!
      : t("caseActivityFeed.filterCount", { value: active.size, defaultValue: "{{value}} filters" });

  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("caseActivityFeed.emptyActivity", { defaultValue: "No activity yet." })}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("caseActivityFeed.eventCount", { filtered: filtered.length, total: events.length, defaultValue: "{{filtered}} of {{total}} events" })}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <ListFilter className="h-3.5 w-3.5" />
              {filterLabel}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("caseActivityFeed.activityFilter", { defaultValue: "Activity filter" })}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setActive(new Set())}>
              {t("caseActivityFeed.allActivity", { defaultValue: "All activity" })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {presentKinds.map((kind) => (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={active.has(kind)}
                onCheckedChange={() => toggle(kind)}
              >
                {EVENT_LABEL[kind]
                  ? t(EVENT_LABEL[kind].key, { defaultValue: EVENT_LABEL[kind].defaultValue })
                  : kind}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("caseActivityFeed.noMatchingEvents", { defaultValue: "No events match this filter." })}</p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((event) => (
            <CaseEventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
