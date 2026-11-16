import { useMemo, type CSSProperties } from "react";
import { Folder, GitBranch, GitBranchPlus, Monitor } from "lucide-react";
import type { ExecutionWorkspaceSummary } from "@paperclipai/shared";
import { SearchableSelect, type SearchableSelectOption } from "@/components/SearchableSelect";
import { orderReusableExecutionWorkspaces } from "@/lib/reusable-execution-workspaces";
import { useTranslation } from "@/i18n";

interface WorktreeOption extends SearchableSelectOption {
  mode: string;
  workspaceId?: string;
  description: string;
}

interface ComposerWorktreePickerProps {
  mode: string;
  workspaceId: string;
  workspaces: readonly ExecutionWorkspaceSummary[];
  onChange: (mode: string, workspaceId: string) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  disabled?: boolean;
  mobile?: boolean;
  contentStyle?: CSSProperties;
  selectedWorkspaceLabel?: string;
}

function buildModeOptions(t: ReturnType<typeof useTranslation>["t"]): WorktreeOption[] {
  return [
    { key: "isolated_workspace", value: "isolated_workspace", mode: "isolated_workspace", label: t("composer.newWorktree", { defaultValue: "New worktree" }), description: t("composer.newWorktreeDetail", { defaultValue: "Start in an isolated checkout." }) },
    { key: "shared_workspace", value: "shared_workspace", mode: "shared_workspace", label: t("composer.projectWorkspace", { defaultValue: "Project workspace" }), description: t("composer.projectWorkspaceDetail", { defaultValue: "Use the project's shared checkout." }) },
    { key: "operator_branch", value: "operator_branch", mode: "operator_branch", label: t("composer.newBranch", { defaultValue: "New branch" }), description: t("composer.newBranchDetail", { defaultValue: "Create a branch in the project workspace." }) },
    { key: "agent_default", value: "agent_default", mode: "agent_default", label: t("composer.agentDefault", { defaultValue: "Agent default" }), description: t("composer.agentDefaultDetail", { defaultValue: "Let the agent choose its workspace." }) },
    { key: "inherit", value: "inherit", mode: "inherit", label: t("composer.projectDefault", { defaultValue: "Project default" }), description: t("composer.projectDefaultDetail", { defaultValue: "Use the project's worktree settings." }) },
  ];
}

/** Reuses the searchable selector and the existing workspace recency ordering. */
export function ComposerWorktreePicker({
  mode, workspaceId, workspaces, onChange, loading, error, onRetry,
  disabled, mobile, contentStyle, selectedWorkspaceLabel,
}: ComposerWorktreePickerProps) {
  const { t } = useTranslation();
  const modeOptions = useMemo(() => buildModeOptions(t), [t]);
  const groups = useMemo(() => [
    { id: "new", options: [modeOptions[0]!] },
    {
      id: "reuse", label: t("composer.reuseWorktree", { defaultValue: "Reuse a worktree" }),
      options: orderReusableExecutionWorkspaces(workspaces).map((workspace): WorktreeOption => ({
        key: `reuse:${workspace.id}`, value: `reuse:${workspace.id}`,
        workspaceId: workspace.id, mode: "reuse_existing", label: workspace.name,
        description: workspace.branchName ?? t("composer.existingWorkspace", { defaultValue: "Existing workspace" }),
        searchText: `${workspace.branchName ?? ""} ${workspace.id}`,
      })),
    },
    {
      id: "other", label: t("composer.otherOptions", { defaultValue: "Other options" }),
      options: modeOptions.filter((option) => option.mode === "shared_workspace"
        || (option.mode !== "isolated_workspace" && option.mode === mode)),
    },
  ], [mode, workspaces, modeOptions, t]);

  const value = mode === "reuse_existing" ? `reuse:${workspaceId}` : mode;
  return (
    <SearchableSelect<string, WorktreeOption>
      value={value}
      groups={groups}
      onValueChange={(_, option) => onChange(option.mode, option.workspaceId ?? "")}
      placeholder={t("composer.worktrees", { defaultValue: "Worktrees" })}
      triggerAriaLabel={t("composer.worktrees", { defaultValue: "Worktrees" })}
      mobileTitle={t("composer.worktrees", { defaultValue: "Worktrees" })}
      searchPlaceholder={t("composer.searchWorktrees", { defaultValue: "Search worktrees..." })}
      emptyMessage={t("composer.noMatchingWorktrees", { defaultValue: "No matching worktrees." })}
      disabled={disabled}
      modal={mobile}
      contentStyle={contentStyle}
      contentWidth="auto"
      className="min-w-0 flex-1 sm:flex-none sm:max-w-72"
      triggerClassName="h-8 gap-1.5 border-0 bg-transparent px-2 text-xs font-medium shadow-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-0"
      renderValue={(option) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <GitBranch className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            <span className="hidden text-muted-foreground sm:inline">{t("composer.worktreesPrefix", { defaultValue: "Worktrees · " })}</span>
            {option?.label ?? selectedWorkspaceLabel ?? t("composer.selectWorktree", { defaultValue: "Select worktree" })}
          </span>
        </span>
      )}
      renderOption={(option) => {
        const Icon = option.workspaceId ? GitBranch : option.mode === "isolated_workspace" ? GitBranchPlus
          : option.mode === "agent_default" ? Monitor : option.mode === "operator_branch" ? GitBranch : Folder;
        return (
          <>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{option.label}</span>
              <span className="truncate text-xs text-muted-foreground">{option.description}</span>
            </span>
          </>
        );
      }}
      listFooter={loading || error || workspaces.length === 0 ? (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground" role="status">
          {loading ? t("composer.loadingWorktrees", { defaultValue: "Loading existing worktrees…" }) : error ? (
            <span className="flex items-center justify-between gap-2">
              {t("composer.worktreesLoadFailed", { defaultValue: "Couldn't load worktrees." })}
              <button type="button" className="rounded px-2 py-1 text-foreground hover:bg-accent" onClick={onRetry}>{t("common.retry", { defaultValue: "Retry" })}</button>
            </span>
          ) : t("composer.noWorktreesYet", { defaultValue: "No existing worktrees yet. Choose New worktree to start one." })}
        </div>
      ) : undefined}
    />
  );
}
