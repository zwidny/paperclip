import { useState } from "react";
import { ArrowUpDown, Check, Columns3, Filter, Layers, Plus } from "lucide-react";
import { Link } from "@/lib/router";
import { defaultRoutineView, routineColumns, routineFilterKeys, type RoutineColumn, type RoutineFilterKey, type RoutineViewState, type RoutineGroupBy, type RoutineSortField, type RoutineSortDir } from "@/lib/routine-list-view";
import { ToolbarSearch } from "./ToolbarSearch";
import { FilterGroup, FilterRow } from "./CollectionFilterOptions";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useTranslation } from "../i18n";
import { FlyoutAppearanceProvider, FlyoutHeader } from "./ui/flyout";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
export type { RoutineGroupBy, RoutineSortField, RoutineSortDir } from "@/lib/routine-list-view";
export type RoutineFilterOptions = Partial<Record<RoutineFilterKey, { id: string; name: string }[]>>;

export function RoutinesToolbar({ query, onQueryChange, sortField, sortDir, groupBy, onSortChange, onGroupChange, onNewFolder, onCreateRoutine, tasksHref, filters = defaultRoutineView, filterOptions = {}, onFiltersChange, columns = defaultRoutineView.columns, onColumnsChange, showListControls = true }: {
  showListControls?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  sortField: RoutineSortField;
  sortDir: RoutineSortDir;
  groupBy: RoutineGroupBy;
  onSortChange: (field: RoutineSortField, direction: RoutineSortDir) => void;
  onGroupChange: (value: RoutineGroupBy) => void;
  onNewFolder?: () => void;
  onCreateRoutine: () => void;
  tasksHref?: string;
  filters?: Pick<RoutineViewState, RoutineFilterKey>;
  filterOptions?: RoutineFilterOptions;
  onFiltersChange?: (patch: Partial<RoutineViewState>) => void;
  columns?: RoutineColumn[];
  onColumnsChange?: (columns: RoutineColumn[]) => void;
}) {
  const { t } = useTranslation();
  const [optionQueries, setOptionQueries] = useState<Record<string, string>>({});
  const activeFilters = routineFilterKeys.reduce((count, key) => count + filters[key].length, 0);
  return <FlyoutAppearanceProvider appearance="refreshed"><div data-canonical-toolbar="routines" role="toolbar" aria-label={t("routinesToolbar.controls", { defaultValue: "Routines controls" })} className="design-page-toolbar">
    <Button variant="outline" className="design-toolbar-button" data-toolbar-primary onClick={onCreateRoutine}><Plus aria-hidden />{t("routinesToolbar.newRoutine", { defaultValue: "New routine" })}</Button>
    <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
      {showListControls ? <>
      <ToolbarSearch query={query} onQueryChange={onQueryChange} label={t("routinesToolbar.searchLabel", { defaultValue: "Search routines" })} placeholder={t("routinesToolbar.searchPlaceholder", { defaultValue: "Search routines…" })} />
      <Popover>
        <PopoverTrigger asChild><Button variant="outline" className="design-toolbar-button design-toolbar-icon" title={t("routinesToolbar.sort", { defaultValue: "Sort" })} aria-label={t("routinesToolbar.sortAria", { defaultValue: "Sort routines" })}><ArrowUpDown aria-hidden /></Button></PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-0">
          <FlyoutHeader>{t("routinesToolbar.sort", { defaultValue: "Sort" })}</FlyoutHeader>
          <div className="p-2 space-y-0.5">
            {([
              ["updated", t("routinesToolbar.updated", { defaultValue: "Updated" })],
              ["created", t("routinesToolbar.created", { defaultValue: "Created" })],
              ["lastRun", t("routinesToolbar.lastRun", { defaultValue: "Last run" })],
              ["title", t("routinesToolbar.title", { defaultValue: "Title" })],
            ] as const).map(([field, label]) => (
              <button type="button" key={field} className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${sortField === field ? "bg-accent/50 text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
                onClick={() => onSortChange(field, sortField === field ? sortDir === "asc" ? "desc" : "asc" : field === "title" ? "asc" : "desc")}>
                <span>{label}</span>{sortField === field ? <span className="text-xs text-muted-foreground">{sortDir === "asc" ? t("routinesToolbar.asc", { defaultValue: "Asc" }) : t("routinesToolbar.desc", { defaultValue: "Desc" })}</span> : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild><Button variant="outline" className="design-toolbar-button design-toolbar-icon" title={t("routinesToolbar.filter", { defaultValue: "Filter" })} aria-label={activeFilters ? t("routinesToolbar.filterAriaActive", { count: activeFilters, defaultValue: "Filter routines ({{count}})" }) : t("routinesToolbar.filterAria", { defaultValue: "Filter routines" })} data-active={activeFilters > 0}><Filter aria-hidden /></Button></PopoverTrigger>
        <PopoverContent align="end" className="task-filters-popover">
          <FlyoutHeader className="task-filters-header"><span>{activeFilters ? t("routinesToolbar.filtersActive", { count: activeFilters, defaultValue: "Filters ({{count}})" }) : t("routinesToolbar.filters", { defaultValue: "Filters" })}</span>{activeFilters ? <Button variant="ghost" onClick={() => onFiltersChange?.(Object.fromEntries(routineFilterKeys.map(key => [key, []])))}>{t("routinesToolbar.clear", { defaultValue: "Clear" })}</Button> : null}</FlyoutHeader>
          <div className="task-filters-grid">
            {([
              ["projects", t("routinesToolbar.project", { defaultValue: "Project" })],
              ["agents", t("routinesToolbar.agent", { defaultValue: "Agent" })],
              ["statuses", t("routinesToolbar.enabled", { defaultValue: "Enabled" })],
              ["responsibleUsers", t("routinesToolbar.responsibleUser", { defaultValue: "Responsible user" })],
              ["origins", t("routinesToolbar.source", { defaultValue: "Source" })],
            ] as const).map(([key, title]) => {
              const selected = new Set(filters[key]);
              const options = filterOptions[key] ?? [];
              const visible = options.filter(option => option.name.toLowerCase().includes((optionQueries[key] ?? "").toLowerCase()));
              return <FilterGroup key={key} title={title} optionsKey={key} searchLabel={options.length > 6 ? title.toLowerCase() : undefined} query={optionQueries[key] ?? ""} onQueryChange={value => setOptionQueries(current => ({ ...current, [key]: value }))}>
                {visible.map(option => <FilterRow key={option.id} label={option.name} checked={selected.has(option.id)} onToggle={() => onFiltersChange?.({ [key]: selected.has(option.id) ? filters[key].filter(value => value !== option.id) : [...filters[key], option.id] })} />)}
                {!visible.length ? <p className="text-xs text-muted-foreground">{t("routinesToolbar.noOptions", { defaultValue: "No options" })}</p> : null}
              </FilterGroup>;
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild><Button variant="outline" className="design-toolbar-button design-toolbar-icon" title={t("routinesToolbar.group", { defaultValue: "Group" })} aria-label={t("routinesToolbar.groupAria", { defaultValue: "Group routines" })}><Layers aria-hidden /></Button></PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-0"><FlyoutHeader>{t("routinesToolbar.group", { defaultValue: "Group" })}</FlyoutHeader><div className="p-2 space-y-0.5">
          {([
            ["folder", t("routinesToolbar.folder", { defaultValue: "Folder" })],
            ["project", t("routinesToolbar.project", { defaultValue: "Project" })],
            ["assignee", t("routinesToolbar.agent", { defaultValue: "Agent" })],
            ["none", t("routinesToolbar.none", { defaultValue: "None" })],
          ] as const).map(([value, label]) => <button type="button" key={value} className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${groupBy === value ? "bg-accent/50 text-foreground" : "text-muted-foreground hover:bg-accent/50"}`} onClick={() => onGroupChange(value)}><span>{label}</span>{groupBy === value ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}</button>)}
          {onNewFolder ? <Button variant="ghost" size="sm" onClick={onNewFolder}><Plus className="h-3.5 w-3.5" />{t("routinesToolbar.newFolder", { defaultValue: "New folder" })}</Button> : null}
        </div></PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" className="design-toolbar-button design-toolbar-icon" title={t("routinesToolbar.columns", { defaultValue: "Columns" })} aria-label={t("routinesToolbar.columnsAria", { defaultValue: "Routine columns" })}><Columns3 aria-hidden /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuLabel>{t("routinesToolbar.columns", { defaultValue: "Columns" })}</DropdownMenuLabel>
          {routineColumns.map(column => <DropdownMenuCheckboxItem key={column.id} checked={columns.includes(column.id)} onSelect={event => event.preventDefault()} onCheckedChange={checked => onColumnsChange?.(checked ? routineColumns.filter(item => item.id === column.id || columns.includes(item.id)).map(item => item.id) : columns.filter(id => id !== column.id))}>{column.label}</DropdownMenuCheckboxItem>)}
          <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onColumnsChange?.([...defaultRoutineView.columns])}>{t("routinesToolbar.resetColumns", { defaultValue: "Reset columns" })}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </> : null}
      {tasksHref ? <Button variant="outline" className="design-toolbar-button" asChild><Link to={tasksHref}>{t("routinesToolbar.viewAllRuns", { defaultValue: "View all tasks" })}</Link></Button> : null}
    </div>
  </div></FlyoutAppearanceProvider>;
}
