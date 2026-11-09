import type { ComponentProps, ReactNode, Ref } from "react";
import { ChevronDown, CirclePlus, Columns3, List, ListTree } from "lucide-react";
import { IssueFiltersPopover } from "./IssueFiltersPopover";
import { Button } from "./ui/button";
import { ToolbarSearch } from "./ToolbarSearch";
import { FlyoutHeader, FlyoutOptions } from "./ui/flyout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { taskListViews as views, type TaskListView } from "@/lib/task-list-views";
import { useTranslation } from "../i18n";

/** Canonical proposed task toolbar; review under Components / Toolbars / Tasks. */
export function TaskListToolbar({ view, onViewChange, viewOptions = views, viewControl, query, onQueryChange, searchRef, layout, onLayoutChange, allExpanded, onToggleExpanded, onNewTask, filters }: {
  view: TaskListView;
  onViewChange: (view: TaskListView) => void;
  viewOptions?: readonly { value: TaskListView; label: string }[];
  viewControl?: ReactNode;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef?: Ref<HTMLInputElement>;
  layout: "list" | "board";
  onLayoutChange: (layout: "list" | "board") => void;
  allExpanded: boolean;
  onToggleExpanded: () => void;
  onNewTask: () => void;
  filters: ComponentProps<typeof IssueFiltersPopover>;
}) {
  const { t } = useTranslation();
  const viewLabel = (option: { value: TaskListView; label: string }) => t(`tasks.view.${option.value}`, { defaultValue: option.label });
  return (
    <div data-canonical-toolbar="tasks" className="design-page-toolbar" role="toolbar" aria-label={t("tasks.toolbar.controls", { defaultValue: "Task list controls" })}>
      {viewControl ?? <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" className="design-toolbar-button design-view-trigger" aria-label={t("tasks.toolbar.currentView", { defaultValue: "Task view: {{view}}", view: viewLabel(viewOptions.find(option => option.value === view)!) })}>{viewLabel(viewOptions.find(option => option.value === view)!)}<ChevronDown aria-hidden /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="task-list-options" aria-label={t("tasks.toolbar.views", { defaultValue: "Task views" })}>
          <DropdownMenuLabel asChild><FlyoutHeader className="task-list-options-heading">{t("tasks.toolbar.viewsHeading", { defaultValue: "Views" })}</FlyoutHeader></DropdownMenuLabel>
          <DropdownMenuRadioGroup asChild value={view} onValueChange={value => onViewChange(value as TaskListView)}><FlyoutOptions className="task-list-options-items">
            {viewOptions.map(option => <DropdownMenuRadioItem className="task-list-options-item" key={option.value} value={option.value}>{viewLabel(option)}</DropdownMenuRadioItem>)}
          </FlyoutOptions></DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>}
      <ToolbarSearch query={query} onQueryChange={onQueryChange} inputRef={searchRef} label={t("tasks.search.label", { defaultValue: "Search tasks" })} placeholder={t("tasks.search.placeholder", { defaultValue: "Search tasks…" })} />
      <div className="design-view-toggle" role="group" aria-label={t("tasks.toolbar.layout", { defaultValue: "Task layout" })}>
        {[{ value: "list", label: t("tasks.toolbar.listView", { defaultValue: "List view" }), icon: List }, { value: "board", label: t("tasks.toolbar.boardView", { defaultValue: "Board view" }), icon: Columns3 }].map(({ value, label, icon: Icon }) => (
          <Tooltip key={value}><TooltipTrigger asChild><Button variant="ghost" className="design-toolbar-button design-toolbar-icon" aria-label={label} aria-pressed={layout === value} onClick={() => onLayoutChange(value as "list" | "board")}><Icon aria-hidden /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
        ))}
      </div>
      <div className="design-toolbar-actions">
        <Tooltip><TooltipTrigger asChild><Button variant="outline" className="design-toolbar-button design-toolbar-icon" disabled={layout !== "list"} aria-label={allExpanded ? t("tasks.toolbar.collapseAll", { defaultValue: "Collapse all tasks" }) : t("tasks.toolbar.expandAll", { defaultValue: "Expand all tasks" })} onClick={onToggleExpanded}><ListTree aria-hidden /></Button></TooltipTrigger><TooltipContent>{allExpanded ? t("tasks.toolbar.collapseAll", { defaultValue: "Collapse all tasks" }) : t("tasks.toolbar.expandAll", { defaultValue: "Expand all tasks" })}</TooltipContent></Tooltip>
        <div className="design-toolbar-filter"><IssueFiltersPopover {...filters} presentation="refreshed" buttonVariant="outline" iconOnly enableExternalObjectFilters={false} /></div>
        <Button className="design-toolbar-button design-new-task" onClick={onNewTask}><CirclePlus aria-hidden />{t("nav.newTask", { defaultValue: "New Task" })}</Button>
      </div>
    </div>
  );
}
