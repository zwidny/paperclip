import { describeError } from "@/api/errors";
import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DotPairing } from "@paperclipai/shared";
import { grokBotApi } from "@/api/grokBot";
import { buildGrokAccessPrompt, buildGrokRoutinePrompt } from "@/lib/grok-bot-setup-prompt";
import { AgentSetupPrompt } from "./AgentSetupPrompt";
import { CopyText } from "./CopyText";
import { Button, buttonVariants } from "./ui/button";
import { Input } from "./ui/input";
import { queryKeys } from "@/lib/queryKeys";
import { useTranslation } from "../i18n";

/** Configuration writes update the authoritative binding, never an unsaved agent form. */
export function GrokBotConnection({ companyId, agentId }: { companyId?: string; agentId?: string }) {
  const { t } = useTranslation();
  const pairingCodeId = useId();
  const cache = useQueryClient();
  const key = ["grok-binding", companyId, agentId];
  const state = useQuery({ queryKey: key, enabled: !!companyId && !!agentId,
    queryFn: ({ signal }) => grokBotApi.connection(companyId!, agentId!, signal), refetchInterval: 5000 });
  const [pairing, setPairing] = useState<DotPairing | null>(null);
  const [replace, setReplace] = useState(false);
  const [botName, setBotName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookKey, setWebhookKey] = useState("");
  const [inspected, setInspected] = useState(false);
  const verifyRequest = useRef<string | null>(null);
  const binding = state.data?.binding, routine = binding?.routine, exchange = routine?.lastExchange;
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: key });
    if (companyId && agentId) await cache.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
  };
  const pair = useMutation({ mutationFn: async () => { setPairing(await grokBotApi.pair(companyId!, agentId!, binding?.status === "pairing" ? binding.id : undefined)); }, onSuccess: refresh, gcTime: 0 });
  const configure = useMutation({ mutationFn: async () => {
    await grokBotApi.configure(companyId!, agentId!, { bindingId: binding!.id, expectedRevision: routine?.revision ?? 0, botName, webhookUrl, webhookKey });
    setWebhookUrl(""); setWebhookKey(""); setReplace(false); verifyRequest.current = null;
  }, onSuccess: refresh, gcTime: 0 });
  const verify = useMutation({ mutationFn: async () => {
    if (["rejected", "cancelled"].includes(exchange?.status ?? "")) verifyRequest.current = null;
    verifyRequest.current ??= crypto.randomUUID();
    await grokBotApi.verify(companyId!, agentId!, binding!.id, verifyRequest.current);
  }, onSuccess: refresh, gcTime: 0 });
  const retryDelivery = useMutation({ mutationFn: (correlationId: string) => grokBotApi.retry(companyId!, agentId!, correlationId), onSuccess: refresh });
  const disconnect = useMutation({ mutationFn: () => grokBotApi.disconnect(companyId!, agentId!), onSuccess: async () => { setPairing(null); await refresh(); } });
  const recover = useMutation({ mutationFn: () => grokBotApi.recover(companyId!, agentId!), onSuccess: async () => { setInspected(false); verifyRequest.current = null; await refresh(); } });
  const stop = useMutation({ mutationFn: (runId: string) => grokBotApi.stop(companyId!, agentId!, runId), onSuccess: refresh });
  useEffect(() => { if (routine?.botName) setBotName(routine.botName); }, [routine?.botName]);
  useEffect(() => {
    if (!pairing) return;
    const timer = window.setTimeout(() => setPairing(null), Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pairing]);
  if (!agentId) return <p className="text-sm text-muted-foreground">{t("grokBotConnection.saveAgentFirst", { defaultValue: "Save the Grok Bot agent before connecting it." })}</p>;
  const busy = pair.isPending || configure.isPending || verify.isPending || disconnect.isPending || recover.isPending || stop.isPending || retryDelivery.isPending;
  const error = state.error ?? pair.error ?? configure.error ?? verify.error ?? disconnect.error ?? recover.error ?? stop.error ?? retryDelivery.error;
  const recovering = state.data?.recoveryNeeded || routine?.recoveryNeeded;
  const pending = exchange && ["prepared", "sending", "accepted"].includes(exchange.status) && Date.parse(exchange.expiresAt) > Date.now();
  return <section aria-label={t("grokBotConnection.sectionAria", { defaultValue: "Grok Bot connection" })} className="space-y-4 text-sm">
    <p className="text-muted-foreground">{t("grokBotConnection.intro", { defaultValue: "Runs in Grok Bot. The Bot retains its apps and persistent context. Paperclip supplies task coordination and first-party tools. Usage and spending are not reported." })}</p>
    {state.isPending && <p role="status">{t("grokBotConnection.loading", { defaultValue: "Loading connection…" })}</p>}
    {error && <p role="alert" className="text-destructive">{describeError(error).body}</p>}
    {state.data && !state.data.enabled && <p className="text-muted-foreground">{t("grokBotConnection.disabled", { defaultValue: "Enable Grok Bot, Assistant connections (MCP), and Paperclip Runner on an authenticated public HTTPS instance." })}</p>}
    {binding?.connected ? <>
      <p>{t("grokBotConnection.connectedPrefix", { defaultValue: "Agent access connected. " })}{routine?.verified && !recovering ? t("grokBotConnection.routineVerified", { defaultValue: "Routine round trip verified." }) : t("grokBotConnection.routineUnverified", { defaultValue: "Assignments require a verified routine round trip." })}</p>
      <dl className="space-y-2 text-muted-foreground"><div><dt>{t("grokBotConnection.rows.bot", { defaultValue: "Bot" })}</dt><dd>{routine?.botName ?? t("grokBotConnection.notConfigured", { defaultValue: "Not configured" })}</dd></div><div><dt>{t("grokBotConnection.rows.lastVerifiedExchange", { defaultValue: "Last verified exchange" })}</dt><dd>{routine?.verifiedAt ? new Date(routine.verifiedAt).toLocaleString() : t("grokBotConnection.notYetVerified", { defaultValue: "Not yet verified" })}</dd></div><div><dt>{t("grokBotConnection.rows.lastAuthenticatedContact", { defaultValue: "Last authenticated contact" })}</dt><dd>{routine?.lastContactAt ? new Date(routine.lastContactAt).toLocaleString() : t("grokBotConnection.notYetObserved", { defaultValue: "Not yet observed" })}</dd></div></dl>
      {exchange && <p>{t("grokBotConnection.delivery", {
        delivered: ["accepted", "acknowledged"].includes(exchange.status) ? t("grokBotConnection.yes", { defaultValue: "Yes" }) : t("grokBotConnection.unconfirmed", { defaultValue: "Unconfirmed" }),
        reply: exchange.acknowledgedAt ? t("grokBotConnection.yes", { defaultValue: "Yes" }) : t("grokBotConnection.no", { defaultValue: "No" }),
        defaultValue: "Assignment delivered: {{delivered}}. Reply received: {{reply}}.",
      })}</p>}
      {exchange?.status === "rejected" && <div className="space-y-2"><p>{t("grokBotConnection.rejected", { defaultValue: "The routine rejected this delivery. Check the routine in Grok before retrying." })}</p><Button variant="outline" disabled={busy || recovering} onClick={() => retryDelivery.mutate(exchange.id)}>{t("grokBotConnection.retryRejected", { defaultValue: "Retry rejected delivery" })}</Button></div>}
      {!routine?.configured || replace ? <div className="space-y-3">
        <label className="block space-y-2"><span>{t("grokBotConnection.botName", { defaultValue: "Bot name in Grok" })}</span><Input value={botName} onChange={e => setBotName(e.target.value)} maxLength={100} /></label>
        <AgentSetupPrompt prompt={buildGrokRoutinePrompt(binding.id, botName || "your Bot")} label={t("grokBotConnection.routineCopyLabel", { defaultValue: "Copy routine instructions" })} title={t("grokBotConnection.routineTitle", { defaultValue: "Enable assignments" })} description={t("grokBotConnection.routineDescription", { defaultValue: "Ask the Bot for a Webhook URL navigation link if clicking its routine does nothing." })} />
        <label className="block space-y-2"><span>{t("grokBotConnection.webhookUrl", { defaultValue: "Webhook URL" })}</span><Input type="password" autoComplete="off" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} /></label>
        <label className="block space-y-2"><span>{t("grokBotConnection.webhookKey", { defaultValue: "Webhook key" })}</span><Input type="password" autoComplete="off" value={webhookKey} onChange={e => setWebhookKey(e.target.value)} /></label>
        <Button disabled={busy || recovering || !botName.trim() || !webhookUrl || !webhookKey} onClick={() => configure.mutate()}>{t("grokBotConnection.saveRoutine", { defaultValue: "Save routine" })}</Button>
      </div> : <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !!pending || recovering || !!binding.assignment} onClick={() => verify.mutate()}>{t("grokBotConnection.verifyConnection", { defaultValue: "Verify connection" })}</Button>
        <Button variant="outline" disabled={busy || recovering || !!binding.assignment} onClick={() => setReplace(true)}>{t("grokBotConnection.replaceCredentials", { defaultValue: "Replace routine credentials" })}</Button>
      </div>}
    </> : <>
      <Button disabled={busy || !state.data?.enabled || !state.data.canConfigureConnection} onClick={() => pair.mutate()}>{t("grokBotConnection.reconnectAccess", { defaultValue: "Reconnect agent access" })}</Button>
      {pairing && state.data?.resourceUrl && <>
        <AgentSetupPrompt prompt={buildGrokAccessPrompt(state.data.resourceUrl, botName || "your Bot")} label={t("grokBotConnection.accessCopyLabel", { defaultValue: "Copy connection instructions" })} title={t("grokBotConnection.reconnectTitle", { defaultValue: "Reconnect Grok Bot" })} description={t("grokBotConnection.reconnectDescription", { defaultValue: "Complete OAuth in the browser. Keep this code out of Bot chat." })} />
        <div className="space-y-2">
          <label htmlFor={pairingCodeId}>{t("grokBotConnection.pairingCode", { defaultValue: "One-use pairing code" })}</label>
          <div className="flex items-center gap-2">
            <Input id={pairingCodeId} type="password" autoComplete="off" readOnly value={pairing.pairingCode} onFocus={e => e.target.select()} />
            <CopyText text={pairing.pairingCode} ariaLabel={t("grokBotConnection.copyPairingCodeAria", { defaultValue: "Copy pairing code" })} className={buttonVariants({ variant: "outline", size: "sm" })}>{t("grokBotConnection.copyCode", { defaultValue: "Copy code" })}</CopyText>
          </div>
          <p className="text-xs text-muted-foreground">{t("grokBotConnection.pairingCodeHelp", { defaultValue: "Copy this code into Paperclip’s authorization page. Keep it out of Bot chat." })}</p>
        </div>
      </>}
    </>}
    {binding?.assignment && <div className="space-y-2"><p>{binding.assignment.status === "offered" ? t("grokBotConnection.assignmentOffered", { defaultValue: "Awaiting acknowledgement" }) : t("grokBotConnection.assignmentWorking", { defaultValue: "Working in a Paperclip work session" })}</p><Button variant="outline" disabled={busy} onClick={() => stop.mutate(binding.assignment!.runId)}>{t("grokBotConnection.stopWork", { defaultValue: "Stop Paperclip work" })}</Button><p className="text-xs text-muted-foreground">{t("grokBotConnection.stopWorkHelp", { defaultValue: "Revokes this session’s Paperclip authority and stops future dispatch. Remote execution may continue. Open Grok Bot to inspect it." })}</p></div>}
    {recovering && <div className="space-y-3 rounded-md border border-border p-3">
      <p className="font-medium">{t("grokBotConnection.recovery.title", { defaultValue: "Recovery needed" })}</p><p className="text-muted-foreground">{t("grokBotConnection.recovery.body", { defaultValue: "Paperclip cannot determine whether Grok is still working. Open Grok Bot, inspect this Bot and stop the old work before clearing the hold. The session must be stopped in Paperclip too." })}</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={inspected} onChange={e => setInspected(e.target.checked)} /><span>{t("grokBotConnection.recovery.inspected", { defaultValue: "I inspected Grok and resolved the old work." })}</span></label>
      <Button variant="outline" disabled={busy || !inspected || !!binding?.assignment} onClick={() => recover.mutate()}>{t("grokBotConnection.recovery.clear", { defaultValue: "Clear recovery hold" })}</Button>
      <p className="text-xs text-muted-foreground">{t("grokBotConnection.recovery.help", { defaultValue: "This records your inspection. It does not confirm remote termination. Verify the routine again before new work." })}</p>
    </div>}
    {binding?.connected && <Button variant="outline" disabled={busy} onClick={() => disconnect.mutate()}>{t("grokBotConnection.disconnectAccess", { defaultValue: "Disconnect agent access" })}</Button>}
  </section>;
}
