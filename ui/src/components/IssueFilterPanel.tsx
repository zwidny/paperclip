import { useId, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { Bot, Search, User } from "lucide-react";
import type { IssueFiltersPopover } from "./IssueFiltersPopover";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { FlyoutHeader } from "./ui/flyout";
import { StatusIcon } from "./StatusIcon";
import { TruncatedText } from "./TruncatedText";
import { issueFilterLabel, issueStatusOrder, searchIssueFilterOptions, toggleIssueFilterValue } from "@/lib/issue-filters";
import { useTranslation } from "@/i18n";

type PanelProps = Pick<ComponentProps<typeof IssueFiltersPopover>, "state" | "onChange" | "activeFilterCount" | "agents" | "projects" | "labels" | "creators" | "currentUserId" | "enableRoutineTasksFilter" | "enableAgentCreatedVisibilityFilter" | "enableLiveRunsFilter"> & { onClear: () => void };

function FilterGroup({ title, searchLabel, query, onQueryChange, children, optionsKey }: { title: string; searchLabel?: string; query?: string; onQueryChange?: (value: string) => void; children: ReactNode; optionsKey: string }) {
  const headingId = useId();
  const { t } = useTranslation();
  return (
    <section className="task-filter-group" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      <div className="task-filter-group-body">
        {searchLabel ? <div className="task-filter-search"><Search aria-hidden /><Input aria-label={t("issueFilterPanel.searchAria", { defaultValue: "Search {{label}}", label: searchLabel })} placeholder={t("issueFilterPanel.searchPlaceholder", { defaultValue: "Search {{label}}...", label: searchLabel })} value={query} onChange={event => onQueryChange?.(event.target.value)} /></div> : null}
        <div className="task-filter-options" data-filter-options={optionsKey}>{children}</div>
      </div>
    </section>
  );
}

function FilterRow({ label, checked, onToggle, icon }: { label: string; checked: boolean; onToggle: () => void; icon?: ReactNode }) {
  return <label className="task-filter-option" data-marquee-surface><Checkbox aria-label={label} checked={checked} onCheckedChange={onToggle} />{icon ? <span className="task-filter-icon" aria-hidden>{icon}</span> : null}<TruncatedText className="task-filter-option-label">{label}</TruncatedText></label>;
}

/** The collection retains ownership of filter state. */
export function IssueFilterPanel({ state, onChange, activeFilterCount, agents = [], projects = [], labels = [], creators = [], currentUserId, onClear, enableRoutineTasksFilter, enableAgentCreatedVisibilityFilter, enableLiveRunsFilter = true }: PanelProps) {
  const { t } = useTranslation();
  const [queries, setQueries] = useState({ projects: "", creators: "", assignees: "", labels: "" });
  const search = (key: keyof typeof queries) => (value: string) => setQueries(current => ({ ...current, [key]: value }));
  const visibleProjects = searchIssueFilterOptions(projects, queries.projects, option => option.name);
  const visibleCreators = searchIssueFilterOptions(creators, queries.creators, option => `${option.label} ${option.searchText ?? ""}`);
  const assignees = [{ id: "__unassigned", name: t("issueFilterPanel.noAssignee", { defaultValue: "No assignee" }), icon: null }, ...(currentUserId ? [{ id: "__me", name: t("issueFilterPanel.me", { defaultValue: "Me" }), icon: <User /> }] : []), ...agents.map(agent => ({ ...agent, icon: null }))];
  const visibleAssignees = searchIssueFilterOptions(assignees, queries.assignees, option => option.name);
  const visibleLabels = searchIssueFilterOptions(labels, queries.labels, option => option.name);
  return <>
    <FlyoutHeader className="task-filters-header"><span>{t("issueFilterPanel.title", { defaultValue: "Filters" })}</span>{activeFilterCount ? <Button variant="ghost" onClick={() => { onClear(); setQueries({ projects: "", creators: "", assignees: "", labels: "" }); }}>{t("issueFilterPanel.clear", { defaultValue: "Clear" })}</Button> : null}</FlyoutHeader>
    <div className="task-filters-grid">
      <div className="task-filter-group">
        <FilterGroup title={t("issueFilterPanel.status", { defaultValue: "Status" })} optionsKey="statuses">
          {issueStatusOrder.map(status => <FilterRow key={status} label={issueFilterLabel(status)} checked={state.statuses.includes(status)} onToggle={() => onChange({ statuses: toggleIssueFilterValue(state.statuses, status) })} icon={<StatusIcon status={status} />} />)}
        </FilterGroup>
        {enableLiveRunsFilter || enableAgentCreatedVisibilityFilter || enableRoutineTasksFilter ? <FilterGroup title={t("issueFilterPanel.visibility", { defaultValue: "Visibility" })} optionsKey="visibility">
          {enableLiveRunsFilter ? <FilterRow label={t("issueFilterPanel.liveRunsOnly", { defaultValue: "Live runs only" })} checked={state.liveOnly === true} onToggle={() => onChange({ liveOnly: !state.liveOnly })} /> : null}
          {enableAgentCreatedVisibilityFilter ? <FilterRow label={t("issueFilterPanel.showAgentCreatedTasks", { defaultValue: "Show agent-created tasks" })} checked={state.showAgentCreatedTasks} onToggle={() => onChange({ showAgentCreatedTasks: !state.showAgentCreatedTasks })} /> : null}
          {enableRoutineTasksFilter ? <FilterRow label={t("issueFilterPanel.routineTasks", { defaultValue: "Routine tasks" })} checked={state.routineTasksOnly === true} onToggle={() => onChange({ routineTasksOnly: !state.routineTasksOnly })} /> : null}
        </FilterGroup> : null}
      </div>
      <FilterGroup title={t("issueFilterPanel.project", { defaultValue: "Project" })} optionsKey="projects" searchLabel={t("issueFilterPanel.searchProjects", { defaultValue: "projects" })} query={queries.projects} onQueryChange={search("projects")}>
        {visibleProjects.map(project => <FilterRow key={project.id} label={project.name} checked={state.projects.includes(project.id)} onToggle={() => onChange({ projects: toggleIssueFilterValue(state.projects, project.id) })} />)}
        {!visibleProjects.length ? <p className="task-filter-empty">{queries.projects
          ? t("issueFilterPanel.noProjectsMatch", { defaultValue: "No projects match." })
          : t("issueFilterPanel.noProjectsAvailable", { defaultValue: "No projects available." })}</p> : null}
      </FilterGroup>
      <FilterGroup title={t("issueFilterPanel.creator", { defaultValue: "Creator" })} optionsKey="creators" searchLabel={t("issueFilterPanel.searchCreators", { defaultValue: "creators" })} query={queries.creators} onQueryChange={search("creators")}>
        {visibleCreators.map(creator => <FilterRow key={creator.id} label={creator.label} checked={state.creators.includes(creator.id)} onToggle={() => onChange({ creators: toggleIssueFilterValue(state.creators, creator.id) })} icon={creator.kind === "agent" ? <Bot /> : <User />} />)}
        {!visibleCreators.length ? <p className="task-filter-empty">{queries.creators
          ? t("issueFilterPanel.noCreatorsMatch", { defaultValue: "No creators match." })
          : t("issueFilterPanel.noCreatorsAvailable", { defaultValue: "No creators available." })}</p> : null}
      </FilterGroup>
      <FilterGroup title={t("issueFilterPanel.assignee", { defaultValue: "Assignee" })} optionsKey="responsible" searchLabel={t("issueFilterPanel.searchAssignees", { defaultValue: "assignees" })} query={queries.assignees} onQueryChange={search("assignees")}>
        {visibleAssignees.map(assignee => <FilterRow key={assignee.id} label={assignee.name} checked={state.assignees.includes(assignee.id)} onToggle={() => onChange({ assignees: toggleIssueFilterValue(state.assignees, assignee.id) })} icon={assignee.icon} />)}
        {!visibleAssignees.length ? <p className="task-filter-empty">{t("issueFilterPanel.noAssigneesMatch", { defaultValue: "No assignees match." })}</p> : null}
      </FilterGroup>
      <FilterGroup title={t("issueFilterPanel.label", { defaultValue: "Label" })} optionsKey="labels" searchLabel={t("issueFilterPanel.searchLabels", { defaultValue: "labels" })} query={queries.labels} onQueryChange={search("labels")}>
        {visibleLabels.map(label => <FilterRow key={label.id} label={label.name} checked={state.labels.includes(label.id)} onToggle={() => onChange({ labels: toggleIssueFilterValue(state.labels, label.id) })} icon={<span className="task-filter-label-dot" style={{ "--task-filter-label-color": label.color } as CSSProperties} />} />)}
        {!visibleLabels.length ? <p className="task-filter-empty">{queries.labels
          ? t("issueFilterPanel.noLabelsMatch", { defaultValue: "No labels match." })
          : t("issueFilterPanel.noLabelsAvailable", { defaultValue: "No labels available." })}</p> : null}
      </FilterGroup>
    </div>
  </>;
}
