import { useQueryView } from "@/components/QueryView";
import { useMemo, useState } from "react";
import { useCoordinatorChatTaskHandoffs } from "./CoordinatorChatTaskHandoffs";
import { CoordinatorCreatedTaskLink } from "./CoordinatorTaskCommitment";
import { ToolbarSearch } from "@/components/ToolbarSearch";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../i18n";

/** The task list is source-conversation scoped, independent of reassignment. */
export function CoordinatorConversationTasksPanel({ conversationIssueId }: { conversationIssueId: string }) {
  const { t } = useTranslation();
  const tasks = useCoordinatorChatTaskHandoffs(conversationIssueId);
  const tasksView = useQueryView(tasks);
  const waiting = ["loading", "reconnecting"].includes(tasksView.kind);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return tasks.handoffs.filter(task => (!status || task.status === status) && (!needle || `${task.identifier ?? ""} ${task.title}`.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : (sort === "oldest" ? 1 : -1) * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
  }, [tasks.handoffs, query, status, sort]);
  return <section className="space-y-4" aria-label={t("coordinator.conversationTasks.aria", { defaultValue: "Tasks from this conversation" })}>
    <div className="space-y-1"><h2 className="text-lg font-medium">{t("nav.tasks", { defaultValue: "Tasks" })}</h2><p className="text-sm text-muted-foreground">{t("coordinator.conversationTasks.subtitle", { defaultValue: "Created from this conversation." })}</p></div>
    <ToolbarSearch query={query} onQueryChange={setQuery} label={t("coordinator.conversationTasks.searchLabel", { defaultValue: "Search conversation tasks" })} placeholder={t("coordinator.conversationTasks.searchPlaceholder", { defaultValue: "Search tasks or IDs…" })} />
    <div className="flex flex-wrap gap-2">
      <NativeSelect value={status} onChange={event => setStatus(event.target.value)} aria-label={t("coordinator.conversationTasks.filterStatus", { defaultValue: "Filter conversation tasks by status" })} className="w-auto"><option value="">{t("coordinator.conversationTasks.allStatuses", { defaultValue: "All statuses" })}</option><option value="todo">{t("coordinator.conversationTasks.statusReady", { defaultValue: "Ready to start" })}</option><option value="in_progress">{t("tasks.status.in_progress", { defaultValue: "In progress" })}</option><option value="in_review">{t("coordinator.conversationTasks.statusNeedsReview", { defaultValue: "Needs review" })}</option><option value="blocked">{t("tasks.status.blocked", { defaultValue: "Blocked" })}</option><option value="done">{t("tasks.status.done", { defaultValue: "Done" })}</option><option value="cancelled">{t("tasks.status.cancelled", { defaultValue: "Cancelled" })}</option></NativeSelect>
      <NativeSelect value={sort} onChange={event => setSort(event.target.value)} aria-label={t("coordinator.conversationTasks.sortLabel", { defaultValue: "Sort conversation tasks" })} className="w-auto"><option value="newest">{t("attention.sort.newest", { defaultValue: "Newest first" })}</option><option value="oldest">{t("attention.sort.oldest", { defaultValue: "Oldest first" })}</option><option value="title">{t("coordinator.conversationTasks.sortTitle", { defaultValue: "Title" })}</option></NativeSelect>
    </div>
    {waiting && <p role="status" className="text-sm text-muted-foreground">{t("coordinator.conversationTasks.loading", { defaultValue: "Loading tasks…" })}</p>}
    {(tasksView.kind === "error") && <div role="alert" className="space-y-2"><p className="text-sm">{t("coordinator.conversationTasks.loadFailed", { defaultValue: "Tasks couldn’t load." })}</p><Button variant="outline" onClick={() => void tasks.refetch()}>{t("common.retry", { defaultValue: "Retry" })}</Button></div>}
    <div className="space-y-3">{visible.map(task => <div key={task.id} className="overflow-hidden rounded-xl border border-border bg-card"><CoordinatorCreatedTaskLink task={task} /></div>)}</div>
    {!waiting && !(tasksView.kind === "error") && !visible.length && <p className="py-4 text-sm text-muted-foreground">{query || status ? t("coordinator.conversationTasks.noFilterMatches", { defaultValue: "No loaded tasks match these filters." }) : t("coordinator.conversationTasks.empty", { defaultValue: "Tasks created from this conversation will appear here." })}</p>}
    {tasks.hasNextPage && <Button variant="outline" disabled={tasks.isFetchingNextPage} onClick={() => void tasks.fetchNextPage()}>{tasks.isFetchingNextPage ? t("coordinator.conversationTasks.loadingMore", { defaultValue: "Loading…" }) : t("coordinator.conversationTasks.loadMore", { defaultValue: "Load more tasks" })}</Button>}
  </section>;
}
