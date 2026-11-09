import { ArrowUpDown, Check, Plus } from "lucide-react";
import { ToolbarSearch } from "./ToolbarSearch";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useTranslation } from "../i18n";

export type ProjectSortField = "name" | "updated" | "created" | "targetDate";
export type ProjectSortDir = "asc" | "desc";

const PROJECT_SORT_OPTIONS: Array<{ field: ProjectSortField; labelKey: string; label: string }> = [
  { field: "name", labelKey: "projectsToolbar.sortName", label: "Name" },
  { field: "updated", labelKey: "projectsToolbar.sortUpdated", label: "Updated" },
  { field: "created", labelKey: "projectsToolbar.sortCreated", label: "Created" },
  { field: "targetDate", labelKey: "projectsToolbar.sortTargetDate", label: "Target date" },
];

/** Canonical project search, sorting and creation controls. State stays with the page. */
export function ProjectsToolbar({ query, onQueryChange, sortField, sortDir, onSortChange, onNewProject: openNewProject }: {
  query: string;
  onQueryChange: (value: string) => void;
  sortField: ProjectSortField;
  sortDir: ProjectSortDir;
  onSortChange: (field: ProjectSortField, direction: ProjectSortDir) => void;
  onNewProject: () => void;
}) {
  const { t } = useTranslation();
  const sortOption = PROJECT_SORT_OPTIONS.find(option => option.field === sortField);
  const sortLabel = sortOption
    ? t(sortOption.labelKey, { defaultValue: sortOption.label })
    : t("projectsToolbar.sortName", { defaultValue: "Name" });
  return <div data-canonical-toolbar="projects" role="toolbar" aria-label={t("projectsToolbar.controlsAria", { defaultValue: "Projects controls" })} className="flex flex-wrap items-center gap-4">
    <ToolbarSearch query={query} onQueryChange={onQueryChange} label={t("allowedProjectsEditor.searchProjects", { defaultValue: "Search projects" })} placeholder={t("searchFilters.searchProjects", { defaultValue: "Search projects…" })} />
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={t("routinesPage.sort", { defaultValue: "Sort" })}>
          <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
          <span>{t("projectsToolbar.sortPrefix", { defaultValue: "Sort: {{label}}", label: sortLabel })}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-0">
        <div className="p-2 space-y-0.5">
          {PROJECT_SORT_OPTIONS.map((option) => (
            <button
              key={option.field}
              type="button"
              className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${
                sortField === option.field
                  ? "bg-accent/50 text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
              onClick={() => {
                onSortChange(option.field, sortField === option.field
                  ? (sortDir === "asc" ? "desc" : "asc")
                  : (option.field === "name" || option.field === "targetDate" ? "asc" : "desc"));
              }}
            >
              <span>{t(option.labelKey, { defaultValue: option.label })}</span>
              {sortField === option.field ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3 w-3" />
                  {sortDir === "asc" ? t("routinesPage.sortAsc", { defaultValue: "Asc" }) : t("routinesPage.sortDesc", { defaultValue: "Desc" })}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
    <div className="design-toolbar-actions">
      <Button size="sm" variant="outline" data-toolbar-primary onClick={openNewProject}>
          <Plus className="h-4 w-4 mr-1" />
          {t("projects.add", { defaultValue: "Create project" })}
      </Button>
    </div>
  </div>;
}
