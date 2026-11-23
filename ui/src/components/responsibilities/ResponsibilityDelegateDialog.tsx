import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, ResponsibilityDelegationMode, ResponsibilityDelegationResult } from "@paperclipai/shared";
import { CircleCheck } from "lucide-react";
import { agentsApi } from "@/api/agents";
import { responsibilitiesApi } from "@/api/responsibilities";
import { describeError } from "@/api/errors";
import { QueryErrorState, useQueryView } from "@/components/QueryView";
import { usePrimaryAgentPresentation } from "@/components/primary-agent/PrimaryAgentPresentation";
import { SearchableSelect, type SearchableSelectGroup, type SearchableSelectOption } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioCardGroup } from "@/components/ui/radio-card";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import {
  buildDelegationPayload,
  DEFAULT_DELEGATION_MODE,
  RESPONSIBILITY_DELEGATION_MODE_OPTIONS,
} from "@/lib/responsibilities";
import { issueUrl } from "@/lib/utils";
import { useTranslation } from "@/i18n";

export interface ResponsibilityDelegateTarget {
  id: string;
  title: string;
}

export interface ResponsibilityDelegateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  responsibility: ResponsibilityDelegateTarget;
  /** Prefill for "What should the agent do?", e.g. the reason a responsibility needs you. */
  defaultTitle?: string;
  /** File the new task under this project. */
  projectId?: string | null;
  /** Called with the created task once the server accepts it. */
  onDelegated?: (result: ResponsibilityDelegationResult) => void;
}

interface AgentOption extends SearchableSelectOption {
  agent: Agent;
}

/** Agents that can take new work, the person's primary agent first. */
export function orderDelegationAgents(agents: readonly Agent[], primaryAgentId: string | null): Agent[] {
  const available = agents.filter((agent) => agent.status !== "terminated");
  const primary = available.find((agent) => agent.id === primaryAgentId);
  const rest = available
    .filter((agent) => agent !== primary)
    .sort((a, b) => a.name.localeCompare(b.name));
  return primary ? [primary, ...rest] : rest;
}

/**
 * "New task for an agent": pick who, how they work on it, and what to do.
 * Creates one task assigned to the agent, filed under the responsibility, and wakes it.
 */
export function ResponsibilityDelegateDialog({
  open,
  onOpenChange,
  companyId,
  responsibility,
  defaultTitle = "",
  projectId = null,
  onDelegated,
}: ResponsibilityDelegateDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const primary = usePrimaryAgentPresentation(companyId);
  const primaryAgentId = primary?.primaryAgentId ?? null;
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: open && !!companyId,
  });
  const agentsView = useQueryView(agentsQuery);
  const ordered = useMemo(
    () => orderDelegationAgents(agentsQuery.data ?? [], primaryAgentId),
    [agentsQuery.data, primaryAgentId],
  );
  const groups = useMemo<SearchableSelectGroup<string, AgentOption>[]>(() => {
    const toOption = (agent: Agent): AgentOption => ({
      key: agent.id,
      value: agent.id,
      label: agent.name,
      searchText: [agent.title, agent.role].filter(Boolean).join(" "),
      agent,
    });
    const primaryAgent = ordered[0]?.id === primaryAgentId ? ordered[0] : null;
    const others = primaryAgent ? ordered.slice(1) : ordered;
    return [
      ...(primaryAgent ? [{ id: "primary", label: t("responsibilities.delegate.yourPrimaryAgent", { defaultValue: "Your primary agent" }), options: [toOption(primaryAgent)] }] : []),
      ...(others.length > 0 ? [{ id: "others", label: primaryAgent ? t("responsibilities.delegate.otherAgents", { defaultValue: "Other agents" }) : undefined, options: others.map(toOption) }] : []),
    ];
  }, [ordered, primaryAgentId, t]);

  const [agentId, setAgentId] = useState("");
  const [mode, setMode] = useState<ResponsibilityDelegationMode>(DEFAULT_DELEGATION_MODE);
  const [title, setTitle] = useState(defaultTitle);
  const [instructions, setInstructions] = useState("");
  const [created, setCreated] = useState<ResponsibilityDelegationResult | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);

  // Fresh form each time it opens, with the prefill for this launch.
  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setInstructions("");
    setMode(DEFAULT_DELEGATION_MODE);
    setCreated(null);
    setAgentId("");
  }, [open, defaultTitle]);

  // Default to the first choice (the primary agent when there is one).
  const effectiveAgentId = agentId || ordered[0]?.id || "";

  const delegate = useMutation({
    mutationFn: () =>
      responsibilitiesApi.delegate(
        responsibility.id,
        buildDelegationPayload({ title, instructions, assigneeAgentId: effectiveAgentId, mode, projectId }),
      ),
    onSuccess: (result) => {
      setCreated(result);
      onDelegated?.(result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.responsibilities.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  // Reset a previous error when the form opens again.
  const resetDelegate = delegate.reset;
  useEffect(() => {
    if (open) resetDelegate();
  }, [open, resetDelegate]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !effectiveAgentId || delegate.isPending) return;
    delegate.mutate();
  };

  const assignee = created ? ordered.find((agent) => agent.id === created.issue.assigneeAgentId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Start in "What to do": the agent picker opens when it takes focus, and
          opened unasked it covers the "How" choices below it. */}
      <DialogContent
        className="sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleInput.current?.focus();
        }}
      >
        {created ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CircleCheck className="size-5 text-(--status-task-icon-done)" aria-hidden="true" />
                {t("responsibilities.delegate.taskCreated", { defaultValue: "Task created" })}
              </DialogTitle>
              <DialogDescription>
                {assignee
                  ? t("responsibilities.delegate.assigneeHasIt", { defaultValue: "{{name}} has it.", name: assignee.name })
                  : t("responsibilities.delegate.agentHasIt", { defaultValue: "The agent has it." })}{" "}
                {t("responsibilities.delegate.filedUnder", { defaultValue: "It is filed under {{title}}.", title: responsibility.title })}
              </DialogDescription>
            </DialogHeader>
            <Link
              to={issueUrl(created.issue)}
              className="flex items-baseline gap-2 rounded-md text-sm text-foreground underline-offset-4 hover:underline"
              onClick={() => onOpenChange(false)}
            >
              {created.issue.identifier ? (
                <span className="font-mono text-xs text-muted-foreground">{created.issue.identifier}</span>
              ) : null}
              <span>{created.issue.title}</span>
            </Link>
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={() => setCreated(null)}>
                {t("responsibilities.delegate.giveAnotherTask", { defaultValue: "Give another task" })}
              </Button>
              <Button onClick={() => onOpenChange(false)}>{t("common.done", { defaultValue: "Done" })}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="flex flex-col gap-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{t("responsibilities.parts.newTask", { defaultValue: "New task for an agent" })}</DialogTitle>
              <DialogDescription>{t("responsibilities.delegate.createsTaskUnder", { defaultValue: "Creates a task under {{title}} and gives it to the agent.", title: responsibility.title })}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">{t("responsibilities.delegate.who", { defaultValue: "Who" })}</span>
              <SearchableSelect<string, AgentOption>
                value={effectiveAgentId}
                groups={groups}
                onValueChange={(value) => setAgentId(value)}
                placeholder={agentsQuery.isPending ? t("responsibilities.delegate.loadingAgents", { defaultValue: "Loading agents…" }) : t("responsibilities.delegate.chooseAgent", { defaultValue: "Choose an agent" })}
                searchPlaceholder={t("responsibilities.delegate.searchAgents", { defaultValue: "Search agents…" })}
                emptyMessage={t("responsibilities.delegate.noAgents", { defaultValue: "No agents can take this. Add an agent first." })}
                loading={agentsQuery.isPending}
                triggerAriaLabel={t("responsibilities.delegate.agentAria", { defaultValue: "Agent" })}
                disablePortal
              />
              {agentsView.kind === "error" ? (
                <QueryErrorState
                  error={agentsView.error}
                  size="inline"
                  action={t("responsibilities.delegate.loadAgentsAction", { defaultValue: "load agents" })}
                  onRetry={agentsView.retry}
                  retrying={agentsView.isFetching}
                />
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">{t("responsibilities.delegate.how", { defaultValue: "How" })}</span>
              <RadioCardGroup
                ariaLabel={t("responsibilities.delegate.howAria", { defaultValue: "How the agent works" })}
                value={mode}
                onValueChange={(value) => setMode(value as ResponsibilityDelegationMode)}
                options={RESPONSIBILITY_DELEGATION_MODE_OPTIONS.map((option) => ({
                  value: option.value,
                  title: option.title,
                  description: option.description,
                }))}
                className="sm:grid-cols-2"
              />
            </div>

            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-foreground">{t("responsibilities.delegate.whatToDo", { defaultValue: "What to do" })}</span>
              <Input
                ref={titleInput}
                value={title}
                maxLength={200}
                placeholder={t("responsibilities.delegate.whatToDoPlaceholder", { defaultValue: "e.g. Draft the investor update" })}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-foreground">
                {t("responsibilities.delegate.anythingElse", { defaultValue: "Anything else" })} <span className="font-normal text-muted-foreground">{t("responsibilities.optional", { defaultValue: "(optional)" })}</span>
              </span>
              <Textarea
                rows={3}
                value={instructions}
                placeholder={t("responsibilities.delegate.anythingElsePlaceholder", { defaultValue: "Context, constraints, or what done looks like" })}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </label>

            {delegate.error ? (
              <p role="alert" className="text-sm text-destructive">
                {t("responsibilities.delegate.createFailed", { defaultValue: "Couldn’t create the task." })} {describeError(delegate.error).body}
              </p>
            ) : null}

            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button type="submit" disabled={!title.trim() || !effectiveAgentId || delegate.isPending}>
                {delegate.isPending ? t("responsibilities.delegate.creatingTask", { defaultValue: "Creating task…" }) : t("responsibilities.delegate.createTask", { defaultValue: "Create task" })}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
