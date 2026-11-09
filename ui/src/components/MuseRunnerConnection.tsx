import { describeError } from "@/api/errors";
import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { museDetectorCleanupAttestationSchema } from "@paperclipai/shared";
import type { MuseConnection, MusePairing, MuseAttestStopInput, MuseDetectorCleanupAttestationInput } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { useMuseConnection, useMuseConnectionState } from "@/hooks/useMuseConnection";
import { queryKeys } from "@/lib/queryKeys";
import { formatDateTime } from "@/lib/utils";
import { AgentSetupPrompt } from "./AgentSetupPrompt";
import { MuseConnectionChecks } from "./new-agent/ExternalAgentInviteContent";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useTranslation } from "../i18n";

export interface MuseConnectionDetailsProps {
  connection: MuseConnection;
  pairing?: MusePairing | null;
  busy?: boolean;
  error?: string;
  offline?: boolean;
  onTest: () => void;
  onRepair: () => void;
  onPause: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onAttest: (input: MuseAttestStopInput) => void;
  onAttestDetectorCleanup?: (input: MuseDetectorCleanupAttestationInput) => void;
}

/** The settings view uses the same connection evidence as the invitation. */
export function MuseConnectionDetails({ connection, pairing, busy, error, offline = false, onTest, onRepair, onPause, onDisconnect, onRefresh, onAttest, onAttestDetectorCleanup }: MuseConnectionDetailsProps) {
  const { t } = useTranslation();
  const b = connection.binding;
  const [attestation, setAttestation] = useState<MuseAttestStopInput | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [detectorSnapshot, setDetectorSnapshot] = useState<Omit<MuseDetectorCleanupAttestationInput, "observation" | "detectorRemoved"> | null>(null);
  const [detectorHookId, setDetectorHookId] = useState("");
  const [observationDigest, setObservationDigest] = useState("");
  const [detectorObservedAt, setDetectorObservedAt] = useState("");
  const detectorObservedAtValid = museDetectorCleanupAttestationSchema.shape.observation.shape.observedAt.safeParse(detectorObservedAt).success;
  const [detectorConfirmed, setDetectorConfirmed] = useState(false);
  const detectorIdentity = JSON.stringify([b?.id, b?.generation, b?.revision, b?.qualification?.id, b?.cleanup.hookScript, b?.cleanup.attestationEligible, offline]);
  useEffect(() => { setDetectorSnapshot(null); setObservationDigest(""); setDetectorObservedAt(""); setDetectorHookId(""); setDetectorConfirmed(false); }, [detectorIdentity]);
  const boundaryIdentity = JSON.stringify(b?.stop.boundary);
  const stopBindingRevision = b?.stop.bindingRevision;
  useEffect(() => { setAttestation(null); setConfirmed(false); }, [boundaryIdentity, stopBindingRevision]);
  const live = !!b && b.status !== "revoked";
  const state = useMuseConnectionState(connection, { offline });
  const testing = state.testing;
  const configure = !offline && connection.enabled && connection.canConfigureConnection && !!connection.publicOrigin;
  const timestamp = (value: string | null) => value ? formatDateTime(value, { includeSeconds: true }) : t("museConnection.notObserved", { defaultValue: "Not observed" });
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("museConnection.intro", { defaultValue: "Muse uses its own tools and permissions. Paperclip coordinates company tasks and questions. Provider usage and cost are unavailable." })}</p>
    {!connection.enabled && <p className="text-sm text-muted-foreground">{t("museConnection.disabled", { defaultValue: "Muse is disabled in experimental settings. Connection cleanup and stop evidence remain available." })}</p>}
    {!connection.publicOrigin && <p className="text-sm text-muted-foreground">{t("museConnection.publicOriginRequired", { defaultValue: "An authenticated instance with a public HTTPS URL is required to connect Muse." })}</p>}
    {b && <>
      <MuseConnectionChecks state={state} />
      <dl className="space-y-2 text-xs">
        {[
          [t("museConnection.rows.lastReceiverContact", { defaultValue: "Last persisted public receiver contact" }), timestamp(b.lastReceiverContactAt)],
          [t("museConnection.rows.workerActivity", { defaultValue: "Authenticated worker activity" }), timestamp(b.lastWorkerActivityAt)],
          [t("museConnection.rows.lastVerifiedReply", { defaultValue: "Last verified reply" }), timestamp(b.lastVerifiedReplyAt)],
          [t("museConnection.rows.credentialStatus", { defaultValue: "Credential status" }), b.credentialState],
          [t("museConnection.rows.refreshExpires", { defaultValue: "Refresh credential expires" }), timestamp(b.refreshExpiresAt)],
          [t("museConnection.rows.clientVersion", { defaultValue: "Client version" }), b.clientVersion ?? t("museConnection.notReported", { defaultValue: "Not reported" })],
          [t("museConnection.rows.liveAssignments", { defaultValue: "Live assignments" }), String(b.liveAssignments)],
          [t("museConnection.rows.uncertainOperations", { defaultValue: "Uncertain native operations" }), String(b.uncertainOperations)],
          [t("museConnection.rows.pendingAnswers", { defaultValue: "Pending answers" }), String(b.pendingInputs)],
          [t("museConnection.rows.usageAndCost", { defaultValue: "Usage and cost" }), t("museConnection.unavailable", { defaultValue: "Unavailable" })],
        ].map(([label, value]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">{t("museConnection.receiverContactLag", { seconds: Math.ceil(b.contactPersistenceLagMs / 1000), defaultValue: "Receiver contact is persisted in batches and may lag by up to {{seconds}} seconds. Public receiver checks are unverified. Only an authenticated reply confirms Muse can work." })}</p>
      {b.status === "revoked" && <p role="status" className="text-sm text-muted-foreground">{t("museConnection.revoked", { defaultValue: "Disconnected. Paperclip credentials and execution authority were revoked." })}</p>}
      {(b.cleanup.pending || b.status === "revoked") && <div className="space-y-2 text-sm text-muted-foreground">
        {"detectorRemovalRequested" in b.cleanup && b.cleanup.detectorRemovalRequested === true && !b.cleanup.detectorRemoved && <p>{t("museConnection.cleanup.removalRequested", { defaultValue: "Detector removal requested; completion is not confirmed." })}</p>}
        <p>{t("museConnection.cleanup.summary", {
          detector: b.cleanup.detectorEvidence?.source === "operator_runtime_attestation"
            ? t("museConnection.cleanup.detectorOperatorAttested", { defaultValue: "operator-attested" })
            : b.cleanup.detectorRemoved
              ? t("museConnection.cleanup.detectorAcknowledged", { defaultValue: "acknowledged" })
              : t("museConnection.cleanup.notConfirmed", { defaultValue: "not confirmed" }),
          worker: b.cleanup.workerQuiescenceReported
            ? t("museConnection.cleanup.workerReported", { defaultValue: "reported" })
            : t("museConnection.cleanup.notConfirmed", { defaultValue: "not confirmed" }),
          defaultValue: "Detector removal: {{detector}}. Worker quiescence: {{worker}}.",
        })}</p>
        {b.cleanup.authenticatedAfterRevocation === false && <p>{t("museConnection.cleanup.afterDisconnect", { defaultValue: "After disconnect, the receiver disables itself when it next reaches Paperclip. Cleanup cannot be confirmed through the revoked connection." })}</p>}
        {b.cleanup.expiresAt && <p className="text-xs">{t("museConnection.cleanup.expires", { date: formatDateTime(b.cleanup.expiresAt), defaultValue: "Cleanup capability expires {{date}}." })}</p>}
        {b.cleanup.detectorEvidence && <p>{t("museConnection.cleanup.recorded", {
          time: timestamp(b.cleanup.detectorEvidence.recordedAt),
          source: b.cleanup.detectorEvidence.source === "operator_runtime_attestation"
            ? t("museConnection.cleanup.operatorAttestationSource", { defaultValue: "operator attestation from a supported runtime hook listing" })
            : t("museConnection.cleanup.workerReportSource", { defaultValue: "authenticated worker report" }),
          defaultValue: "Recorded {{time}}: {{source}}. This is not independent provider confirmation.",
        })}</p>}
        {b.cleanup.attestationEligible && onAttestDetectorCleanup && !detectorSnapshot && <Button type="button" variant="outline" disabled={busy || offline} onClick={() => {
          if (!b.cleanup.hookScript) return;
          setDetectorSnapshot({ bindingId: b.id, generation: b.generation, expectedRevision: b.revision, qualificationId: b.qualification?.id ?? null, hookScript: b.cleanup.hookScript });
        }}>{t("museConnection.cleanup.recordObservation", { defaultValue: "Record detector removal observation" })}</Button>}
        <p>{t("museConnection.cleanup.separate", { defaultValue: "Detector removal, worker stopping, and sandbox cleanup are separate. Paperclip cannot verify every private Muse tool or stop all personal Muse conversations." })}</p>
      </div>}
      {b.stop.status !== "none" && <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{b.stop.status === "operator_attested" ? t("museConnection.stop.operatorAttested", { defaultValue: "You attested that this assignment’s Muse worker stopped." })
          : b.stop.status === "worker_reported" ? t("museConnection.stop.workerReported", { defaultValue: "Muse reported that this assignment’s worker is quiescent. Independent private effects remain unconfirmed." })
          : t("museConnection.stop.fenced", { defaultValue: "Paperclip fenced this assignment’s authority. Its external stop cannot be confirmed." })}</p>
        {b.stop.nativeEffectsUnknown && <p role="status" className="text-muted-foreground">{t("museConnection.stop.nativeEffectsUnknown", { defaultValue: "Native effect outcomes remain unknown and block replacement work. Worker attestation does not resolve or replay those effects." })}</p>}
        {b.stop.boundary && stopBindingRevision == null && b.stop.status !== "operator_attested" && <p role="status" className="text-muted-foreground">{t("museConnection.stop.revisionUnavailable", { defaultValue: "Stop binding revision is unavailable. Refresh to inspect this assignment before attesting." })}</p>}
        {b.stop.boundary && b.stop.status !== "operator_attested" && !attestation && <Button type="button" variant="outline" disabled={busy || stopBindingRevision == null} onClick={() => {
          if (!b.stop.boundary || stopBindingRevision == null) return;
          setAttestation({ boundary: { ...b.stop.boundary }, expectedRevision: stopBindingRevision, workerStopped: true }); setConfirmed(false);
        }}>{t("museConnection.stop.attestButton", { defaultValue: "Attest this worker stopped" })}</Button>}
      </div>}
    </>}
    {detectorSnapshot && <section aria-label={t("museConnection.detector.sectionAria", { defaultValue: "Record exact Muse detector removal" })} className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{t("museConnection.detector.title", { defaultValue: "Record an observation of this exact detector" })}</p>
      <p className="break-all font-mono text-xs">{detectorSnapshot.hookScript}</p>
      <p className="text-sm text-muted-foreground">{t("museConnection.detector.instructionsPrefix", { defaultValue: "Use Muse’s supported " })}<code>{"hooks.list({ include_disabled: true })"}</code>{t("museConnection.detector.instructionsSuffix", { defaultValue: " after revocation to verify this exact registered script is absent. Disabled checks, silence, or a removal request are insufficient. The retained hook ID and observation are your report. Paperclip does not verify installation, query Muse, or remove the hook." })}</p>
      <label className="block space-y-2 text-sm">{t("museConnection.detector.hookId", { defaultValue: "Registered hook ID" })}<Input aria-label={t("museConnection.detector.hookIdAria", { defaultValue: "Registered Muse hook ID" })} value={detectorHookId} onChange={event => { setDetectorHookId(event.target.value); setDetectorConfirmed(false); }} autoComplete="off" /></label>
      <label className="block space-y-2 text-sm">{t("museConnection.detector.observationDigest", { defaultValue: "Observation SHA-256" })}<Input aria-label={t("museConnection.detector.observationDigestAria", { defaultValue: "Detector removal observation SHA-256" })} value={observationDigest} onChange={event => { setObservationDigest(event.target.value); setDetectorConfirmed(false); }} autoComplete="off" /></label>
      <p className="text-xs text-muted-foreground">{t("museConnection.detector.digestHelp", { defaultValue: "Use the digest of the secret-free runtime observation. Do not paste the listing, a URL, credentials, or private tool output." })}</p>
      <label className="block space-y-2 text-sm">{t("museConnection.detector.observedAt", { defaultValue: "Observed at (UTC)" })}<Input aria-label={t("museConnection.detector.observedAtAria", { defaultValue: "Detector removal observed at (UTC)" })} value={detectorObservedAt} onChange={event => { setDetectorObservedAt(event.target.value); setDetectorConfirmed(false); }} placeholder="YYYY-MM-DDTHH:mm:ss.sssZ" autoComplete="off" /></label>
      <p className="text-xs text-muted-foreground">{t("museConnection.detector.observedAtHelp", { defaultValue: "Enter the actual runtime listing time, not the time you submit this form. Paperclip checks it against revocation and the qualification deadline." })}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={detectorConfirmed} onChange={event => setDetectorConfirmed(event.target.checked)} className="mt-1 accent-primary" /><span>{t("museConnection.detector.confirmLabel", { defaultValue: "I observed this exact hook absent in the supported runtime listing after revocation. This attests detector removal only, not worker stopping or private effects." })}</span></label>
      <div className="flex items-center justify-between gap-3"><Button type="button" variant="ghost" onClick={() => setDetectorSnapshot(null)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button><Button type="button" disabled={!detectorConfirmed || !detectorObservedAtValid || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(detectorHookId) || !/^[a-f0-9]{64}$/.test(observationDigest) || busy || offline} onClick={() => onAttestDetectorCleanup?.({ ...detectorSnapshot, detectorRemoved: true, observation: { method: "hooks.list", includeDisabled: true, hookId: detectorHookId, outcome: "exact_hook_absent", observedAt: detectorObservedAt, sha256: observationDigest } })}>{t("museConnection.detector.confirmButton", { defaultValue: "Confirm detector observation" })}</Button></div>
    </section>}
    {attestation && <section aria-label={t("museConnection.attest.sectionAria", { defaultValue: "Attest this Muse worker stopped" })} className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{t("museConnection.attest.title", { defaultValue: "Confirm the worker for this exact assignment stopped" })}</p>
      <dl className="space-y-2 text-xs">
        {Object.entries(attestation.boundary).map(([key, value]) => <div key={key} className="flex flex-wrap items-baseline justify-between gap-2"><dt className="text-muted-foreground">{key}</dt><dd className="break-all font-mono">{value === null ? t("museConnection.attest.none", { defaultValue: "None" }) : String(value)}</dd></div>)}
      </dl>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-primary" /><span>{t("museConnection.attest.confirmLabel", { defaultValue: "I have stopped this Muse worker for the named assignment and run. This does not certify independent private tools or unknown native effects." })}</span></label>
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => setAttestation(null)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
        <Button type="button" disabled={!confirmed || busy} onClick={() => onAttest(attestation)}>{t("museConnection.attest.confirmButton", { defaultValue: "Confirm worker stopped" })}</Button>
      </div>
    </section>}
    {pairing && !b?.paired && <div className="space-y-2">
      <AgentSetupPrompt key={pairing.bindingId + pairing.revision} prompt={pairing.setupInstruction} label={t("museConnection.pairing.copyLabel", { defaultValue: "Copy setup prompt" })} title={t("museConnection.pairing.title", { defaultValue: "Connect your Muse" })} agent={{ name: "Muse", icon: <Bot className="size-5" /> }} description={t("museConnection.pairing.description", { defaultValue: "Paste into your current Muse conversation. Complete Connect Paperclip if Muse asks, then approve the Paperclip hostname." })} />
      <p className="text-xs text-muted-foreground">{t("museConnection.pairing.expires", { date: formatDateTime(pairing.expiresAt), defaultValue: "One-use setup expires {{date}}. Muse keeps the connection credential in its secure vault. Hostname permission applies to future requests to this Paperclip hostname." })}</p>
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      {live && <Button type="button" variant="outline" disabled={!configure || b.credentialState !== "active" || !b.paired || busy || testing} onClick={onTest}>{testing ? t("museConnection.actions.testing", { defaultValue: "Testing background reply…" }) : t("museConnection.actions.test", { defaultValue: "Test background reply" })}</Button>}
      <Button type="button" variant="outline" disabled={!configure || busy} onClick={onRepair}>{b?.credentialState === "expired" ? t("museConnection.actions.reconnect", { defaultValue: "Reconnect Muse" }) : live ? t("museConnection.actions.repair", { defaultValue: "Repair connection" }) : t("museConnection.actions.connect", { defaultValue: "Connect Muse" })}</Button>
      {connection.agentStatus !== "paused" && connection.agentStatus !== "terminated" && <Button type="button" variant="outline" disabled={busy} onClick={onPause}>{t("museConnection.actions.pauseAgent", { defaultValue: "Pause agent" })}</Button>}
      {live && <Button type="button" variant="outline" disabled={busy} onClick={onDisconnect}>{t("museConnection.actions.disconnect", { defaultValue: "Disconnect" })}</Button>}
      <Button type="button" variant="ghost" disabled={busy} onClick={onRefresh}>{t("museConnection.actions.refresh", { defaultValue: "Refresh" })}</Button>
      <Button type="button" asChild variant="ghost"><a href="https://muse.ai" target="_blank" rel="noopener noreferrer">{t("museConnection.actions.openMuse", { defaultValue: "Open Muse" })}</a></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function MuseRunnerConnection({ companyId, agentId }: { companyId?: string; agentId?: string }) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const muse = useMuseConnection(companyId, agentId);
  const pause = useMutation({ mutationFn: () => agentsApi.pause(agentId!, companyId), onSuccess: () => {
    void muse.refresh(); void cache.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId!) });
    if (companyId) void cache.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
  } });
  if (!agentId) return <p className="text-sm text-muted-foreground">{t("museConnection.saveAgentFirst", { defaultValue: "Save the agent, then connect your personal Muse here." })}</p>;
  const error = muse.state.error ?? muse.pair.error ?? muse.verify.error ?? muse.revoke.error ?? muse.attest.error ?? muse.attestDetector.error ?? pause.error;
  if (muse.identity.failed) return <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{t("museConnection.identityFailed", { defaultValue: "Unable to confirm your account. Refresh to inspect this Muse connection." })}</p><Button type="button" variant="outline" onClick={() => { void cache.invalidateQueries({ queryKey: queryKeys.auth.session }); }}>{t("museConnection.actions.refresh", { defaultValue: "Refresh" })}</Button></div>;
  if (!muse.state.data) return <div className="space-y-3"><p role="status" className="text-sm text-muted-foreground">{muse.state.error ? t("museConnection.loadFailed", { defaultValue: "Unable to load the Muse connection." }) : t("museConnection.loading", { defaultValue: "Loading Muse connection…" })}</p>{error && <p role="alert" className="text-sm text-destructive">{describeError(error).body}</p>}<Button type="button" variant="outline" onClick={() => { void muse.state.refetch(); }}>{t("museConnection.actions.refresh", { defaultValue: "Refresh" })}</Button></div>;
  return <MuseConnectionDetails key={muse.identity.userId} connection={muse.state.data} pairing={muse.pairing} offline={muse.state.isError}
    busy={muse.pair.isPending || muse.verify.isPending || muse.revoke.isPending || muse.attest.isPending || muse.attestDetector.isPending || pause.isPending}
    error={error ? describeError(error).body : undefined} onTest={() => { if (muse.binding) muse.verify.mutate(muse.binding); }} onRepair={muse.repair}
    onPause={() => pause.mutate()} onDisconnect={() => { if (muse.binding) muse.revoke.mutate(muse.binding); }}
    onRefresh={() => { void muse.state.refetch(); }} onAttest={input => muse.attest.mutate(input)} onAttestDetectorCleanup={input => muse.attestDetector.mutate(input)} />;
}
