import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExecutionWorkspace } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { Loader2 } from "lucide-react";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { describeError } from "../api/errors";
import { useToastActions } from "../context/ToastContext";
import { useTranslation } from "../i18n";
import { queryKeys } from "../lib/queryKeys";
import { formatDateTime, issueUrl } from "../lib/utils";
import { Button } from "./ui/button";
import { QueryErrorState, useQueryView } from "./QueryView";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type ExecutionWorkspaceCloseDialogProps = {
  workspaceId: string;
  workspaceName: string;
  currentStatus: ExecutionWorkspace["status"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed?: (workspace: ExecutionWorkspace) => void;
};

function readinessTone(state: "ready" | "ready_with_warnings" | "blocked") {
  if (state === "blocked") {
    return "border-destructive/30 bg-destructive/5 text-destructive";
  }
  if (state === "ready_with_warnings") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

export function ExecutionWorkspaceCloseDialog({
  workspaceId,
  workspaceName,
  currentStatus,
  open,
  onOpenChange,
  onClosed,
}: ExecutionWorkspaceCloseDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const actionLabel = currentStatus === "cleanup_failed"
    ? t("workspaceCloseDialog.retryClose", { defaultValue: "Retry close" })
    : t("workspaceCloseDialog.closeWorkspace", { defaultValue: "Close workspace" });

  const readinessQuery = useQuery({
    queryKey: queryKeys.executionWorkspaces.closeReadiness(workspaceId),
    queryFn: () => executionWorkspacesApi.getCloseReadiness(workspaceId),
    enabled: open,
  });
  // Read close readiness through the shared view: cached readiness stays
  // usable during a transient refetch failure,and a no-data failure shows
  // readable copy with Retry.
  const readinessView = useQueryView(readinessQuery);

  const closeWorkspace = useMutation({
    mutationFn: () => executionWorkspacesApi.update(workspaceId, { status: "archived" }),
    onSuccess: (workspace) => {
      queryClient.setQueryData(queryKeys.executionWorkspaces.detail(workspace.id), workspace);
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.overview(workspace.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.closeReadiness(workspace.id) });
      pushToast({
        title: currentStatus === "cleanup_failed"
          ? t("workspaceCloseDialog.closeRetried", { defaultValue: "Workspace close retried" })
          : t("workspaceCloseDialog.closed", { defaultValue: "Workspace closed" }),
        tone: "success",
      });
      onOpenChange(false);
      onClosed?.(workspace);
    },
    onError: (error) => {
      pushToast({
        title: t("workspaceCloseDialog.closeFailed", { defaultValue: "Failed to close workspace" }),
        body: describeError(error).body,
        tone: "error",
      });
    },
  });

  const readiness = readinessQuery.data ?? null;
  const blockingIssues = readiness?.linkedIssues.filter((issue) => !issue.isTerminal) ?? [];
  const otherLinkedIssues = readiness?.linkedIssues.filter((issue) => issue.isTerminal) ?? [];
  const confirmDisabled =
    currentStatus === "archived" ||
    closeWorkspace.isPending ||
    readinessQuery.isLoading ||
    readiness == null ||
    readiness.state === "blocked";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!closeWorkspace.isPending) onOpenChange(nextOpen);
    }}>
      <DialogContent className="max-h-(--sz-85vh) overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription className="break-words">
            {t("workspaceCloseDialog.archivePrefix", { defaultValue: "Archive " })}<span className="font-medium text-foreground">{workspaceName}</span>{t("workspaceCloseDialog.archiveSuffix", { defaultValue: " and clean up any owned workspace artifacts. Paperclip keeps the workspace record and task history, but removes it from active workspace views." })}
          </DialogDescription>
        </DialogHeader>

        {(readinessView.kind === "loading" || readinessView.kind === "reconnecting") ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("workspaceCloseDialog.checking", { defaultValue: "Checking whether this workspace is safe to close..." })}
          </div>
        ) : readinessView.kind === "error" ? (
          <QueryErrorState
            error={readinessView.error}
            action="inspect workspace close readiness"
            onRetry={readinessView.retry}
            retrying={readinessView.isFetching}
          />
        ) : readiness ? (
          <div className="space-y-4">
            <div className={`rounded-xl border px-4 py-3 text-sm ${readinessTone(readiness.state)}`}>
              <div className="font-medium">
                {readiness.state === "blocked"
                  ? t("workspaceCloseDialog.stateBlocked", { defaultValue: "Close is blocked" })
                  : readiness.state === "ready_with_warnings"
                    ? t("workspaceCloseDialog.stateWarnings", { defaultValue: "Close is allowed with warnings" })
                    : t("workspaceCloseDialog.stateReady", { defaultValue: "Close is ready" })}
              </div>
              <div className="mt-1 text-xs opacity-80">
                {readiness.isSharedWorkspace
                  ? t("workspaceCloseDialog.sharedWorkspace", { defaultValue: "This is a shared workspace session. Archiving it removes this session record but keeps the underlying project workspace." })
                  : readiness.git?.workspacePath && readiness.git.repoRoot && readiness.git.workspacePath !== readiness.git.repoRoot
                    ? t("workspaceCloseDialog.ownCheckout", { defaultValue: "This execution workspace has its own checkout path and can be archived independently." })
                    : readiness.isProjectPrimaryWorkspace
                      ? t("workspaceCloseDialog.primaryWorkspace", { defaultValue: "This execution workspace currently points at the project's primary workspace path." })
                      : t("workspaceCloseDialog.disposable", { defaultValue: "This workspace is disposable and can be archived." })}
              </div>
            </div>

            {blockingIssues.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("workspaceCloseDialog.blockingTasks", { defaultValue: "Blocking tasks" })}</h3>
                <div className="space-y-2">
                  {blockingIssues.map((issue) => (
                    <div key={issue.id} className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <Link to={issueUrl(issue)} className="min-w-0 break-words font-medium hover:underline">
                          {issue.identifier ?? issue.id} · {issue.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{issue.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {readiness.blockingReasons.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("workspaceCloseDialog.blockingReasons", { defaultValue: "Blocking reasons" })}</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {readiness.blockingReasons.map((reason) => (
                    <li key={reason} className="break-words rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive">
                      {reason}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {readiness.warnings.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("workspaceCloseDialog.warnings", { defaultValue: "Warnings" })}</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {readiness.warnings.map((warning) => (
                    <li key={warning} className="break-words rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                      {warning}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {readiness.git ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("workspaceCloseDialog.gitStatus", { defaultValue: "Git status" })}</h3>
                <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("workspaceCloseDialog.branch", { defaultValue: "Branch" })}</div>
                      <div className="font-mono text-xs">{readiness.git.branchName ?? t("workspaceCloseDialog.unknown", { defaultValue: "Unknown" })}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("workspaceCloseDialog.baseRef", { defaultValue: "Base ref" })}</div>
                      <div className="font-mono text-xs">{readiness.git.baseRef ?? t("workspaceCloseDialog.notSet", { defaultValue: "Not set" })}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("workspaceCloseDialog.mergedIntoBase", { defaultValue: "Merged into base" })}</div>
                      <div>{readiness.git.isMergedIntoBase == null ? t("workspaceCloseDialog.unknown", { defaultValue: "Unknown" }) : readiness.git.isMergedIntoBase ? t("workspaceCloseDialog.yes", { defaultValue: "Yes" }) : t("workspaceCloseDialog.no", { defaultValue: "No" })}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("workspaceCloseDialog.aheadBehind", { defaultValue: "Ahead / behind" })}</div>
                      <div>
                        {(readiness.git.aheadCount ?? 0).toString()} / {(readiness.git.behindCount ?? 0).toString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("workspaceCloseDialog.dirtyTrackedFiles", { defaultValue: "Dirty tracked files" })}</div>
                      <div>{readiness.git.dirtyEntryCount}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("workspaceCloseDialog.untrackedFiles", { defaultValue: "Untracked files" })}</div>
                      <div>{readiness.git.untrackedEntryCount}</div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {otherLinkedIssues.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("workspaceCloseDialog.otherLinkedTasks", { defaultValue: "Other linked tasks" })}</h3>
                <div className="space-y-2">
                  {otherLinkedIssues.map((issue) => (
                    <div key={issue.id} className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <Link to={issueUrl(issue)} className="min-w-0 break-words font-medium hover:underline">
                          {issue.identifier ?? issue.id} · {issue.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{issue.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {readiness.runtimeServices.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("workspaceCloseDialog.attachedServices", { defaultValue: "Attached runtime services" })}</h3>
                <div className="space-y-2">
                  {readiness.runtimeServices.map((service) => (
                    <div key={service.id} className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{service.serviceName}</span>
                        <span className="text-xs text-muted-foreground">{service.status} · {service.lifecycle}</span>
                      </div>
                      {/*
                        The last fallback used to print the service working
                        directory, a path on the execution host. The dialog has
                        no instance-policy context of its own, so it drops the
                        path outright and falls back to a neutral line.
                      */}
                      <div className="mt-1 break-words text-xs text-muted-foreground">
                        {service.url ?? service.command ?? t("workspaceCloseDialog.noDetails", { defaultValue: "No additional details" })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("workspaceCloseDialog.cleanupActions", { defaultValue: "Cleanup actions" })}</h3>
              <div className="space-y-2">
                {readiness.plannedActions.map((action, index) => (
                  <div key={`${action.kind}-${index}`} className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                    <div className="font-medium">{action.label}</div>
                    <div className="mt-1 break-words text-muted-foreground">{action.description}</div>
                    {action.command ? (
                      <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-background px-3 py-2 font-mono text-xs text-foreground">
                        {action.command}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            {currentStatus === "cleanup_failed" ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
                {t("workspaceCloseDialog.previousCleanupFailed", { defaultValue: "Cleanup previously failed on this workspace. Retrying close will rerun the cleanup flow and update the workspace status if it succeeds." })}
              </div>
            ) : null}

            {currentStatus === "archived" ? (
              <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                {t("workspaceCloseDialog.alreadyArchived", { defaultValue: "This workspace is already archived." })}
              </div>
            ) : null}

            {readiness.git?.repoRoot ? (
              <div className="break-words text-xs text-muted-foreground">
                {t("workspaceCloseDialog.repoRoot", { defaultValue: "Repo root: " })}<span className="font-mono break-all">{readiness.git.repoRoot}</span>
                {readiness.git.workspacePath ? (
                  <>
                    {" · "}{t("workspaceCloseDialog.workspacePath", { defaultValue: "Workspace path: " })}<span className="font-mono break-all">{readiness.git.workspacePath}</span>
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="text-xs text-muted-foreground">
              {t("workspaceCloseDialog.lastChecked", { defaultValue: "Last checked {{date}}", date: formatDateTime(new Date(readinessQuery.dataUpdatedAt)) })}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={closeWorkspace.isPending}
          >
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            variant={currentStatus === "cleanup_failed" ? "default" : "destructive"}
            onClick={() => closeWorkspace.mutate()}
            disabled={confirmDisabled}
          >
            {closeWorkspace.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
