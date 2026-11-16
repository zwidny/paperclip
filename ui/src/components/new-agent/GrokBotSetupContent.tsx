import { useId } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { AGENT_ROLES, type CreateGrokInvitation, type DotPairing, type GrokConnection } from "@paperclipai/shared";
import { AdapterMark } from "../AdapterMark";
import { AgentSetupPrompt } from "../AgentSetupPrompt";
import { Button, buttonVariants } from "../ui/button";
import { CopyText } from "../CopyText";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/select";
import { DialogDescription, DialogTitle } from "../ui/dialog";
import { buildGrokAccessPrompt, buildGrokRoutinePrompt } from "@/lib/grok-bot-setup-prompt";
import { Link } from "@/lib/router";
import { useTranslation } from "../../i18n";

export type GrokSetupStep = 0 | 1 | 2 | 3;
export interface GrokBotSetupContentProps {
  step: GrokSetupStep; companyName: string; details: CreateGrokInvitation;
  created: boolean; loading?: boolean; busy?: boolean; error?: string;
  managers: Array<{ id: string; name: string }>;
  connection?: GrokConnection; pairing: DotPairing | null; approvalHref?: string;
  webhookUrl: string; webhookKey: string; editingCredentials?: boolean;
  onEditCredentials?: () => void;
  onDetails: (details: CreateGrokInvitation) => void;
  onCredentials: (url: string, key: string) => void;
  onBack: () => void; onExit: () => void; onNext: () => void; onRetry: () => void;
}
const steps = [
  { key: "identify", label: "Identify Bot" },
  { key: "access", label: "Connect access" },
  { key: "assignments", label: "Enable assignments" },
  { key: "verify", label: "Verify" },
];
export function GrokBotSetupContent(p: GrokBotSetupContentProps) {
  const { t } = useTranslation();
  const pairingCodeId = useId();
  const binding = p.connection?.binding;
  const routine = binding?.routine;
  const exchange = routine?.lastExchange;
  const delivered = exchange?.status === "accepted" || exchange?.status === "acknowledged";
  const replied = !!routine?.verified && exchange?.status === "acknowledged";
  const ready = replied && p.connection?.agentLifecycleState === "ready" && !!p.connection.canConfigureConnection && !routine?.recoveryNeeded;
  const pending = exchange && ["prepared", "sending", "accepted"].includes(exchange.status) && Date.parse(exchange.expiresAt) > Date.now();
  const nextDisabled = p.busy || p.loading || !!p.approvalHref
    || p.step === 0 && (!p.details.name.trim() || !p.details.botName.trim())
    || p.step === 1 && !binding?.connected
    || p.step === 2 && ((!routine?.configured || p.editingCredentials) && (!p.webhookUrl || !p.webhookKey))
    || p.step === 3 && !ready && (!!pending || !!routine?.recoveryNeeded || !!replied);
  return <>
    <div className="min-h-0 space-y-6 overflow-y-auto px-6 pb-6 pt-8 sm:px-8">
      <div className="space-y-3 pr-5">
        <AdapterMark type="grok_bot" className="size-10" />
        <DialogTitle className="text-xl font-semibold tracking-tight">{ready ? t("grokBotSetup.readyTitle", { defaultValue: "Your Grok Bot is connected" }) : t("grokBotSetup.connectTitle", { defaultValue: "Connect your Grok Bot" })}</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed">{ready ? t("grokBotSetup.readyDescription", { defaultValue: "{{botName}} can receive assignments and work with {{companyName}}.", botName: p.details.botName, companyName: p.companyName }) : t("grokBotSetup.connectDescription", { defaultValue: "Bring an existing Bot into {{companyName}}. It continues to run in Grok Bot.", companyName: p.companyName })}</DialogDescription>
      </div>
      <ol aria-label={t("grokBotSetup.stepsAria", { defaultValue: "Grok Bot setup" })} className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
        {steps.map((step, index) => <li key={step.key} aria-current={p.step === index ? "step" : undefined} className={p.step === index ? "font-medium text-foreground" : ""}>{index + 1}. {t(`grokBotSetup.steps.${step.key}`, { defaultValue: step.label })}</li>)}
      </ol>
      {p.error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{p.error}</p><Button variant="outline" disabled={p.busy} onClick={p.onRetry}>{t("common.tryAgain", { defaultValue: "Try again" })}</Button></div>}
      {p.loading ? <p role="status" className="text-sm text-muted-foreground">{t("grokBotSetup.restoring", { defaultValue: "Restoring saved setup…" })}</p> : p.approvalHref ? <p className="text-sm text-muted-foreground">{t("grokBotSetup.approvalPending", { defaultValue: "An organization admin needs to approve this agent. Setup is saved and will resume after approval." })}</p> : <>
        {p.step === 0 && <div className="space-y-4">
          <label className="block space-y-2 text-sm"><span>{t("grokBotSetup.paperclipName", { defaultValue: "Paperclip name" })}</span><Input value={p.details.name} disabled={p.created} onChange={e => p.onDetails({ ...p.details, name: e.target.value })} autoComplete="off" maxLength={100} /></label>
          <label className="block space-y-2 text-sm"><span>{t("grokBotSetup.botName", { defaultValue: "Bot name in Grok" })}</span><Input value={p.details.botName} disabled={p.created} onChange={e => p.onDetails({ ...p.details, botName: e.target.value })} autoComplete="off" maxLength={100} /></label>
          <p className="text-xs text-muted-foreground">{t("grokBotSetup.botNameHelp", { defaultValue: "Use the name shown in the Grok Bot desktop app. Bot web links may no longer work." })}</p>
          <label className="block space-y-2 text-sm"><span>{t("grokBotSetup.role", { defaultValue: "Role" })}</span><NativeSelect disabled={p.created} value={p.details.role ?? "general"} onChange={e => p.onDetails({ ...p.details, role: e.target.value as CreateGrokInvitation["role"] })}>{AGENT_ROLES.map(role => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</NativeSelect></label>
          <label className="block space-y-2 text-sm"><span>{t("grokBotSetup.manager", { defaultValue: "Manager" })}</span><NativeSelect disabled={p.created} value={p.details.reportsTo ?? ""} onChange={e => p.onDetails({ ...p.details, reportsTo: e.target.value || null })}><option value="">{t("grokBotSetup.noManager", { defaultValue: "No manager" })}</option>{p.managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</NativeSelect></label>
        </div>}
        {p.step === 1 && <div className="space-y-4 text-sm">
          <p>{t("grokBotSetup.accessInstructions", { defaultValue: "Copy the connection instructions into your Bot’s chat. Add the custom MCP plugin and complete its browser authorization." })}</p>
          {p.connection?.resourceUrl && <AgentSetupPrompt prompt={buildGrokAccessPrompt(p.connection.resourceUrl, p.details.botName)} label={t("grokBotSetup.accessCopyLabel", { defaultValue: "Copy connection instructions" })} title={t("grokBotSetup.accessTitle", { defaultValue: "Connect Paperclip access" })} description={t("grokBotSetup.accessDescription", { defaultValue: "Send these instructions to your Bot. The pairing code stays in your browser." })} />}
          {!binding?.connected && p.pairing && <div className="space-y-2">
            <label htmlFor={pairingCodeId}>{t("grokBotSetup.pairingCode", { defaultValue: "One-use pairing code" })}</label>
            <div className="flex items-center gap-2">
              <Input id={pairingCodeId} value={p.pairing.pairingCode} readOnly type="password" autoComplete="off" />
              <CopyText text={p.pairing.pairingCode} ariaLabel={t("grokBotSetup.copyPairingCodeAria", { defaultValue: "Copy pairing code" })} className={buttonVariants({ variant: "outline", size: "sm" })}>{t("grokBotSetup.copyCode", { defaultValue: "Copy code" })}</CopyText>
            </div>
            <p className="text-xs text-muted-foreground">{t("grokBotSetup.pairingCodeHelp", { defaultValue: "Copy this code into Paperclip’s authorization page. Do not paste it into Bot chat. Expires {{time}}.", time: new Date(p.pairing.expiresAt).toLocaleTimeString() })}</p>
          </div>}
          <p role="status" aria-live="polite" className="text-muted-foreground">{binding?.connected ? t("grokBotSetup.connectedStatus", { defaultValue: "Agent access connected." }) : t("grokBotSetup.watchingStatus", { defaultValue: "Watching for authorization. This connection works as the named agent." })}</p>
          <p className="text-xs text-muted-foreground">{t("grokBotSetup.pluginScope", { defaultValue: "Grok plugins are account-wide. Linking one Bot does not isolate its credentials from other Bots on your account." })}</p>
        </div>}
        {p.step === 2 && <div className="space-y-4 text-sm">
          <p>{t("grokBotSetup.routineInstructions", { defaultValue: "Ask your Bot to create a webhook-only routine, then open its Webhook panel in the desktop app." })}</p>
          {binding && <AgentSetupPrompt prompt={buildGrokRoutinePrompt(binding.id, p.details.botName)} label={t("grokBotSetup.routineCopyLabel", { defaultValue: "Copy routine instructions" })} title={t("grokBotSetup.routineTitle", { defaultValue: "Enable assignments" })} description={t("grokBotSetup.routineDescription", { defaultValue: "Send this to the connected Bot. The routine wakes it when Paperclip work changes." })} />}
          <p className="text-xs text-muted-foreground">{t("grokBotSetup.routineNavigationHelp", { defaultValue: "If clicking the routine does nothing, use the “Webhook URL” navigation link the Bot supplies." })}</p>
          {routine?.configured && !p.editingCredentials && !p.webhookUrl && !p.webhookKey ? <div className="space-y-2"><p role="status" className="text-muted-foreground">{t("grokBotSetup.credentialsStored", { defaultValue: "Routine credentials are stored. Continue to verify both directions." })}</p>{p.onEditCredentials && <Button variant="outline" onClick={p.onEditCredentials} disabled={p.busy}>{t("grokBotSetup.replaceCredentials", { defaultValue: "Replace routine credentials" })}</Button>}</div> : <>
            <label className="block space-y-2"><span>{t("grokBotSetup.webhookUrl", { defaultValue: "Webhook URL" })}</span><Input value={p.webhookUrl} onChange={e => p.onCredentials(e.target.value, p.webhookKey)} type="password" autoComplete="off" spellCheck={false} /></label>
            <label className="block space-y-2"><span>{t("grokBotSetup.webhookKey", { defaultValue: "Webhook key" })}</span><Input value={p.webhookKey} onChange={e => p.onCredentials(p.webhookUrl, e.target.value)} type="password" autoComplete="off" spellCheck={false} /></label>
          </>}
          <p className="text-xs text-muted-foreground">{t("grokBotSetup.credentialHelp", { defaultValue: "Copy these fields directly from Grok into Paperclip. Credentials are stored securely and are never included in instructions." })}</p>
        </div>}
        {p.step === 3 && <section aria-label={t("grokBotSetup.checksAria", { defaultValue: "Grok connection checks" })} className="space-y-4 text-sm">
          {[{ label: t("grokBotSetup.checks.delivered", { defaultValue: "Assignment delivered" }), done: delivered }, { label: t("grokBotSetup.checks.replied", { defaultValue: "Reply received" }), done: replied }].map(check => <p key={check.label} className="flex items-center gap-3">{check.done ? <Check className="size-4" /> : pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Circle className="size-4 text-muted-foreground" />}{check.label}<span className="text-muted-foreground">{check.done ? t("grokBotSetup.checks.complete", { defaultValue: "Complete" }) : t("grokBotSetup.checks.waiting", { defaultValue: "Waiting" })}</span></p>)}
          <p role="status" aria-live="polite" className="text-muted-foreground">{routine?.recoveryNeeded ? t("grokBotSetup.status.recovery", { defaultValue: "Recovery needed. Inspect Grok’s activity in this agent’s configuration before another delivery." }) : ready ? t("grokBotSetup.status.verifiedReady", { defaultValue: "Both directions verified. Your Bot is ready for tasks." }) : replied ? t("grokBotSetup.status.verifiedFinishing", { defaultValue: "Both directions verified. Paperclip is finishing agent setup." }) : exchange?.status === "rejected" ? t("grokBotSetup.status.rejected", { defaultValue: "The routine rejected delivery. Check its URL and key, then try again." }) : delivered ? t("grokBotSetup.status.accepted", { defaultValue: "The routine accepted delivery. Waiting for an authenticated reply to Paperclip." }) : t("grokBotSetup.status.challenge", { defaultValue: "Send a harmless challenge. This creates no task." })}</p>
          <p className="text-xs text-muted-foreground">{t("grokBotSetup.externalNote", { defaultValue: "Grok runs externally. Usage and spending are not reported. Paperclip contact does not prove the Bot is continuously available." })}</p>
        </section>}
      </>}
    </div>
    <div className="flex items-center justify-between gap-3 border-t px-6 py-4 sm:px-8">
      <div className="flex items-center gap-2"><Button variant="ghost" onClick={p.onBack} disabled={p.busy}>{t("common.back", { defaultValue: "Back" })}</Button><Button variant="ghost" onClick={p.onExit} disabled={p.busy}>{t("newAgent.saveAndExit", { defaultValue: "Save & exit" })}</Button></div>
      {p.approvalHref ? <Button asChild><Link to={p.approvalHref} onClick={p.onExit}>{t("grokBotSetup.actions.reviewApproval", { defaultValue: "Review approval" })}</Link></Button> : <Button onClick={p.onNext} disabled={nextDisabled}>{p.busy ? t("common.saving", { defaultValue: "Saving…" }) : ready ? t("common.done", { defaultValue: "Done" }) : p.step === 3 ? pending ? t("grokBotSetup.actions.waitingForReply", { defaultValue: "Waiting for reply…" }) : replied ? t("grokBotSetup.actions.finishingSetup", { defaultValue: "Finishing setup…" }) : t("grokBotSetup.actions.verifyConnection", { defaultValue: "Verify connection" }) : t("grokBotSetup.actions.continue", { defaultValue: "Continue" })}</Button>}
    </div>
  </>;
}
