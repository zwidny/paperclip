import { ToolbarSearch } from "@/components/ToolbarSearch";
import type { ReactNode } from "react";
import { ChevronDown, Compass, FolderSearch, Globe, Pencil, Plus, RefreshCw } from "lucide-react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { GithubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTranslation } from "../../i18n";

export type DiscoverySort = "agents" | "stars" | "forks" | "recent" | "alphabetical";

const DISCOVERY_SORT_LABELS: Record<DiscoverySort, string> = {
  agents: "Most agents",
  stars: "Most stars",
  forks: "Most forks",
  recent: "Recently updated",
  alphabetical: "Alphabetical",
};

const DISCOVERY_SORT_KEYS: Record<DiscoverySort, string> = {
  agents: "skillsToolbar.sortMostAgents",
  stars: "skillsToolbar.sortMostStars",
  forks: "skillsToolbar.sortMostForks",
  recent: "skillsToolbar.sortRecentlyUpdated",
  alphabetical: "skillsToolbar.sortAlphabetical",
};

const DISCOVERY_SORTS: DiscoverySort[] = ["agents", "stars", "forks", "recent", "alphabetical"];

export interface SkillsToolbarProps {
  viewTitle: string;
  viewDescription: string;
  searchLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  sort: DiscoverySort;
  onSortChange: (value: DiscoverySort) => void;
  availableSources: { value: string; label: string }[];
  sourceBadgeFilter: string;
  setSourceBadgeFilter: (value: string) => void;
  onScan: () => void;
  scanPending: boolean;
  onCreate: () => void;
  onBrowseDiscover: () => void;
  onImport: () => void;
  onImportFromProject: () => void;
  folderControl?: ReactNode;
  navigation?: ReactNode;
  onCreateFolder?: () => void;
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
}

/** Shared shipped Skills controls. Canonical proposal: Components / Toolbars / Skills. */
export function SkillsToolbar({ viewTitle, viewDescription, searchLabel, search, onSearchChange, sort, onSortChange, availableSources, sourceBadgeFilter, setSourceBadgeFilter, onScan, scanPending, onCreate, onBrowseDiscover, onImport, onImportFromProject, folderControl, onCreateFolder, selectMode, onToggleSelectMode, navigation }: SkillsToolbarProps) {
  const { t } = useTranslation();
  return (
    <div data-canonical-toolbar="skills" role="toolbar" aria-label={t("skillsToolbar.controls", { defaultValue: "Skills controls" })} className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="w-full">
        <h1 className="text-lg font-semibold text-foreground">{viewTitle}</h1>
        <p className="text-xs text-muted-foreground">{viewDescription}</p>
      </div>
      <ToolbarSearch query={search} onQueryChange={onSearchChange} label={searchLabel} placeholder={t("skillsToolbar.searchPlaceholder", { defaultValue: "{{label}}…", label: searchLabel })} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <span className="text-muted-foreground">{t("skillsToolbar.sort", { defaultValue: "Sort" })}</span>
            <span>{t(DISCOVERY_SORT_KEYS[sort], { defaultValue: DISCOVERY_SORT_LABELS[sort] })}</span>
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onSortChange(value as DiscoverySort)}>
            {DISCOVERY_SORTS.map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {t(DISCOVERY_SORT_KEYS[option], { defaultValue: DISCOVERY_SORT_LABELS[option] })}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {availableSources.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <span className="text-muted-foreground">{t("skillsToolbar.source", { defaultValue: "Source" })}</span>
              <span>
                {sourceBadgeFilter === "all"
                  ? t("skillsToolbar.all", { defaultValue: "All" })
                  : availableSources.find((source) => source.value === sourceBadgeFilter)?.label ?? t("skillsToolbar.all", { defaultValue: "All" })}
              </span>
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sourceBadgeFilter} onValueChange={setSourceBadgeFilter}>
              <DropdownMenuRadioItem value="all">{t("skillsToolbar.allSources", { defaultValue: "All sources" })}</DropdownMenuRadioItem>
              {availableSources.map((source) => (
                <DropdownMenuRadioItem key={source.value} value={source.value}>
                  {source.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onScan()}
        disabled={scanPending}
        aria-label={t("skillsToolbar.scanAria", { defaultValue: "Scan project workspaces for skills" })}
        title={t("skillsToolbar.scanAria", { defaultValue: "Scan project workspaces for skills" })}
      >
        <RefreshCw className={cn("h-4 w-4", scanPending && "animate-spin")} />
      </Button>
      {folderControl}
      {onCreateFolder ? (
        <Button variant="outline" size="sm" onClick={onCreateFolder}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("skillsToolbar.newFolder", { defaultValue: "New folder" })}
        </Button>
      ) : null}
      {onToggleSelectMode ? (
        <Button variant="outline" size="sm" aria-pressed={selectMode} onClick={onToggleSelectMode}>
          {selectMode ? t("skillsToolbar.done", { defaultValue: "Done" }) : t("skillsToolbar.select", { defaultValue: "Select" })}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="default" data-toolbar-primary>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("skillsToolbar.new", { defaultValue: "New" })}
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onCreate}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("skillsToolbar.createSkill", { defaultValue: "Create new skill" })}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onBrowseDiscover}>
            <Compass className="mr-2 h-4 w-4" />
            {t("skillsToolbar.discoverSkills", { defaultValue: "Discover skills" })}
          </DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/skills/sources/new"><GithubIcon className="mr-2 h-4 w-4" />{t("skillsToolbar.importFromGithub", { defaultValue: "Import from GitHub" })}</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/skills/sources">{t("skillsToolbar.manageSources", { defaultValue: "Manage sources" })}</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={onImport}>
            <Globe className="mr-2 h-4 w-4" />
            {t("skillsToolbar.importFromPath", { defaultValue: "Import from path or URL" })}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onImportFromProject}>
            <FolderSearch className="mr-2 h-4 w-4" />
            {t("skillsToolbar.importFromProject", { defaultValue: "Import skills from project" })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {navigation ? <div className="w-full">{navigation}</div> : null}
    </div>
  );
}
