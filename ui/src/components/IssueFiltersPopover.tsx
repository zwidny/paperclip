import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bot, Check, Filter, Search, User, X } from "lucide-react";
import { PriorityIcon } from "./PriorityIcon";
import { SHOW_TASK_PRIORITY_UI } from "../lib/ui-flags";
import { StatusIcon } from "./StatusIcon";
import {
  defaultIssueFilterState,
  externalObjectFilterLabel,
  externalObjectFilterOrder,
  issueFilterArraysEqual,
  issueFilterLabel,
  issuePriorityOrder,
  issueQuickFilterPresetLabel,
  issueQuickFilterPresets,
  issueStatusOrder,
  searchIssueFilterOptions,
  toggleIssueFilterValue,
  type IssueFilterState,
} from "../lib/issue-filters";
import { externalObjectIconForCategory } from "../lib/external-objects";
import { externalObjectStatusIcon } from "../lib/status-colors";
import { formatAssigneeUserLabel } from "../lib/assignees";
import type { InboxApprovalFilter, InboxCategoryFilter } from "../lib/inbox";
import { cn } from "../lib/utils";
import { IssueFilterPanel } from "./IssueFilterPanel";
import { FlyoutAppearanceProvider } from "./ui/flyout";
import { useTranslation } from "../i18n";

type AgentOption = {
  id: string;
  name: string;
};

type ProjectOption = {
  id: string;
  name: string;
};

type LabelOption = {
  id: string;
  name: string;
  color: string;
};

type CreatorOption = {
  id: string;
  label: string;
  kind: "agent" | "user";
  searchText?: string;
};

type InboxScopeFilters = {
  category: InboxCategoryFilter;
  approvalStatus: InboxApprovalFilter;
  showApprovalStatus: boolean;
  onCategoryChange: (value: InboxCategoryFilter) => void;
  onApprovalStatusChange: (value: InboxApprovalFilter) => void;
  onClear: () => void;
};

const INBOX_CATEGORY_OPTIONS: ReadonlyArray<[InboxCategoryFilter, string, string]> = [
  ["everything", "All categories", "filters.categoryOptions.all"],
  ["issues_i_touched", "My recent tasks", "filters.categoryOptions.myRecent"],
  ["join_requests", "Join requests", "filters.categoryOptions.joinRequests"],
  ["approvals", "Approvals", "filters.categoryOptions.approvals"],
  ["failed_runs", "Failed runs", "filters.categoryOptions.failedRuns"],
  ["alerts", "Alerts", "filters.categoryOptions.alerts"],
];

const INBOX_APPROVAL_STATUS_OPTIONS: ReadonlyArray<[InboxApprovalFilter, string, string]> = [
  ["all", "All approval statuses", "filters.approval.all"],
  ["actionable", "Needs action", "filters.approval.actionable"],
  ["resolved", "Resolved", "filters.approval.resolved"],
];

const SEARCHABLE_FILTER_THRESHOLD = 6;

function FilterOptionSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("issueFilterPanel.searchPlaceholder", { defaultValue: "Search {{label}}...", label })}
        aria-label={t("issueFilterPanel.searchAria", { defaultValue: "Search {{label}}", label })}
        className="h-8 pl-7 text-xs"
      />
    </div>
  );
}

export function IssueFiltersPopover({
  state,
  onChange,
  activeFilterCount,
  agents,
  projects,
  labels,
  currentUserId,
  enableExternalObjectFilters = true,
  enableLiveRunsFilter = true,
  enableAgentCreatedVisibilityFilter = false,
  enableRoutineTasksFilter = false,
  buttonVariant = "ghost",
  iconOnly = false,
  creators,
  presentation = "legacy",
  inboxScopeFilters,
}: {
  state: IssueFilterState;
  onChange: (patch: Partial<IssueFilterState>) => void;
  activeFilterCount: number;
  agents?: AgentOption[];
  projects?: ProjectOption[];
  labels?: LabelOption[];
  currentUserId?: string | null;
  enableExternalObjectFilters?: boolean;
  enableLiveRunsFilter?: boolean;
  enableAgentCreatedVisibilityFilter?: boolean;
  enableRoutineTasksFilter?: boolean;
  buttonVariant?: "ghost" | "outline";
  iconOnly?: boolean;
  creators?: CreatorOption[];
  presentation?: "legacy" | "streamlined" | "refreshed";
  inboxScopeFilters?: InboxScopeFilters;
}) {
  const streamlined = presentation === "streamlined";
  const refreshed = presentation === "refreshed";
  const { t } = useTranslation();
  const [creatorSearch, setCreatorSearch] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [labelSearch, setLabelSearch] = useState("");
  const visibleAgents = useMemo(
    () => searchIssueFilterOptions(agents, assigneeSearch, (option) => option.name),
    [agents, assigneeSearch],
  );
  const visibleProjects = useMemo(
    () => searchIssueFilterOptions(projects, projectSearch, (option) => option.name),
    [projects, projectSearch],
  );
  const visibleLabels = useMemo(
    () => searchIssueFilterOptions(labels, labelSearch, (option) => option.name),
    [labels, labelSearch],
  );
  const creatorOptions = creators ?? [];
  const creatorOptionById = useMemo(
    () => new Map(creatorOptions.map((option) => [option.id, option])),
    [creatorOptions],
  );
  const normalizedCreatorSearch = creatorSearch.trim().toLowerCase();
  const visibleCreatorOptions = useMemo(() => {
    if (!normalizedCreatorSearch) return creatorOptions;
    return creatorOptions.filter((option) =>
      `${option.label} ${option.searchText ?? ""}`.toLowerCase().includes(normalizedCreatorSearch),
    );
  }, [creatorOptions, normalizedCreatorSearch]);
  const selectedCreatorOptions = useMemo(
    () => state.creators.map((creatorId) => {
      const knownOption = creatorOptionById.get(creatorId);
      if (knownOption) return knownOption;
      if (creatorId.startsWith("agent:")) {
        const agentId = creatorId.slice("agent:".length);
        return { id: creatorId, label: agentId.slice(0, 8), kind: "agent" as const };
      }
      const userId = creatorId.startsWith("user:") ? creatorId.slice("user:".length) : creatorId;
      return {
        id: creatorId,
        label: formatAssigneeUserLabel(userId, currentUserId) ?? userId.slice(0, 5),
        kind: "user" as const,
      };
    }),
    [creatorOptionById, currentUserId, state.creators],
  );
  const clearFilters = () => {
    onChange(defaultIssueFilterState);
    inboxScopeFilters?.onClear();
  };

  const popover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={buttonVariant} size={iconOnly ? "icon" : "sm"} className={`text-xs ${iconOnly ? "relative h-8 w-8 shrink-0" : ""} ${activeFilterCount > 0 ? "text-blue-600 dark:text-blue-400" : ""}`} title={iconOnly ? (activeFilterCount > 0 ? t("filters.labelCount", { defaultValue: "Filters: {{count}}", count: activeFilterCount }) : t("filters.button", { defaultValue: "Filter" })) : undefined}>
          <Filter className={iconOnly ? "h-3.5 w-3.5" : "h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1"} />
          {!iconOnly && <span className="hidden sm:inline">{activeFilterCount > 0 ? t("filters.labelCount", { defaultValue: "Filters: {{count}}", count: activeFilterCount }) : t("filters.button", { defaultValue: "Filter" })}</span>}
          {!iconOnly && activeFilterCount > 0 ? <span className="ml-0.5 text-(length:--text-nano) font-medium sm:hidden">{activeFilterCount}</span> : null}
          {iconOnly && activeFilterCount > 0 ? <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-(length:--text-nano) font-bold text-white">{activeFilterCount}</span> : null}
          {!iconOnly && activeFilterCount > 0 ? (
            <X
              className="ml-1 hidden h-3 w-3 sm:block"
              onClick={(event) => {
                event.stopPropagation();
                clearFilters();
              }}
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t("filters.label", { defaultValue: "Filters" })}
        align="end"
        className={refreshed ? "task-filters-popover" : streamlined
          ? "w-(--sz-calc-10) max-h-(--sz-calc-9) overflow-y-auto overscroll-contain p-0"
          : "w-(--sz-calc-10) p-0"}
      >
        {refreshed ? <IssueFilterPanel enableLiveRunsFilter={enableLiveRunsFilter} enableAgentCreatedVisibilityFilter={enableAgentCreatedVisibilityFilter} enableRoutineTasksFilter={enableRoutineTasksFilter} state={state} onChange={onChange} activeFilterCount={activeFilterCount} agents={agents} projects={projects} labels={labels} creators={creators} currentUserId={currentUserId} onClear={clearFilters} /> : <div className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("filters.label", { defaultValue: "Filters" })}</span>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
              >
                {t("issueFilterPanel.clear", { defaultValue: "Clear" })}
              </button>
            ) : null}
          </div>

          {inboxScopeFilters ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1" data-filter-options="inbox-category">
                  <span className="text-xs text-muted-foreground">{t("filters.category", { defaultValue: "Category" })}</span>
                  <div className="space-y-0.5">
                    {INBOX_CATEGORY_OPTIONS.map(([value, label, labelKey]) => {
                      const selected = inboxScopeFilters.category === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          className={cn(
                            "flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-sm",
                            selected
                              ? "bg-accent/50 text-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                          )}
                          onClick={() => inboxScopeFilters.onCategoryChange(value)}
                        >
                          <span>{t(labelKey, { defaultValue: label })}</span>
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {inboxScopeFilters.showApprovalStatus ? (
                  <div className="space-y-1" data-filter-options="inbox-approval-status">
                    <span className="text-xs text-muted-foreground">{t("filters.approvalStatus", { defaultValue: "Approval status" })}</span>
                    <div className="space-y-0.5">
                      {INBOX_APPROVAL_STATUS_OPTIONS.map(([value, label, labelKey]) => {
                        const selected = inboxScopeFilters.approvalStatus === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            className={cn(
                              "flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-sm",
                              selected
                                ? "bg-accent/50 text-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                            )}
                            onClick={() => inboxScopeFilters.onApprovalStatusChange(value)}
                          >
                            <span>{t(labelKey, { defaultValue: label })}</span>
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-border" />
            </>
          ) : null}

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">{t("filters.quick", { defaultValue: "Quick filters" })}</span>
            <div className="flex flex-wrap gap-1.5">
              {issueQuickFilterPresets.map((preset) => {
                const isActive = issueFilterArraysEqual(state.statuses, preset.statuses);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    }`}
                    onClick={() => onChange({ statuses: isActive ? [] : [...preset.statuses] })}
                  >
                    {issueQuickFilterPresetLabel(preset, t)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="min-w-0 space-y-3">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("filters.status", { defaultValue: "Status" })}</span>
                <div className="space-y-0.5">
                  {issueStatusOrder.map((status) => (
                    <label key={status} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                      <Checkbox
                        checked={state.statuses.includes(status)}
                        onCheckedChange={() => onChange({ statuses: toggleIssueFilterValue(state.statuses, status) })}
                      />
                      <StatusIcon status={status} />
                      <span className="text-sm">{issueFilterLabel(status)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* PAP-411: Priority filter section hidden behind SHOW_TASK_PRIORITY_UI (filter state stays intact). */}
              {SHOW_TASK_PRIORITY_UI && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("filters.priority", { defaultValue: "Priority" })}</span>
                <div className="space-y-0.5">
                  {issuePriorityOrder.map((priority) => (
                    <label key={priority} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                      <Checkbox
                        checked={state.priorities.includes(priority)}
                        onCheckedChange={() => onChange({ priorities: toggleIssueFilterValue(state.priorities, priority) })}
                      />
                      <PriorityIcon priority={priority} />
                      <span className="text-sm">{issueFilterLabel(priority)}</span>
                    </label>
                  ))}
                </div>
              </div>
              )}
            </div>

            <div className="min-w-0 space-y-3">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{t("filters.responsible", { defaultValue: "Responsible" })}</span>
                {streamlined && (agents?.length ?? 0) + (currentUserId ? 2 : 1) > SEARCHABLE_FILTER_THRESHOLD ? (
                  <FilterOptionSearch value={assigneeSearch} onChange={setAssigneeSearch} label={t("filters.responsible", { defaultValue: "Responsible" }).toLowerCase()} />
                ) : null}
                <div data-filter-options="responsible" className={streamlined ? "space-y-0.5" : "max-h-32 space-y-0.5 overflow-y-auto"}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                    <Checkbox
                      checked={state.assignees.includes("__unassigned")}
                      onCheckedChange={() => onChange({ assignees: toggleIssueFilterValue(state.assignees, "__unassigned") })}
                    />
                    <span className="text-sm">{t("filters.noResponsible", { defaultValue: "No responsible" })}</span>
                  </label>
                  {currentUserId ? (
                    <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                      <Checkbox
                        checked={state.assignees.includes("__me")}
                        onCheckedChange={() => onChange({ assignees: toggleIssueFilterValue(state.assignees, "__me") })}
                      />
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{t("searchFilters.me", { defaultValue: "Me" })}</span>
                    </label>
                  ) : null}
                  {(streamlined ? visibleAgents : agents ?? []).map((agent) => (
                    <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                      <Checkbox
                        checked={state.assignees.includes(agent.id)}
                        onCheckedChange={() => onChange({ assignees: toggleIssueFilterValue(state.assignees, agent.id) })}
                      />
                      <span className="text-sm">{agent.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {creatorOptions.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t("filters.creator", { defaultValue: "Creator" })}</span>
                  {selectedCreatorOptions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedCreatorOptions.map((creator) => (
                        <Badge key={creator.id} variant="secondary" className="gap-1 pr-1">
                          {creator.kind === "agent" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                          <span>{creator.label}</span>
                          <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-accent"
                            onClick={() => onChange({ creators: state.creators.filter((value) => value !== creator.id) })}
                            aria-label={t("filters.removeCreator", { defaultValue: "Remove creator {{label}}", label: creator.label })}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={creatorSearch}
                      onChange={(event) => setCreatorSearch(event.target.value)}
                      placeholder={t("filters.searchCreators", { defaultValue: "Search creators..." })}
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <div data-filter-options="creators" className={streamlined ? "space-y-0.5" : "max-h-32 space-y-0.5 overflow-y-auto"}>
                    {visibleCreatorOptions.length > 0 ? visibleCreatorOptions.map((creator) => {
                      const selected = state.creators.includes(creator.id);
                      return (
                        <button
                          key={creator.id}
                          type="button"
                          className={`flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm ${
                            selected ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          }`}
                          onClick={() => onChange({ creators: toggleIssueFilterValue(state.creators, creator.id) })}
                        >
                          {creator.kind === "agent" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                          <span className="min-w-0 flex-1 truncate">{creator.label}</span>
                          {selected ? <X className="h-3 w-3" /> : null}
                        </button>
                      );
                    }) : (
                      <div className="px-2 py-1 text-xs text-muted-foreground">{t("filters.noCreators", { defaultValue: "No creators match." })}</div>
                    )}
                  </div>
                </div>
              ) : null}

              {projects && projects.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t("filters.project", { defaultValue: "Project" })}</span>
                  {streamlined && projects.length > SEARCHABLE_FILTER_THRESHOLD ? (
                    <FilterOptionSearch value={projectSearch} onChange={setProjectSearch} label={t("filters.projects", { defaultValue: "Projects" }).toLowerCase()} />
                  ) : null}
                  <div data-filter-options="projects" className={streamlined ? "space-y-0.5" : "max-h-32 space-y-0.5 overflow-y-auto"}>
                    {(streamlined ? visibleProjects : projects).map((project) => (
                      <label key={project.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                        <Checkbox
                          checked={state.projects.includes(project.id)}
                          onCheckedChange={() => onChange({ projects: toggleIssueFilterValue(state.projects, project.id) })}
                        />
                        <span className="text-sm">{project.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-w-0 space-y-3">
              {labels && labels.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t("filters.labels", { defaultValue: "Labels" })}</span>
                  {streamlined && labels.length > SEARCHABLE_FILTER_THRESHOLD ? (
                    <FilterOptionSearch value={labelSearch} onChange={setLabelSearch} label={t("filters.labels", { defaultValue: "Labels" }).toLowerCase()} />
                  ) : null}
                  <div data-filter-options="labels" className={streamlined ? "space-y-0.5" : "max-h-32 space-y-0.5 overflow-y-auto"}>
                    {(streamlined ? visibleLabels : labels).map((label) => (
                      <label key={label.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                        <Checkbox
                          checked={state.labels.includes(label.id)}
                          onCheckedChange={() => onChange({ labels: toggleIssueFilterValue(state.labels, label.id) })}
                        />
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                        <span className="text-sm">{label.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {enableExternalObjectFilters ? (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t("filters.externalObjectStatus", { defaultValue: "External object status" })}</span>
                  <div className="space-y-0.5">
                    {externalObjectFilterOrder.map((value) => {
                      const iconCategory = value === "failed" ? "failed"
                        : value === "waiting" ? "waiting"
                        : value === "running" ? "running"
                        : value === "auth_required" ? "auth_required"
                        : value === "rate_limited" ? "rate_limited"
                        : value === "unreachable" ? "unreachable"
                        : value === "stale" ? "unknown"
                        : "closed";
                      const Icon = externalObjectIconForCategory(iconCategory);
                      const tone = externalObjectStatusIcon[iconCategory] ?? "";
                      const textTone = tone.split(" ").filter((c) => c.startsWith("text-")).join(" ");
                      return (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50"
                        >
                          <Checkbox
                            checked={state.externalObjectStatuses.includes(value)}
                            onCheckedChange={() => onChange({ externalObjectStatuses: toggleIssueFilterValue(state.externalObjectStatuses, value) })}
                          />
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${textTone}`} aria-hidden="true" />
                          <span className="text-sm">{externalObjectFilterLabel(value)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {enableLiveRunsFilter || enableAgentCreatedVisibilityFilter || enableRoutineTasksFilter ? <div className="space-y-1" data-filter-options="visibility">
                <span className="text-xs text-muted-foreground">{t("filters.visibility", { defaultValue: "Visibility" })}</span>
                {enableLiveRunsFilter ? <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                  <Checkbox
                    checked={state.liveOnly}
                    onCheckedChange={(checked) => onChange({ liveOnly: checked === true })}
                  />
                  <span className="text-sm">{t("filters.liveRunsOnly", { defaultValue: "Live runs only" })}</span>
                </label> : null}
                {enableAgentCreatedVisibilityFilter ? (
                  <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                    <Checkbox
                      checked={state.showAgentCreatedTasks}
                      onCheckedChange={(checked) => onChange({ showAgentCreatedTasks: checked === true })}
                    />
                    <span className="text-sm">{t("filters.showAgentCreatedTasks", { defaultValue: "Show agent-created tasks" })}</span>
                  </label>
                ) : null}
                {enableRoutineTasksFilter ? <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                  <Checkbox
                    checked={state.routineTasksOnly === true}
                    onCheckedChange={(checked) => onChange({ routineTasksOnly: checked === true })}
                  />
                  <span className="text-sm">{t("filters.routineTasks", { defaultValue: "Routine tasks" })}</span>
                </label> : null}
              </div> : null}
            </div>
          </div>
        </div>}
      </PopoverContent>
    </Popover>
  );
  return refreshed ? <FlyoutAppearanceProvider>{popover}</FlyoutAppearanceProvider> : popover;
}
