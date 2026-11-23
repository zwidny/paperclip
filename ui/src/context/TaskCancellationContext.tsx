import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Issue } from "@paperclipai/shared";
import { useQueryClient } from "@tanstack/react-query";
import { bindAccount } from "@/lib/account-scope";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusIcon } from "@/components/StatusIcon";
import { useTranslation } from "@/i18n";
import { taskStatusIconProps } from "@/lib/task-status-presentation";

export type SubtaskCancellationChoice = "task_only" | "subtasks" | "dismiss";
type Subtask = Pick<Issue, "id" | "title" | "status" | "displayStatus" | "externalConversationState" | "blockerAttention">;
type ConfirmCancellation = (subtasks: Subtask[]) => Promise<SubtaskCancellationChoice>;
const TaskCancellationContext = createContext<ConfirmCancellation | null>(null);

export function TaskCancellationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [subtasks, setSubtasks] = useState<Subtask[] | null>(null);
  const resolveRef = useRef<((choice: SubtaskCancellationChoice) => void) | null>(null);
  const accountRef = useRef<ReturnType<typeof bindAccount> | null>(null);
  const finish = useCallback((choice: SubtaskCancellationChoice) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    accountRef.current = null;
    setSubtasks(null);
    resolve?.(choice);
  }, []);
  const confirm = useCallback<ConfirmCancellation>((tasks) => {
    resolveRef.current?.("dismiss");
    accountRef.current = bindAccount(client);
    setSubtasks(tasks);
    return new Promise(resolve => { resolveRef.current = resolve; });
  }, [client]);
  useEffect(() => {
    bindAccount(client);
    const unsubscribe = client.getQueryCache().subscribe(() => {
      if (accountRef.current && !accountRef.current.isCurrentScope()) finish("dismiss");
    });
    return () => { unsubscribe(); resolveRef.current?.("dismiss"); };
  }, [client, finish]);
  const subtaskList = useMemo(() => subtasks?.map(task => (
    <li key={task.id} className="flex min-w-0 items-center gap-2">
      <StatusIcon
        {...taskStatusIconProps(task)}
        blockerAttention={task.blockerAttention ? {
          ...task.blockerAttention,
          sampleBlockerIdentifier: null,
          sampleStalledBlockerIdentifier: null,
        } : null}
      />
      <span className="min-w-0 break-words">{task.title}</span>
    </li>
  )), [subtasks]);

  return (
    <TaskCancellationContext.Provider value={confirm}>
      {children}
      <Dialog open={subtasks !== null} onOpenChange={open => { if (!open) finish("dismiss"); }}>
        <DialogContent aria-describedby={undefined} className="max-h-(--sz-calc-18) overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("taskCancellation.title", { count: subtasks?.length ?? 0, defaultValue_one: "Cancel {{count}} active subtask?", defaultValue_other: "Cancel {{count}} active subtasks?" })}</DialogTitle>
          </DialogHeader>
          <ul aria-label={t("taskCancellation.activeSubtasks", { defaultValue: "Active subtasks" })} className="flex flex-col gap-2 text-sm">
            {subtaskList}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => finish("task_only")}>{t("taskCancellation.cancelTaskOnly", { defaultValue: "Cancel task only" })}</Button>
            <Button variant="destructive" onClick={() => finish("subtasks")}>{t("taskCancellation.cancelTaskAndSubtasks", { defaultValue: "Cancel task and subtasks" })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TaskCancellationContext.Provider>
  );
}

export function useConfirmTaskCancellation() {
  return useContext(TaskCancellationContext);
}
