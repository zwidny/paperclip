import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { VoiceCallHistoryEntry, VoiceCallReport, VoiceUnapprovedCallHistoryEntry } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { voiceSessionsApi } from "@/api/voiceSessions";
import { voicePhoneApi } from "@/api/voicePhone";
import { voiceHistoryApi } from "@/api/voiceHistory";
import { i18n, useTranslation } from "@/i18n";
import { ANALYTICS_MASK_CLASS } from "@/lib/analytics/privacy";
import { cn } from "@/lib/utils";

function charge(amount: string | null) {
  if (amount === null) return i18n.t("spekoCallHistory.notYetReported", { defaultValue: "Not yet reported" });
  const value = BigInt(amount);
  const whole = value / 1_000_000n, fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return `$${whole}.${fraction} USD`;
}
export function SpekoCallReport({ report }: { report: VoiceCallReport }) {
  const { t } = useTranslation();
  return <div className="space-y-3">
    <dl className="flex flex-wrap gap-4 text-sm"><div><dt className="text-muted-foreground">{t("spekoCallHistory.spekoCharge", { defaultValue: "Speko charge" })}</dt><dd>{charge(report.costMicroUsd)}</dd></div>{report.durationSeconds !== null && <div><dt className="text-muted-foreground">{t("spekoCallHistory.duration", { defaultValue: "Duration" })}</dt><dd>{t("spekoCallHistory.seconds", { defaultValue: "{{seconds}} seconds", seconds: report.durationSeconds })}</dd></div>}</dl>
    <p className="text-xs text-muted-foreground">{t("spekoCallHistory.costsSeparate", { defaultValue: "Agent costs are separate. Recordings remain in Speko." })}</p>
    {report.transcript.length ? <ol aria-label={t("spekoCallHistory.callTranscript", { defaultValue: "Call transcript" })} className={cn("space-y-3", ANALYTICS_MASK_CLASS)}>{report.transcript.map(turn => <li key={turn.id} className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{turn.speaker === "caller"
          ? t("spekoCallHistory.you", { defaultValue: "You" })
          : t("spekoCallHistory.agent", { defaultValue: "Agent" })}{turn.interrupted ? t("spekoCallHistory.interruptedSuffix", { defaultValue: " · interrupted" }) : ""}</p><p className="whitespace-pre-wrap break-words text-sm">{turn.text}</p></li>)}</ol>
      : <p className="text-sm text-muted-foreground">{report.status === "unavailable"
        ? t("spekoCallHistory.transcriptUnavailable", { defaultValue: "The transcript is unavailable. Paperclip will retry while Speko finishes the report." })
        : report.status === "pending"
          ? t("spekoCallHistory.transcriptPending", { defaultValue: "The transcript will appear after Speko finishes the call report." })
          : t("spekoCallHistory.transcriptMissing", { defaultValue: "Speko did not provide a transcript for this call." })}</p>}
  </div>;
}
const modeNames = {
  browser: { key: "spekoCallHistory.modeBrowser", defaultValue: "Browser voice" },
  inbound_phone: { key: "spekoCallHistory.modeInboundPhone", defaultValue: "Incoming call" },
  outbound_phone: { key: "spekoCallHistory.modeOutboundPhone", defaultValue: "Outgoing call" },
} as const;
const stateNames = {
  reserved: { key: "spekoCallHistory.stateReserved", defaultValue: "Preparing" },
  creating: { key: "spekoCallHistory.stateCreating", defaultValue: "Connecting" },
  creation_unknown: { key: "spekoCallHistory.stateCreationUnknown", defaultValue: "Checking connection" },
  connecting: { key: "spekoCallHistory.stateConnecting", defaultValue: "Connecting" },
  active: { key: "spekoCallHistory.stateActive", defaultValue: "In progress" },
  awaiting_approval: { key: "spekoCallHistory.stateAwaitingApproval", defaultValue: "Awaiting approval" },
  ending: { key: "spekoCallHistory.stateEnding", defaultValue: "Ending" },
  ended: { key: "spekoCallHistory.stateEnded", defaultValue: "Completed" },
  failed: { key: "spekoCallHistory.stateFailed", defaultValue: "Failed" },
  expired: { key: "spekoCallHistory.stateExpired", defaultValue: "Expired" },
} as const;
export function SpekoCallActivityItem({ entry: { session, report }, onEnd, ending, presentation = "history" }: { entry: VoiceCallHistoryEntry; onEnd?(sessionId: string): void; ending?: boolean; presentation?: "history" | "activity" }) {
  const { t } = useTranslation();
  const summary = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current && ["ended", "failed", "expired"].includes(session.state)) { summary.current?.focus(); restoreFocus.current = false; }
  }, [session.state]);
  return <details data-activity-kind="call" className={presentation === "activity" ? "px-2 py-3 transition-colors hover:bg-accent/50" : "rounded-md border border-border p-3"}>
    <summary ref={summary} className="cursor-pointer break-words text-sm font-medium">{t(modeNames[session.mode].key, { defaultValue: modeNames[session.mode].defaultValue })} · {t(stateNames[session.state].key, { defaultValue: stateNames[session.state].defaultValue })}<span className="ml-2 text-xs font-normal text-muted-foreground">{new Date(session.createdAt).toLocaleString()}</span></summary>
    <div className="mt-3 space-y-3"><Link className="text-sm text-primary underline" to={`/issues/${encodeURIComponent(session.issueId)}`}>{t("spekoCallHistory.conversationTask", { defaultValue: "Conversation task" })}</Link>
      {session.errorCode && <p className="text-sm text-muted-foreground">{session.errorCode === "cleanup_pending"
          ? t("spekoCallHistory.cleanupPending", { defaultValue: "Confirming call cleanup with Speko." })
          : t("spekoCallHistory.connectionProblem", { defaultValue: "This call encountered a connection problem. Check your Speko connection before trying again." })}</p>}
      {!session.endedAt && !["ended", "failed", "expired"].includes(session.state) && session.callerAuthority !== "guest_intake" && onEnd && <Button size="sm" variant="outline" disabled={ending} onClick={() => { restoreFocus.current = true; onEnd(session.id); }}>{ending
          ? t("spekoCallHistory.ending", { defaultValue: "Ending…" })
          : t("spekoCallHistory.endCall", { defaultValue: "End call" })}</Button>}
      <SpekoCallReport report={report} />
    </div>
  </details>;
}
export function SpekoUnapprovedCallActivityItem({ call, presentation = "history" }: { call: VoiceUnapprovedCallHistoryEntry; presentation?: "history" | "activity" }) {
  const { t } = useTranslation();
  return <div data-activity-kind="unapproved_call" className={presentation === "activity" ? "px-2 py-3 text-sm" : "rounded-md border border-border p-3 text-sm"}><p>{call.state === "denied"
      ? t("spekoCallHistory.callDenied", { defaultValue: "Call denied" })
      : call.state === "expired"
        ? t("spekoCallHistory.approvalExpired", { defaultValue: "Approval expired" })
        : t("spekoCallHistory.missedCall", { defaultValue: "Missed call" })} · {new Date(call.createdAt).toLocaleString()}</p><p className="text-xs text-muted-foreground">{t("spekoCallHistory.noPrivateTask", { defaultValue: "No private task was connected." })}</p></div>;
}
export interface SpekoCallHistoryViewProps { entries?: VoiceCallHistoryEntry[]; unapprovedCalls?: VoiceUnapprovedCallHistoryEntry[]; loading?: boolean; error?: string; incomingError?: string; endError?: string; onRetry(): void; onEnd?(sessionId: string): void; endingSessionId?: string }
export function SpekoCallHistoryView({ entries = [], unapprovedCalls = [], loading, error, incomingError, endError, onRetry, onEnd, endingSessionId }: SpekoCallHistoryViewProps) {
  const { t } = useTranslation();
  return <section className="max-w-xl space-y-3" aria-label={t("spekoCallHistory.title", { defaultValue: "Your calls" })}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t("spekoCallHistory.title", { defaultValue: "Your calls" })}</h2><Button size="sm" variant="ghost" onClick={onRetry} disabled={loading}>{t("spekoCallHistory.refresh", { defaultValue: "Refresh" })}</Button></div>
    {loading && <p role="status" className="text-sm text-muted-foreground">{t("spekoCallHistory.loading", { defaultValue: "Loading calls…" })}</p>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onClick={onRetry}>{t("common.tryAgain", { defaultValue: "Try again" })}</Button></div>}
    {incomingError && <p role="alert" className="text-sm text-destructive">{t("spekoCallHistory.incomingLoadFailed", { defaultValue: "Unapproved calls could not be loaded. {{message}}", message: incomingError })}</p>}
    {endError && <p role="alert" className="text-sm text-destructive">{t("spekoCallHistory.endFailed", { defaultValue: "The call could not be ended. {{message}}", message: endError })}</p>}
    {!loading && !error && !incomingError && !entries.length && !unapprovedCalls.length && <p className="text-sm text-muted-foreground">{t("spekoCallHistory.empty", { defaultValue: "Your browser conversations and phone calls will appear here." })}</p>}
    {!error && entries.map(entry => <SpekoCallActivityItem key={entry.session.id} entry={entry} onEnd={onEnd} ending={endingSessionId === entry.session.id} />)}
    {!incomingError && unapprovedCalls.length > 0 && <div className="space-y-2"><h3 className="text-sm font-medium">{t("spekoCallHistory.unapprovedCalls", { defaultValue: "Unapproved incoming calls" })}</h3><ul className="space-y-2">{unapprovedCalls.map(call => <li key={call.id}><SpekoUnapprovedCallActivityItem call={call} /></li>)}</ul></div>}
  </section>;
}
export function useSpekoCallHistory(companyId: string, endpointId: string, enabled = true) {
  const query = useQuery({ queryKey: ["speko-history", companyId, endpointId], queryFn: () => voiceHistoryApi.list(companyId, endpointId), enabled, refetchInterval: enabled ? 30_000 : false });
  const incoming = useQuery({queryKey: ["speko-unapproved-history", companyId, endpointId], queryFn: () => voicePhoneApi.history(companyId, endpointId), enabled: enabled && query.isSuccess, refetchInterval: enabled ? 30_000 : false});
  const ending = useMutation({mutationFn: (sessionId: string) => voiceSessionsApi.end(companyId, sessionId), onSuccess: () => query.refetch()});
  return { entries: query.data ?? [], unapprovedCalls: incoming.data ?? [], loading: query.isLoading || incoming.isLoading, error: query.error?.message, incomingError: incoming.error?.message, endError: ending.error?.message, endingSessionId: ending.isPending ? ending.variables : undefined,
    onEnd: (sessionId: string) => ending.mutate(sessionId), onRetry: () => { ending.reset(); void query.refetch(); void incoming.refetch(); } };
}
export function SpekoCallHistory({ companyId, endpointId }: { companyId: string; endpointId: string }) {
  return <SpekoCallHistoryView {...useSpekoCallHistory(companyId, endpointId)} />;
}
