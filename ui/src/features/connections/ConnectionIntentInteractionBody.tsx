import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Plug,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { AI_CONNECTION_CAPABILITIES, aiProviderSchema, type AiAuthMethod, type ConnectionIntentInteraction } from "@paperclipai/shared";
import { AgentMailIntentSetup } from "./AgentMailIntentSetup";
import { connectionIntentsApi } from "@/api/connection-intents";
import { aiConnectionsApi } from "@/api/ai-connections";
import { agentsApi } from "@/api/agents";
import { describeError } from "@/api/errors";
import { QueryErrorState, useQueryView } from "@/components/QueryView";
import { AiConnectionCredentialStep } from "@/components/ai-connections/AiConnectionCredentialStep";
import { AiProviderSetup } from "@/components/ai-connections/AiProviderSetup";
import { defaultAiConnectionName } from "@/components/ai-connections/model";
import { useTranslation } from "../../i18n";
import { AppLogo } from "@/pages/apps/AppLogo";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ConnectionSetupFlow,
  type ConnectionSetupCompletion,
  type ConnectionSetupFlowProps,
} from "./ConnectionSetupFlow";

import { DecisionCardFooter } from "@/components/DecisionCardFooter";
import { NeedsYouPanel, NeedsYouPanelNote, NeedsYouPanelRow } from "@/components/coordinator/NeedsYouCardKit";
import { ANALYTICS_MASK_CLASS } from "@/lib/analytics/privacy";
import { cn } from "@/lib/utils";

export interface ConnectionIntentInteractionBodyProps {
  footerSlot?: ReactNode;
  /** A Needs You card (PAP-775): the service in an inset panel, the verbs in the footer. */
  compact?: boolean;
  /** The Needs You page's artifact row, first in the panel. */
  artifactRow?: ReactNode;
  interaction: ConnectionIntentInteraction;
  currentUserId?: string | null;
  addresseeLabel: string;
  addresseeName?: string;
  renderSetup?: (props: ConnectionSetupFlowProps) => ReactNode;
}

export function ConnectionIntentInteractionBody({
  footerSlot,
  compact = false,
  artifactRow,
  interaction,
  currentUserId,
  addresseeLabel,
  addresseeName,
  renderSetup,
}: ConnectionIntentInteractionBodyProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [adoptionConnectionId, setAdoptionConnectionId] = useState<string | null>(null);
  const focusTargetRef = useRef<HTMLDivElement>(null);
  const setupGeneration = useRef(0);
  const generation = setupGeneration.current;
  const closeSetup = () => {
    setupGeneration.current += 1;
    selectAiAccountMutation.reset();
    setOpen(false);
  };
  const queryClient = useQueryClient();
  const isAddressee = Boolean(
    currentUserId && interaction.addresseeUserId === currentUserId,
  );
  const isPending = interaction.status === "pending";
  const isAi = interaction.payload.purpose === "ai";
  const isChatHandoff = Boolean(interaction.payload.savedSetup);
  const provider = isAi ? aiProviderSchema.safeParse(interaction.payload.serviceSlug).data : undefined;
  const serviceName = provider ? AI_CONNECTION_CAPABILITIES[provider].name : interaction.payload.serviceName;
  const isEmail = interaction.payload.purpose === "channel" && interaction.payload.serviceSlug === "agentmail";
  const serviceLogo = <AppLogo
    name={interaction.payload.serviceName}
    brandKey={interaction.payload.serviceSlug.startsWith("connection:") ? undefined : interaction.payload.serviceSlug}
    logoUrl={interaction.payload.serviceLogoUrl}
    darkLogoUrl={interaction.payload.serviceDarkLogoUrl}
    size={20}
    compact
  />;
  const accessRequest = interaction.payload.accessRequest;
  const agentQuery = useQuery({
    queryKey: ["agents", "detail", interaction.payload.requestingAgentId, interaction.companyId],
    queryFn: () => agentsApi.get(interaction.payload.requestingAgentId, interaction.companyId),
    enabled: Boolean(accessRequest) && isPending,
  });
  const focusTargetId = `connection-intent-focus-target-${interaction.id}`;

  const invalidateTask = async (
    updatedInteraction?: ConnectionIntentInteraction,
  ) => {
    if (updatedInteraction) {
      queryClient.setQueriesData<ConnectionIntentInteraction[]>(
        { queryKey: ["issues", "interactions"] },
        (current) =>
          current?.map((candidate) =>
            candidate.id === updatedInteraction.id
              ? updatedInteraction
              : candidate,
          ),
      );
    }
    await Promise.all([
      // Task routes may key these caches by either UUID or human identifier.
      // Prefix invalidation reaches the mounted task without requiring that
      // routing identity to leak into the reusable interaction card.
      queryClient.invalidateQueries({ queryKey: ["issues", "interactions"] }),
      queryClient.invalidateQueries({ queryKey: ["issues", "detail"] }),
    ]);
  };
  const returnFocusToCard = () => {
    // Completing an intent can move it from the composer takeover to the
    // durable timeline. That replaces this component instance, so its ref can
    // be cleared before focus restoration runs. Retry for a few paint frames
    // and resolve the stable interaction-specific target from the new host.
    const focusCurrentTarget = (remainingAttempts: number) => {
      window.requestAnimationFrame(() => {
        const target =
          document.getElementById(focusTargetId) ?? focusTargetRef.current;
        target?.focus();
        if (remainingAttempts > 1) {
          focusCurrentTarget(remainingAttempts - 1);
        }
      });
    };
    focusCurrentTarget(3);
  };

  const setupQuery = useQuery({
    queryKey: ["connection-intent", interaction.id, "setup-options"],
    queryFn: () => connectionIntentsApi.setupOptions(interaction.id),
    enabled: isAddressee && isPending,
    refetchInterval: isPending && (open || interaction.payload.phase === "authorizing") ? 2_000 : false,
  });
  const setupView = useQueryView(setupQuery);
  // Loaded options stay usable through a transient refetch failure (`stale`);
  // only a real failure, or nothing loaded yet, shows the setup placeholder.
  const setupUnavailable = setupQuery.isLoading || setupView.kind === "reconnecting" || setupView.kind === "error";

  useEffect(() => {
    const current = setupQuery.data?.interaction;
    if (current && current.status !== "pending" && isPending) {
      void invalidateTask(current);
      setOpen(false);
      returnFocusToCard();
    }
  }, [setupQuery.data?.interaction, isPending]);

  const completeMutation = useMutation({
    mutationFn: (connectionId: string) =>
      connectionIntentsApi.complete(interaction.id, connectionId),
    onSuccess: async (updatedInteraction) => {
      await invalidateTask(updatedInteraction);
      setOpen(false);
      returnFocusToCard();
    },
  });
  const adoptMutation = useMutation({
    mutationFn: (connectionId: string) => agentsApi.adoptAiConnection(
      interaction.payload.requestingAgentId, interaction.id, connectionId, interaction.companyId,
    ),
    onSuccess: async (updatedInteraction) => {
      await invalidateTask(updatedInteraction);
      setAdoptionConnectionId(null);
      setOpen(false);
      returnFocusToCard();
    },
  });
  const declineMutation = useMutation({
    mutationFn: () => connectionIntentsApi.decline(interaction.id),
    onSuccess: async (updatedInteraction) => {
      await invalidateTask(updatedInteraction);
      setOpen(false);
      returnFocusToCard();
    },
  });
  const phaseMutation = useMutation({
    mutationFn: (phase: ConnectionIntentInteraction["payload"]["phase"]) =>
      connectionIntentsApi.setPhase(interaction.id, phase),
    onSuccess: invalidateTask,
  });
  const mutatePhase = phaseMutation.mutate;
  const handlePhaseChange = useCallback(
    (phase: ConnectionIntentInteraction["payload"]["phase"]) =>
      mutatePhase(phase),
    [mutatePhase],
  );

  const finishNewConnection = async (completion: ConnectionSetupCompletion) => {
    // A completed credential save survives cancellation, but an abandoned form
    // must not accept the task request (even if a new form has since opened).
    if (isAi && generation !== setupGeneration.current) {
      await setupQuery.refetch();
      return;
    }
    if (completion.resolvedByCallback) {
      // A browser message cannot establish authorization. Read the durable result.
      const verified = await setupQuery.refetch();
      if (verified.data?.interaction.status !== "accepted") return;
      await invalidateTask(verified.data.interaction);
      setOpen(false);
      returnFocusToCard();
      return;
    }
    if (setupQuery.data?.aiConnectionRequiresAdoption) {
      setAdoptionConnectionId(completion.connectionId);
    } else {
      completeMutation.mutate(completion.connectionId);
    }
  };

  const selectAiAccountMutation = useMutation({
    mutationFn: async (result: { connectionId: string; grantId: string; method: AiAuthMethod; generation: number }) => {
      if (result.generation !== setupGeneration.current) {
        await setupQuery.refetch();
        return;
      }
      const binding = setupQuery.data?.aiConnection;
      const previous = setupQuery.data?.aiRepair?.connection;
      if (binding && previous && result.connectionId !== previous.id) {
        if (binding.mode === "responsible_user") {
          await aiConnectionsApi.setDefault(interaction.companyId, result.grantId);
        } else {
          const agent = await agentsApi.get(interaction.payload.requestingAgentId, interaction.companyId);
          const current = agent.runtimeConfig.aiConnection;
          if (!current || current.mode === "responsible_user" || current.mode === "router" || current.connectionId !== previous.id || current.grantId !== previous.grantId) {
            throw new Error(t("connectionIntent.error.connectionChanged", { defaultValue: "The agent’s AI connection changed. Reload the task and try again." }));
          }
          if (result.generation !== setupGeneration.current) return;
          await agentsApi.update(agent.id, {
            runtimeConfig: { ...agent.runtimeConfig, aiConnection: { ...binding, method: result.method, connectionId: result.connectionId, grantId: result.grantId } },
          }, interaction.companyId);
        }
        await queryClient.invalidateQueries({ queryKey: ["ai-connections", interaction.companyId] });
      }
      if (result.generation === setupGeneration.current) await finishNewConnection(result);
    },
  });

  const setupProps: ConnectionSetupFlowProps | null = setupQuery.data ? {
    host: "dialog",
    upstreamServiceName: interaction.payload.upstreamService?.name,
    serviceSlug: interaction.payload.serviceSlug.startsWith("connection:") ? undefined : interaction.payload.serviceSlug,
    configuredConnection: interaction.payload.serviceSlug.startsWith("connection:") ? setupQuery.data.existingConnections[0] : undefined,
    // Tool setup uses the same audience defaults and controls as Apps.
    // Runtime authentication and inboxes still belong to the requesting agent.
    requestedAgentId: interaction.payload.purpose ? setupQuery.data.requestedAgentId : undefined,
    requiredAgentId: interaction.payload.purpose ? undefined : setupQuery.data.requestedAgentId,
    setupAccess: setupQuery.data.interaction?.payload.setupAccess,
    aiConnection: setupQuery.data.aiConnection,
    interactionId: interaction.id,
    existingConnections: setupQuery.data.existingConnections,
    onUseExisting: async (connectionId) => { await completeMutation.mutateAsync(connectionId); },
    onComplete: (completion) => { void finishNewConnection(completion); },
    onOAuthDeclined: () => declineMutation.mutate(),
    onPhaseChange: handlePhaseChange,
    onCancel: () => { closeSetup(); returnFocusToCard(); },
  } : null;

  const resultOutcome = interaction.result?.outcome;
  const status =
    interaction.status === "accepted"
      ? {
          icon: CheckCircle2,
          title: accessRequest
            ? t("connectionIntent.status.accessGranted", { defaultValue: "{{service}} access granted", service: serviceName })
            : interaction.payload.upstreamService
              ? t("connectionIntent.status.externalConnected", { defaultValue: "External provider connected" })
              : t("connectionIntent.status.connected", { defaultValue: "{{service}} connected", service: serviceName }),
          body: accessRequest ? null : interaction.payload.upstreamService
            ? t("connectionIntent.status.externalBody", {
                defaultValue: "{{agent}} can now verify and authorize {{service}} through this provider. The app is not yet verified.",
                agent: interaction.payload.requestingAgentName,
                service: interaction.payload.upstreamService.name,
              })
            : isAi
              ? t("connectionIntent.status.aiBody", { defaultValue: "This agent can now use the connection." })
              : t("connectionIntent.status.connectionBody", { defaultValue: "{{agent}} can use this connection on the continuation run.", agent: interaction.payload.requestingAgentName }),
        }
      : interaction.status === "cancelled"
        ? {
            icon: XCircle,
            title: t("connectionIntent.status.withdrawn", { defaultValue: "Connection request withdrawn" }),
            body: t("connectionIntent.status.inactive", { defaultValue: "This request is no longer active." }),
          }
      : interaction.status === "rejected"
        ? {
            icon: XCircle,
            title: accessRequest
              ? t("connectionIntent.status.accessDeclined", { defaultValue: "Access declined" })
              : t("connectionIntent.status.declined", { defaultValue: "Connection declined" }),
            body: accessRequest ? null : isAi
              ? t("connectionIntent.status.needsAi", { defaultValue: "The task still needs a working AI connection before it can run." })
              : t("connectionIntent.status.notified", { defaultValue: "{{agent}} was notified and can continue without it.", agent: interaction.payload.requestingAgentName }),
          }
        : interaction.status === "expired"
          ? {
              icon: Clock,
              title:
                resultOutcome === "superseded"
                  ? t("connectionIntent.status.superseded", { defaultValue: "Request superseded" })
                  : t("connectionIntent.status.expired", { defaultValue: "Connection request expired" }),
              body:
                resultOutcome === "superseded"
                  ? t("connectionIntent.status.replaced", { defaultValue: "This request was replaced. Use the latest connection card instead." })
                  : // The server stores the reason an expiry happened and what to
                    // do next; without it the card only says the request is gone.
                    interaction.result?.reason?.trim()
                    || t("connectionIntent.status.inactive", { defaultValue: "This request is no longer active." }),
            }
          : null;
  const StatusIcon = status?.icon;

  if (status && StatusIcon) {
    return (
      <div
        id={focusTargetId}
        ref={focusTargetRef}
        tabIndex={-1}
        data-testid="connection-intent-focus-target"
      >
        <div
          className="flex items-start gap-3"
          data-testid="connection-intent-terminal"
        >
          <StatusIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">{status.title}</p>
            {status.body ? <p className="mt-1 text-sm text-muted-foreground">{status.body}</p> : null}
          </div>
        </div>
        <DecisionCardFooter leading={footerSlot} className="mt-4" />
      </div>
    );
  }

  if (!isAddressee) {
    return (
      <div
        id={focusTargetId}
        ref={focusTargetRef}
        tabIndex={-1}
        data-testid="connection-intent-focus-target"
      >
        <div
          className="flex items-start gap-3"
          data-testid="connection-intent-waiting"
        >
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">
              {t("connectionIntent.waitingFor", { defaultValue: "Waiting for {{name}}", name: addresseeLabel })}
            </p>
            {!accessRequest ? <p className="mt-1 text-sm text-muted-foreground">
              {t("connectionIntent.waitingBody", { defaultValue: "Only the addressed person can choose an identity or authorize this connection." })}
            </p> : null}
          </div>
        </div>
        <DecisionCardFooter leading={footerSlot} className="mt-4" />
      </div>
    );
  }

  const needsRetry = interaction.payload.phase === "needs_retry";
  const authorizing = interaction.payload.phase === "authorizing";

  if (accessRequest && compact) {
    const busy = completeMutation.isPending || declineMutation.isPending;
    const askFirst = accessRequest.tools.filter(tool => tool.permission === "ask_first").length;
    return <div id={focusTargetId} ref={focusTargetRef} tabIndex={-1} data-testid="connection-intent-focus-target">
      <div data-testid="connection-intent-access-request" className={cn("space-y-4", ANALYTICS_MASK_CLASS)}>
        <NeedsYouPanel>
          {artifactRow}
          <NeedsYouPanelRow icon={serviceLogo} title={`${interaction.payload.serviceName} · ${accessRequest.connectionName}`}
            meta={t("connectionIntent.access.toolCount", {
              count: accessRequest.tools.length,
              defaultValue: accessRequest.tools.length === 1 ? "{{count}} tool for {{agent}}" : "{{count}} tools for {{agent}}",
              agent: interaction.payload.requestingAgentName,
            })} />
          <ul aria-label={t("connectionIntent.access.toolsAria", { defaultValue: "Tool permissions" })} className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
            {accessRequest.tools.map(tool => <li key={tool.catalogEntryId} className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-all font-mono text-foreground">{tool.toolName}</span>
              <span className="shrink-0 text-muted-foreground">{tool.permission === "allowed" ? t("connectionIntent.access.allowed", { defaultValue: "Allowed" }) : t("connectionIntent.access.askFirst", { defaultValue: "Ask first" })}</span>
            </li>)}
          </ul>
          <NeedsYouPanelNote>
            {t("connectionIntent.access.scopeNote", { defaultValue: "Access applies to {{agent}} only", agent: interaction.payload.requestingAgentName })}
            {askFirst > 0 ? ` · ${t("connectionIntent.access.askFirstNote", {
              count: askFirst,
              defaultValue: askFirst === 1 ? "{{count}} still asks you first" : "{{count}} still ask you first",
            })}` : ""}.
          </NeedsYouPanelNote>
        </NeedsYouPanel>
        {setupView.kind === "error" ? <QueryErrorState error={setupView.error} onRetry={setupView.retry} /> : null}
        {completeMutation.error || declineMutation.error ? <p role="alert" className="text-sm text-destructive">{describeError(completeMutation.error ?? declineMutation.error).body}</p> : null}
        {setupQuery.data?.canGrantAccess === false ? <p role="status" className="text-sm text-muted-foreground">{t("connectionIntent.connectionManagerRequired", { defaultValue: "Connection manager required." })}</p> : null}
        <DecisionCardFooter leading={footerSlot}>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => declineMutation.mutate()}>{t("connectionIntent.deny", { defaultValue: "Deny" })}</Button>
          <Button size="sm" disabled={busy || !setupQuery.data?.canGrantAccess} onClick={() => completeMutation.mutate(accessRequest.connectionId)}>
            {completeMutation.isPending ? t("connectionIntent.grantingAccess", { defaultValue: "Granting access…" }) : t("connectionIntent.grantAccess", { defaultValue: "Grant access" })}
          </Button>
        </DecisionCardFooter>
      </div>
    </div>;
  }

  if (accessRequest) {
    const busy = completeMutation.isPending || declineMutation.isPending;
    return <div id={focusTargetId} ref={focusTargetRef} tabIndex={-1} data-testid="connection-intent-focus-target">
      <div data-testid="connection-intent-access-request" className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <AgentAvatar agent={agentQuery.data ?? { id: interaction.payload.requestingAgentId, name: interaction.payload.requestingAgentName }} size={32} label={interaction.payload.requestingAgentName} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-medium text-foreground", ANALYTICS_MASK_CLASS)}>Grant {interaction.payload.requestingAgentName} access to “{accessRequest.connectionName}”?</p>
          </div>
          <AppLogo name={interaction.payload.serviceName} logoUrl={interaction.payload.serviceLogoUrl} darkLogoUrl={interaction.payload.serviceDarkLogoUrl} size={32} />
        </div>
        <ul aria-label={t("connectionIntent.access.toolsAria", { defaultValue: "Tool permissions" })} className="max-h-48 space-y-2 overflow-y-auto text-xs">
          {accessRequest.tools.map(tool => <li key={tool.catalogEntryId} className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-all font-mono text-foreground">{tool.toolName}</span>
            <span className="shrink-0 text-muted-foreground">{tool.permission === "allowed" ? t("connectionIntent.access.allowed", { defaultValue: "Allowed" }) : t("connectionIntent.access.askFirst", { defaultValue: "Ask first" })}</span>
          </li>)}
        </ul>
        {setupView.kind === "error" ? <QueryErrorState size="inline" error={setupQuery.error} action="load this access request" onRetry={setupView.retry} retrying={setupView.isFetching} /> : null}
        {completeMutation.error || declineMutation.error ? <p role="alert" className="text-sm text-destructive">{describeError(completeMutation.error ?? declineMutation.error).body}</p> : null}
        {setupQuery.data?.canGrantAccess === false ? <p role="status" className="text-sm text-muted-foreground">{t("connectionIntent.connectionManagerRequired", { defaultValue: "Connection manager required." })}</p> : null}
        <DecisionCardFooter leading={footerSlot}>
          <div className={footerSlot ? "flex flex-wrap items-center justify-end gap-2" : "flex items-center justify-between gap-2"}>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => declineMutation.mutate()}>{t("connectionIntent.notNow", { defaultValue: "Not now" })}</Button>
          <Button size="sm" disabled={busy || !setupQuery.data?.canGrantAccess} onClick={() => completeMutation.mutate(accessRequest.connectionId)}>
            {completeMutation.isPending ? t("connectionIntent.grantingAccess", { defaultValue: "Granting access…" }) : t("connectionIntent.grantAccess", { defaultValue: "Grant access" })}
          </Button>
          </div>
        </DecisionCardFooter>
      </div>
    </div>;
  }

  const repair = setupQuery.data?.aiRepair;
  const selectedReady = repair && setupQuery.data?.existingConnections.some((connection) => connection.id === repair.connection.id);
  const readyForAdoption = setupQuery.data?.aiConnectionRequiresAdoption
    ? adoptionConnectionId ?? (selectedReady ? repair.connection.id : null)
    : null;
  const setupContent = setupQuery.isLoading || setupView.kind === "reconnecting" ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("connectionIntent.loadingOptions", { defaultValue: "Loading connection options…" })}
                </div>
              ) : setupView.kind === "error" ? (
                <div className="py-6">
                  <QueryErrorState
                    error={setupQuery.error}
                    action="load connection setup"
                    onRetry={setupView.retry}
                    retrying={setupView.isFetching}
                  />
                </div>
              ) : setupProps ? (
                renderSetup ? renderSetup(setupProps) : <ConnectionSetupFlow {...setupProps} />
              ) : null;
  const aiConnection = setupQuery.data?.aiConnection;
  const needsOwnAiConnection = isAi && (!repair || setupQuery.data?.aiConnectionRequiresAdoption) && aiConnection?.mode === "responsible_user";
  const aiProviderName = aiConnection ? AI_CONNECTION_CAPABILITIES[aiConnection.provider].name : serviceName;
  const inlineContent = setupUnavailable ? setupContent
    : readyForAdoption ? <div className="space-y-3">
        <p className="text-sm">
          {t("connectionIntent.adoption.body", {
            defaultValue: "Use your {{provider}} connection for {{agent}}? This replaces the agent’s existing authentication with each responsible person’s own account. The model stays the same.",
            provider: aiProviderName,
            agent: interaction.payload.requestingAgentName,
          })}
        </p>
        <Button disabled={adoptMutation.isPending} onClick={() => adoptMutation.mutate(readyForAdoption)}>
          {adoptMutation.isPending ? t("connectionIntent.adoption.checking", { defaultValue: "Checking connection…" }) : t("connectionIntent.adoption.use", { defaultValue: "Use connection and continue" })}
        </Button>
      </div>
    : selectedReady ? <div className="space-y-3">
        <p className={cn("text-sm", ANALYTICS_MASK_CLASS)}>{repair.connection.name} is ready.</p>
        <Button disabled={completeMutation.isPending} onClick={() => completeMutation.mutate(repair.connection.id)}>
          {completeMutation.isPending ? t("connectionIntent.continuing", { defaultValue: "Continuing…" }) : t("connectionIntent.continueTask", { defaultValue: "Continue task" })}
        </Button>
      </div>
    : repair ? repair.canReconnect ? repair.connection.routing ? <AiProviderSetup
        companyId={interaction.companyId}
        agentId={interaction.payload.requestingAgentId}
        reconnect={repair.connection}
        onComplete={(binding) => selectAiAccountMutation.mutate({ connectionId: binding.connectionId, grantId: binding.grantId, method: binding.method ?? "api_key", generation })}
        onCancel={() => { closeSetup(); returnFocusToCard(); }}
      /> : <AiConnectionCredentialStep
        companyId={interaction.companyId}
        provider={repair.connection.provider}
        initialMethod={repair.connection.method}
        fixedMethod={false}
        connectionId={repair.connection.id}
        name={repair.connection.name}
        nameForMethod={(method) => defaultAiConnectionName(addresseeName ?? addresseeLabel, repair.connection.provider, method)}
        hideName
        ownership={repair.connection.ownership}
        agentIds={[interaction.payload.requestingAgentId]}
        allAgents={false}
        onComplete={(result) => selectAiAccountMutation.mutate({ ...result, generation })}
        onCancel={() => { closeSetup(); returnFocusToCard(); }}
      /> : <p role="status" className={cn("text-sm text-muted-foreground", ANALYTICS_MASK_CLASS)}>
        {repair.connection.ownership === "personal" ? `${repair.connection.ownerName ?? "The account owner"} must reconnect ${repair.connection.name}.` : `The account owner must reconnect ${repair.connection.name}.`}
        {" "}{t("connectionIntent.repair.resumeNote", { defaultValue: "You can continue here once it is restored." })}
      </p>
    : aiConnection && aiConnection.mode !== "responsible_user"
      ? <p role="status" className="text-sm text-muted-foreground">{t("connectionIntent.repair.accountUnavailable", { defaultValue: "The selected account is no longer available to you. Ask its owner to restore access, or choose an available AI connection in the agent’s settings." })}</p>
      : aiConnection ? <AiConnectionCredentialStep
          companyId={interaction.companyId}
          provider={aiConnection.provider}
          name={defaultAiConnectionName(addresseeName ?? addresseeLabel, aiConnection.provider, "subscription")}
          hideName
          nameForMethod={(method) => defaultAiConnectionName(addresseeName ?? addresseeLabel, aiConnection.provider, method)}
          ownership="personal"
          agentIds={[interaction.payload.requestingAgentId]}
          allAgents={false}
          onComplete={(result) => selectAiAccountMutation.mutate({ ...result, generation })}
          onCancel={() => { closeSetup(); returnFocusToCard(); }}
        /> : setupContent;

  const headline = readyForAdoption
    ? t("connectionIntent.headline.useAccount", { defaultValue: "Use your {{provider}} account", provider: aiProviderName })
    : needsOwnAiConnection
      ? t("connectionIntent.headline.connectAccount", { defaultValue: "Connect your {{provider}} account", provider: aiProviderName })
      : isAi
        ? t("connectionIntent.headline.authRequired", { defaultValue: "{{provider}} authentication required", provider: aiProviderName })
        : t("connectionIntent.headline.agentNeedsService", { defaultValue: "{{agent}} needs {{service}}", agent: interaction.payload.requestingAgentName, service: interaction.payload.serviceName });
  const description = readyForAdoption
    ? t("connectionIntent.description.accountReady", { defaultValue: "Your account is connected. Use it for {{agent}} to resume this task.", agent: interaction.payload.requestingAgentName })
    : needsOwnAiConnection
    ? t("connectionIntent.description.needsOwnAi", { defaultValue: "{{agent}} needs your own AI connection. Connect here and the task will resume automatically.", agent: interaction.payload.requestingAgentName })
    : interaction.payload.purpose === "ai"
    ? t("connectionIntent.description.invalidAi", { defaultValue: "This task can’t run until the agent has a valid AI connection. Connect here and the task will resume automatically." })
    : isChatHandoff ? t("connectionIntent.description.chatHandoff", { defaultValue: "Complete the human sign-in step in the saved setup. Your task continues when the connection is ready." })
    : isEmail ? t("connectionIntent.description.email", { defaultValue: "Connect AgentMail to create an email address for this agent." })
    : t("connectionIntent.description.custom", { defaultValue: "New connections default to all agents; you can choose fewer during setup. Reusing an account adds access for this agent." });
  // Paper "Connect a service": a plain connect names the service and its state
  // in the panel; AI, email and chat setups keep their own headline there.
  const plainConnect = !isAi && !isEmail && !isChatHandoff;
  const retryMessage = t("connectionIntent.retryMessage", { defaultValue: "Authorization didn’t finish. Your previous choices are safe; try again." });

  return (
    <div
      id={focusTargetId}
      ref={focusTargetRef}
      tabIndex={-1}
      data-testid="connection-intent-focus-target"
    >
      <div data-testid="connection-intent-actions">
        {compact ? <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          <NeedsYouPanel>
            {artifactRow}
            <NeedsYouPanelRow icon={serviceLogo} title={plainConnect ? interaction.payload.serviceName : headline}
              meta={plainConnect ? authorizing ? t("connectionIntent.authorizing", { defaultValue: "Authorizing…" }) : t("connectionIntent.notConnected", { defaultValue: "Not connected" }) : undefined} />
            {needsRetry ? <NeedsYouPanelNote>{retryMessage}</NeedsYouPanelNote>
              : plainConnect ? <NeedsYouPanelNote>{t("connectionIntent.requestedBy", { defaultValue: "Requested by {{agent}}.", agent: interaction.payload.requestingAgentName })}</NeedsYouPanelNote> : null}
          </NeedsYouPanel>
        </div> : <div className="flex items-start gap-3">
          <AppLogo
            name={interaction.payload.serviceName}
            logoUrl={interaction.payload.serviceLogoUrl}
            darkLogoUrl={interaction.payload.serviceDarkLogoUrl}
            size={40}
          />
          <div>
            <p className="font-medium text-foreground">
              {headline}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>}

        {needsRetry && !compact ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-destructive">
            <RotateCcw className="h-4 w-4" />
            {retryMessage}
          </p>
        ) : null}

        {isChatHandoff ? <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" disabled={declineMutation.isPending} onClick={() => declineMutation.mutate()}>{t("connectionIntent.notNow", { defaultValue: "Not now" })}</Button>
          {setupQuery.data?.chatSetup ? <Button asChild><a href={setupQuery.data.chatSetup.path} target="_blank" rel="noopener noreferrer">{t("connectionIntent.continueAuthentication", { defaultValue: "Continue authentication" })}</a></Button> : setupContent}
        </div> : isEmail ? setupUnavailable ? <>
          {setupContent}
          <Button type="button" variant="ghost" disabled={declineMutation.isPending} onClick={() => declineMutation.mutate()}>{t("connectionIntent.notNow", { defaultValue: "Not now" })}</Button>
        </> : <AgentMailIntentSetup
          companyId={interaction.companyId}
          agentId={interaction.payload.requestingAgentId}
          requestId={interaction.id}
          savedCredentialId={setupQuery.data?.emailSetup?.credentialConnectionId}
          readyConnectionId={setupQuery.data?.emailSetup?.readyConnectionId}
          onComplete={async connectionId => { await completeMutation.mutateAsync(connectionId); }}
          onDecline={() => declineMutation.mutate()}
          declining={declineMutation.isPending}
        /> : <DecisionCardFooter leading={footerSlot} className="mt-4">
          <div className={footerSlot ? "flex flex-wrap items-center justify-end gap-2" : "mt-4 flex flex-wrap justify-end gap-2"}>
            {!isAi && <Button
              type="button"
              variant="ghost"
              disabled={declineMutation.isPending || completeMutation.isPending || authorizing}
              onClick={() => declineMutation.mutate()}
            >
              {t("connectionIntent.notNow", { defaultValue: "Not now" })}
            </Button>}
            {isAi ? <Button type="button" disabled={completeMutation.isPending || adoptMutation.isPending || selectAiAccountMutation.isPending} onClick={() => open ? closeSetup() : setOpen(true)}>
              <Plug className="h-4 w-4" />{open
                ? t("connectionIntent.closeSetup", { defaultValue: "Close setup" })
                : readyForAdoption
                  ? t("connectionIntent.continueSetup", { defaultValue: "Continue setup" })
                  : needsOwnAiConnection
                    ? t("connectionIntent.connectNamed", { defaultValue: "Connect {{name}}", name: aiProviderName })
                    : t("connectionIntent.fixConnection", { defaultValue: "Fix connection" })}
            </Button> : <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  {authorizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : compact ? null : (
                    <Plug className="h-4 w-4" />
                  )}
                  {authorizing
                    ? t("connectionIntent.continueSetup", { defaultValue: "Continue setup" })
                    : needsRetry
                      ? t("connectionIntent.tryAgain", { defaultValue: "Try again" })
                      : compact ? t("connectionIntent.connectNamed", { defaultValue: "Connect {{name}}", name: interaction.payload.serviceName })
                      : setupQuery.data?.existingConnections.length ? t("connectionIntent.connectOrExisting", { defaultValue: "Connect / Use existing" }) : t("connectionIntent.connect", { defaultValue: "Connect" })}
                </Button>
              </DialogTrigger>
              <DialogContent
                className={cn("max-h-(--sz-85vh) overflow-y-auto sm:max-w-3xl", ANALYTICS_MASK_CLASS)}
                showCloseButton={false}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  focusTargetRef.current?.focus();
                }}
              >
                <DialogHeader className="sr-only">
                  <DialogTitle>
                    {t("connectionIntent.connectNamed", { defaultValue: "Connect {{name}}", name: interaction.payload.serviceName })}
                  </DialogTitle>
                  <DialogDescription>
                    {t("connectionIntent.dialogDescription", { defaultValue: "Complete connection setup without leaving this task." })}
                  </DialogDescription>
                </DialogHeader>
                {setupContent}
              </DialogContent>
            </Dialog>}
          </div>
        </DecisionCardFooter>}
        {isEmail ? <DecisionCardFooter leading={footerSlot} className="mt-4" /> : null}
        {isAi && open ? <div className="mt-4 border-t border-border pt-4" data-testid="ai-connection-inline-repair">{inlineContent}</div> : null}

        {(!isEmail && completeMutation.error) ||
        (selectAiAccountMutation.error && selectAiAccountMutation.variables?.generation === generation) ||
        adoptMutation.error ||
        declineMutation.error ||
        phaseMutation.error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {describeError(
              completeMutation.error ??
                selectAiAccountMutation.error ??
                adoptMutation.error ??
                declineMutation.error ??
                phaseMutation.error,
            ).body}
          </p>
        ) : null}
        {selectAiAccountMutation.error && selectAiAccountMutation.variables?.generation === generation && (
          <Button className="mt-3" onClick={() => selectAiAccountMutation.mutate(selectAiAccountMutation.variables!)}>
            {t("connectionIntent.retryUsingConnection", { defaultValue: "Retry using this connection" })}
          </Button>
        )}
      </div>
    </div>
  );
}
