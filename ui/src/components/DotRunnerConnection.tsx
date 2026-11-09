import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { describeError } from "../api/errors";
import { Button } from "./ui/button";
import { buildDotSetupPrompt } from "../lib/dot-setup-prompt";
import { AgentSetupPrompt } from "./AgentSetupPrompt";
import { QueryErrorState, useQueryView } from "./QueryView";
import { useTranslation } from "../i18n";

interface Connection {
  enabled: boolean;
  resourceUrl: string | null;
  binding: { id: string; status: string; connected: boolean; subscriptionVerified: boolean; hasPendingChallenge: boolean;
    assignment?: { status: string; attentionRequired: boolean } | null } | null;
}

/** Pairing codes stay in component memory and expire; never save them in config. */
export function DotRunnerConnection({ companyId, agentId, bindingId, onBinding }: {
  companyId?: string; agentId?: string; bindingId?: string; onBinding: (id: string) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [pairing, setPairing] = useState<{ pairingCode: string; expiresAt: string } | null>(null);
  const path = `/companies/${companyId}/agents/${agentId}/dot-binding`;
  const key = ["dot-binding", companyId, agentId];
  const state = useQuery({ queryKey: key, enabled: !!companyId && !!agentId,
    queryFn: () => api.get<Connection>(path),
    refetchInterval: query => query.state.data?.binding?.status === "pairing" ||
      (query.state.data?.binding?.connected && !query.state.data.binding.subscriptionVerified) ||
      query.state.data?.binding?.hasPendingChallenge || query.state.data?.binding?.assignment ? 5000 : false });
  // Read the connection state through the shared view: cached data stays
  // visible while a transient refetch fails,and a no-data failure shows
  // readable copy with Retry.
  const stateView = useQueryView(state);
  const pair = useMutation({ mutationFn: () => api.post<{ bindingId: string; pairingCode: string; expiresAt: string }>(path, {}),
    onSuccess: result => { setPairing(result); onBinding(result.bindingId); void client.invalidateQueries({ queryKey: key }); } });
  const test = useMutation({ mutationFn: () => api.post(path + "/event-test", {}),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); } });
  const revoke = useMutation({ mutationFn: () => api.delete(path),
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Connection>(key, previous => previous ? { ...previous, binding: null } : previous);
      setPairing(null); onBinding("");
      await client.invalidateQueries({ queryKey: key });
    } });
  useEffect(() => {
    if (!pairing) return;
    const timer = window.setTimeout(() => setPairing(null), Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pairing]);
  const existingBindingId = state.data?.binding?.id;
  useEffect(() => {
    if (existingBindingId && existingBindingId !== bindingId && !revoke.isPending) onBinding(existingBindingId);
  }, [existingBindingId, bindingId, onBinding, revoke.isPending]);
  if (!agentId) return <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.saveAgentFirst", { defaultValue: "Save the agent, then return here to pair your Dot." })}</p>;
  const mutationError = pair.error ?? test.error ?? revoke.error;
  const b = state.data?.binding;
  const setupPrompt = pairing && state.data?.resourceUrl && companyId && agentId
    ? buildDotSetupPrompt({ companyId, agentId, resourceUrl: state.data.resourceUrl, ...pairing })
    : "";
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.intro", { defaultValue: "Dot manages its model and external tools. Paperclip supplies task coordination, people, assigned skills, and connected app tools. Dot can start a task directly from its conversation. Enable Read task attachments below to send assigned task file contents to OpenAI. Enable workspace files and commands for work in the assigned workspace. Provider usage and cost are unavailable; stopping a Paperclip run revokes access without confirming an external stop." })}</p>
    {state.data && !state.data.enabled && <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.disabled", { defaultValue: "Enable OpenAI Dot and Assistant connections (MCP) in experimental settings." })}</p>}
    {state.data?.resourceUrl && <p className="text-sm break-all">{t("dotRunnerConnection.mcpUrlPrefix", { defaultValue: "Private plugin MCP URL: " })}<code>{state.data.resourceUrl}</code></p>}
    {b && <p className="text-sm">{t("dotRunnerConnection.connection", {
      status: b.status,
      subscription: b.subscriptionVerified
        ? t("dotRunnerConnection.subscriptionVerified", { defaultValue: "verified" })
        : t("dotRunnerConnection.subscriptionRequired", { defaultValue: "required" }),
      defaultValue: "Connection: {{status}}. Event subscription: {{subscription}}.",
    })}</p>}
    {b?.assignment && <p className="text-sm">{t("dotRunnerConnection.assignment", { status: b.assignment.status === "offered" ? t("dotRunnerConnection.assignmentOffered", { defaultValue: "waiting for Dot to accept" }) : t("dotRunnerConnection.assignmentAccepted", { defaultValue: "accepted by Dot" }), defaultValue: "Assignment: {{status}}." })}</p>}
    {b?.assignment?.attentionRequired && <p className="text-sm text-destructive" role="alert">{t("dotRunnerConnection.attentionRequired", { defaultValue: "Dot has not reported useful activity for 15 minutes. Inspect the Dot before assigning replacement work; Paperclip cannot confirm its external stop." })}</p>}
    {pairing && setupPrompt && b?.status === "pairing" && <div className="space-y-2">
      <AgentSetupPrompt
        prompt={setupPrompt}
        label={t("dotRunnerConnection.setupLabel", { defaultValue: "Set up with Dot" })}
        agent={{ name: "Dot", src: "/brands/adapters/openai-dot.svg" }}
        title={t("dotRunnerConnection.setupTitle", { defaultValue: "Connect your Dot" })}
        description={t("dotRunnerConnection.setupDescription", { defaultValue: "Paste into your Dot to connect this agent." })}
        side="bottom"
      />
      <p className="text-xs text-muted-foreground">{t("dotRunnerConnection.promptExpires", { time: new Date(pairing.expiresAt).toLocaleTimeString(), defaultValue: "Setup prompt expires {{time}}." })}</p>
    </div>}
    {!pairing && b?.status === "pairing" && <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.revokeThenPair", { defaultValue: "Revoke the pending connection and pair again to generate a fresh setup prompt." })}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {!b && <Button type="button" variant="outline" disabled={!state.data?.enabled || !state.data?.resourceUrl || pair.isPending} onClick={() => pair.mutate()}>{t("dotRunnerConnection.actions.pair", { defaultValue: "Pair Dot" })}</Button>}
      {b?.subscriptionVerified && <Button type="button" variant="outline" disabled={test.isPending || b.hasPendingChallenge} onClick={() => test.mutate()}>{t("dotRunnerConnection.actions.testDelivery", { defaultValue: "Test event delivery" })}</Button>}
      <Button type="button" variant="outline" onClick={() => { void state.refetch(); }}>{t("dotRunnerConnection.actions.refresh", { defaultValue: "Refresh connection" })}</Button>
      {b && <Button type="button" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate()}>{t("dotRunnerConnection.actions.revoke", { defaultValue: "Revoke connection" })}</Button>}
    </div>
    {b?.hasPendingChallenge && <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.pendingChallenge", { defaultValue: "Waiting for Dot to read and confirm the harmless mailbox challenge." })}</p>}
    {stateView.kind === "error" && (
      <QueryErrorState
        size="inline"
        error={stateView.error}
        action="load the Dot connection"
        onRetry={stateView.retry}
        retrying={stateView.isFetching}
      />
    )}
    {mutationError && <p role="alert" className="text-sm text-destructive">{describeError(mutationError).body}</p>}
  </div>;
}
