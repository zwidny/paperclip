import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, MoreHorizontal, Plus, Search, Trash2, X } from "lucide-react";
import { aiConnectionRouterAppDefinition, type AiConnectionPool, type AiConnectionPoolConfig, type AiConnectionPoolMember, type AiManagedConnectionSummary, type ToolConnection } from "@paperclipai/shared";
import { PAPERCLIP_RUNNER_DEFAULT_MODELS } from "@paperclipai/adapter-utils";
import { aiConnectionsApi } from "@/api/ai-connections";
import { aiConnectionPoolsApi, type PoolInspection } from "@/api/ai-connection-pools";
import { describeError } from "@/api/errors";
import { toolsApi } from "@/api/tools";
import { agentsApi } from "@/api/agents";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { Link, useNavigate } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { AppLogo } from "@/pages/apps/AppLogo";
import { AppDetailHeader } from "@/pages/apps/AppDetail";
import { StepHeader } from "@/features/connections/ConnectionSetupHeader";
import { Button } from "@/components/ui/button";
import { QueryErrorState, useQueryView } from "@/components/QueryView";
import { AgentIdentity } from "@/components/AgentIdentity";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AiConnectionUsagePanel } from "./AiConnectionUsagePanel";
import { AI_PROVIDERS, aiMethodLabel } from "./model";
import { useTranslation } from "../../i18n";
import { createUuid } from "../../lib/uuid";

const configOf = ({ name, enabled, members, mode, thresholdPercent }: AiConnectionPoolConfig): AiConnectionPoolConfig => ({ name, enabled, members, mode, thresholdPercent });
const emptyConfig = (name: string): AiConnectionPoolConfig => ({ name, enabled: false, members: [], mode: "round_robin", thresholdPercent: 90 });
function memberOf(account: AiManagedConnectionSummary): AiConnectionPoolMember {
  const profile: AiConnectionPoolMember["profile"] = account.provider === "openai" ? { provider: "codex", model: PAPERCLIP_RUNNER_DEFAULT_MODELS.codex }
    : account.provider === "anthropic" ? { provider: "acpx", acpxAgent: "claude", model: "claude-sonnet-5" }
    : account.provider === "xai" ? { provider: "acpx", acpxAgent: "grok", model: "grok-4.7" }
    : { provider: "opencode", model: "openrouter/anthropic/claude-sonnet-4.6" };
  return { id: createUuid(), binding: { mode: account.ownership === "shared" ? "shared" : "delegated", provider: account.provider, method: account.method, connectionId: account.id, grantId: account.grantId }, profile };
}

/** Native connector surface shared by all plugins implementing the pool contract. */
export function AiConnectionPoolConnector({ pluginKey, connection }: { pluginKey: string; connection?: ToolConnection }) {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  return selectedCompanyId ? <PoolConnector key={`${selectedCompanyId}:${connection?.id ?? pluginKey}`} companyId={selectedCompanyId} pluginKey={pluginKey} connection={connection} /> : <p>{t("aiConnections.pool.selectCompany", { defaultValue: "Select a company to continue." })}</p>;
}
function PoolConnector({ companyId, pluginKey, connection }: { companyId: string; pluginKey: string; connection?: ToolConnection }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { pushToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();
  const accountsQuery = useQuery({ queryKey: ["pool-accounts", companyId], queryFn: () => aiConnectionsApi.list(companyId) });
  const poolsQuery = useQuery({ queryKey: ["ai-connection-pools", companyId], queryFn: () => aiConnectionPoolsApi.list(companyId), enabled: accountsQuery.data?.canManageConnections === true });
  const galleryQuery = useQuery({ queryKey: queryKeys.apps.gallery(companyId), queryFn: () => toolsApi.listGallery(companyId) });
  const accountsView = useQueryView(accountsQuery);
  const poolsView = useQueryView(poolsQuery);
  const galleryView = useQueryView(galleryQuery);
  const [editing, setEditing] = useState<AiConnectionPool>();
  const [draft, setDraft] = useState(() => emptyConfig(t("aiConnections.pool.defaultName", { defaultValue: "AI connection pool" })));
  const [step, setStep] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMembers, setPickerMembers] = useState<AiConnectionPoolMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [inspectionError, setInspectionError] = useState("");
  const [inspection, setInspection] = useState<PoolInspection>({});
  const accounts = accountsQuery.data?.connections ?? [];
  const entry = galleryQuery.data?.apps.find(app => app.aiConnectionRouter?.pluginKey === pluginKey);
  const unavailable = galleryQuery.isSuccess && (!entry || entry.availability?.available === false);
  const canManage = Boolean(accountsQuery.data?.canManageConnections);
  const disabled = busy || !canManage || unavailable;
  const agentsQuery = useQuery({ queryKey: queryKeys.agents.list(companyId), queryFn: () => agentsApi.list(companyId), enabled: Boolean(connection) && canManage });
  const agentsView = useQueryView(agentsQuery);
  const usingAgents = (agentsQuery.data ?? []).filter(agent => agent.status !== "terminated" && agent.runtimeConfig?.aiConnection?.mode === "router" && agent.runtimeConfig.aiConnection.connectionId === connection?.id).sort((a, b) => a.name.localeCompare(b.name));
  useEffect(() => {
    if (connection && !editing && canManage) {
      const pool = poolsQuery.data?.find(pool => pool.id === connection.id && pool.pluginKey === pluginKey);
      if (pool) { setEditing(pool); setDraft(configOf(pool)); }
    }
  }, [poolsQuery.data, connection, editing, pluginKey, canManage]);
  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.connectors", { defaultValue: "Connectors" }), href: "/apps" }, { label: connection ? draft.name : t("aiConnections.pool.addTitle", { defaultValue: "Add a connection pool" }) }]);
    return () => setBreadcrumbs([]);
  }, [connection, draft.name, setBreadcrumbs, t]);
  useEffect(() => {
    if (!editing || !canManage) return;
    let alive = true;
    void aiConnectionPoolsApi.inspect(companyId, editing.id).then(value => { if (alive) setInspection(value); }).catch(() => { if (alive) setInspectionError(t("aiConnections.usage.error.unsupported", { defaultValue: "Usage unavailable." })); });
    return () => { alive = false; };
  }, [companyId, editing, canManage, t]);
  async function invalidate() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["ai-connection-pools", companyId] }),
      client.invalidateQueries({ queryKey: queryKeys.tools.connections(companyId) }),
      client.invalidateQueries({ queryKey: queryKeys.tools.applications(companyId) }),
      ...(connection ? [client.invalidateQueries({ queryKey: queryKeys.tools.connection(connection.id) })] : []),
    ]);
  }
  async function save(config = draft) {
    setBusy(true); setError("");
    try {
      const saved = await aiConnectionPoolsApi.save(companyId, { pluginKey, ...(editing ? { id: editing.id, expectedRevision: editing.revision } : {}), config });
      setEditing(saved); setDraft(configOf(saved)); setRenaming(false);
      await invalidate();
      pushToast({ title: connection ? t("aiConnections.pool.savedToast", { defaultValue: "Connection pool saved" }) : t("aiConnections.pool.createdToast", { defaultValue: "Connection pool created" }), tone: "success" });
      if (!connection) navigate(`/apps/${saved.id}/permissions`);
    } catch (cause) { setError(describeError(cause).body); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!editing) return;
    setBusy(true); setError("");
    try { await aiConnectionPoolsApi.remove(companyId, editing.id, editing.revision); await invalidate(); navigate("/apps"); }
    catch (cause) { setError(describeError(cause).body); }
    finally { setBusy(false); }
  }
  function move(index: number, offset: number) {
    setDraft(value => { const members = [...value.members]; [members[index], members[index + offset]] = [members[index + offset]!, members[index]!]; return { ...value, members }; });
  }
  // Loaded data stays on screen through a transient refetch failure; only a real failure replaces the pool.
  const failedViews = [accountsView, poolsView, galleryView].filter(view => view.kind === "error");
  const reconnecting = [accountsView, poolsView, galleryView].some(view => view.kind === "reconnecting");
  if (accountsQuery.data && !canManage) return <p role="alert" className="text-sm text-muted-foreground">{t("aiConnections.pool.viewerOnly", { defaultValue: "A connection manager can view and edit connection pools." })}</p>;
  if (failedViews.length > 0) return <QueryErrorState error={failedViews[0]!.error} action="load connections" onRetry={() => failedViews.forEach(view => view.retry())} retrying={failedViews.some(view => view.isFetching)} />;
  if (accountsQuery.isPending || poolsQuery.isPending || galleryQuery.isPending || reconnecting || (connection && !editing && poolsQuery.data?.some(pool => pool.id === connection.id))) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("aiConnections.pool.loadingConnections", { defaultValue: "Loading connections…" })}</p>;
  if (connection && !editing) return <p role="alert">{t("aiConnections.pool.unavailable", { defaultValue: "This connection pool is no longer available." })}</p>;
  const name = entry?.name ?? "AI connection pool";
  const logoEntry = entry ?? aiConnectionRouterAppDefinition(pluginKey, { name, description: t("aiConnections.pool.routerDescription", { defaultValue: "Use existing AI connections." }) });
  const orderedMembers = <ol aria-label={t("aiConnections.pool.orderAria", { defaultValue: "Connection order" })} className="divide-y divide-border rounded-lg border border-border">
    {draft.members.map((member, index) => {
      const account = accounts.find(account => account.id === member.binding.connectionId && account.grantId === member.binding.grantId);
      const provider = AI_PROVIDERS[member.binding.provider];
      return <li key={member.id} className="flex items-center gap-3 px-4 py-3">
        <span className="w-4 text-center text-xs text-muted-foreground">{index + 1}</span>
        <AppLogo name={provider.name} logoUrl={provider.logo} size={32} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{account?.name ?? t("aiConnections.pool.connectionUnavailable", { defaultValue: "Connection unavailable" })}</p><p className="text-xs text-muted-foreground">{account ? aiMethodLabel(account.provider, account.method) : t("aiConnections.pool.restoreAccess", { defaultValue: "Restore access to this connection." })}</p>{connection && draft.mode === "usage_aware" && account && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("aiConnections.usage.title", { defaultValue: "Usage" })}</summary><div className="pt-3">{inspectionError ? <p role="status">{inspectionError}</p> : <AiConnectionUsagePanel account={account} cachedOnly observation={inspection[member.id]?.usage} />}</div></details>}</div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} aria-label={t("aiConnections.pool.moveUp", { name: account?.name ?? t("aiConnections.pool.connection", { defaultValue: "connection" }), defaultValue: "Move {{name}} up" })} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === draft.members.length - 1} aria-label={t("aiConnections.pool.moveDown", { name: account?.name ?? t("aiConnections.pool.connection", { defaultValue: "connection" }), defaultValue: "Move {{name}} down" })} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t("aiConnections.pool.removeNamed", { name: account?.name ?? t("aiConnections.pool.connection", { defaultValue: "connection" }), defaultValue: "Remove {{name}}" })} onClick={() => setDraft({ ...draft, members: draft.members.filter(item => item.id !== member.id) })}><X className="size-4" /></Button>
        </div>
      </li>;
    })}
    {draft.members.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">{t("aiConnections.pool.empty", { defaultValue: "Add a connection to get started." })}</li>}
  </ol>;
  return <div className={connection ? "space-y-6" : "mx-auto max-w-2xl"}>
    {connection ? <div className="flex items-start justify-between gap-4">
      <AppDetailHeader appName={draft.name} connection={connection} logoEntry={logoEntry} brandKey={logoEntry.slug} allowRemoteLogo canRename={!disabled} status={editing?.enabled ? { label: t("aiConnections.pool.statusConnected", { defaultValue: "Connected" }), tone: "connected" } : { label: t("aiConnections.pool.statusPaused", { defaultValue: "Paused" }), tone: "paused" }} actionCount={null} renaming={renaming} nameDraft={nameDraft} renamePending={disabled} onNameDraftChange={setNameDraft} onRenameStart={() => { if (!disabled) { setNameDraft(draft.name); setRenaming(true); } }} onRenameCancel={() => setRenaming(false)} onRenameSubmit={value => void save({ ...draft, name: value })} />
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t("aiConnections.pool.manageAria", { defaultValue: "Manage connection pool" })}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" disabled={busy || !canManage} onSelect={() => { setError(""); setRemoving(true); }}><Trash2 />{t("aiConnections.pool.remove", { defaultValue: "Remove connection" })}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div> : <StepHeader title={t("aiConnections.pool.addTitle", { defaultValue: "Add a connection pool" })} subtitle={step === 0 ? t("aiConnections.pool.chooseExisting", { defaultValue: "Choose connections you already use." }) : t("aiConnections.pool.rotateOrder", { defaultValue: "New tasks rotate in this order." })} step="connect" activeIndex={step} labels={[t("aiConnections.pool.connections", { defaultValue: "Connections" }), t("aiConnections.pool.stepOrder", { defaultValue: "Order" })]} appIdentity={{ name, logoUrl: logoEntry.branding.logoUrl }} />}
    {unavailable && <p role="alert" className="text-sm text-destructive">{entry?.availability?.reason ?? t("aiConnections.pool.pluginDisabled", { defaultValue: "Enable the connection pool plugin in Plugins." })}</p>}
    {!canManage && <p role="alert" className="text-sm text-muted-foreground">{t("aiConnections.pool.editorOnly", { defaultValue: "A connection manager can edit this pool." })}</p>}
    {error && !removing && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!connection && step === 0 ? <ConnectionPicker accounts={accounts} selected={draft.members} disabled={disabled} onChange={members => setDraft({ ...draft, members })} onRefresh={() => void accountsQuery.refetch()} /> : <div className="space-y-4">
      {connection && <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{t("aiConnections.pool.connections", { defaultValue: "Connections" })}</h2><Button variant="outline" size="sm" disabled={disabled} onClick={() => { setPickerMembers(draft.members); setPickerOpen(true); }}><Plus className="size-4" />{t("aiConnections.pool.addConnections", { defaultValue: "Add connections" })}</Button></div>}
      {orderedMembers}
      <p className="text-xs text-muted-foreground">{connection ? t("aiConnections.pool.orderChanges", { defaultValue: "Order changes apply to new tasks." }) : t("aiConnections.pool.createdPaused", { defaultValue: "Created paused. Enable it when you’re ready." })}</p>
      {connection && <>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.enabled} disabled={disabled} onCheckedChange={checked => setDraft({ ...draft, enabled: checked === true })} />{t("aiConnections.pool.enable", { defaultValue: "Enable this pool" })}</label>
        <details className="rounded-lg border border-border"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t("aiConnections.pool.advanced", { defaultValue: "Advanced" })}</summary><fieldset disabled={disabled} className="space-y-4 border-t border-border p-4">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.mode === "usage_aware"} onCheckedChange={checked => setDraft({ ...draft, mode: checked ? "usage_aware" : "round_robin" })} />{t("aiConnections.pool.skipNearLimit", { defaultValue: "Skip connections near their usage limit" })}</label>
          {draft.mode === "usage_aware" && <label className="flex items-center gap-3 text-sm">{t("aiConnections.pool.skipAt", { defaultValue: "Skip at" })}<Input className="w-20" aria-label={t("aiConnections.pool.thresholdAria", { defaultValue: "Usage threshold" })} type="number" min={1} max={100} step={1} value={draft.thresholdPercent} onChange={event => setDraft({ ...draft, thresholdPercent: Number(event.target.value) })} />{t("aiConnections.pool.percentUsage", { defaultValue: "% usage" })}</label>}
          {draft.members.map((member, index) => <div key={member.id} className="space-y-2"><p className="text-sm font-medium">{accounts.find(account => account.id === member.binding.connectionId)?.name ?? t("aiConnections.pool.connectionUnavailable", { defaultValue: "Connection unavailable" })}</p><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs text-muted-foreground">{t("aiConnections.pool.model", { defaultValue: "Model" })}<Input aria-label={t("aiConnections.pool.modelAria", { index: index + 1, defaultValue: "Model for connection {{index}}" })} value={member.profile.model} onChange={event => setDraft({ ...draft, members: draft.members.map(row => row.id === member.id ? { ...row, profile: { ...row.profile, model: event.target.value } } : row) })} /></label><label className="space-y-1 text-xs text-muted-foreground">{t("aiConnections.pool.effort", { defaultValue: "Effort (optional)" })}<Input aria-label={t("aiConnections.pool.effortAria", { index: index + 1, defaultValue: "Effort for connection {{index}}" })} value={member.profile.effort ?? ""} onChange={event => { const { effort: _old, ...profile } = member.profile; setDraft({ ...draft, members: draft.members.map(row => row.id === member.id ? { ...row, profile: { ...profile, ...(event.target.value.trim() ? { effort: event.target.value.trim() } : {}) } } : row) }); }} /></label></div></div>)}
        </fieldset></details>
        <section aria-labelledby="pool-used-by" className="space-y-3">
          <h2 id="pool-used-by" className="text-sm font-semibold">{t("aiConnections.pool.usedBy", { defaultValue: "Used by" })}</h2>
          {agentsQuery.isPending || agentsView.kind === "reconnecting" ? <p role="status" className="text-sm text-muted-foreground">{t("secrets.agentAccess.loadingAgents", { defaultValue: "Loading agents…" })}</p>
            : agentsView.kind === "error" ? <QueryErrorState size="inline" error={agentsQuery.error} action="load agents" onRetry={agentsView.retry} retrying={agentsView.isFetching} />
            : usingAgents.length ? <ul className="flex flex-wrap gap-x-6 gap-y-3">{usingAgents.map(agent => <li key={agent.id} className="min-w-0 max-w-full"><Link to={`/agents/${agent.id}`} className="inline-flex max-w-full rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><AgentIdentity agent={agent} /></Link></li>)}</ul>
            : <p className="text-sm text-muted-foreground">{t("aiConnections.pool.noAgents", { defaultValue: "No agents yet." })}</p>}
        </section>
      </>}
    </div>}
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
      <Button variant="ghost" disabled={busy} onClick={() => connection ? navigate("/apps") : step ? setStep(0) : navigate("/apps")}>{!connection && step ? t("common.back", { defaultValue: "Back" }) : t("common.cancel", { defaultValue: "Cancel" })}</Button>
      <Button disabled={disabled || draft.members.length === 0 || !Number.isInteger(draft.thresholdPercent) || draft.thresholdPercent < 1 || draft.thresholdPercent > 100} onClick={() => !connection && step === 0 ? setStep(1) : void save()}>{busy && <Loader2 className="size-4 animate-spin" />}{busy ? t("common.saving", { defaultValue: "Saving…" }) : connection ? t("common.saveChanges", { defaultValue: "Save changes" }) : step ? t("aiConnections.pool.createPool", { defaultValue: "Create pool" }) : t("common.continue", { defaultValue: "Continue" })}</Button>
    </div>
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{t("aiConnections.pool.addConnections", { defaultValue: "Add connections" })}</DialogTitle><DialogDescription>{t("aiConnections.pool.chooseExisting", { defaultValue: "Choose connections you already use." })}</DialogDescription></DialogHeader><ConnectionPicker accounts={accounts} selected={pickerMembers} disabled={disabled} onChange={setPickerMembers} onRefresh={() => void accountsQuery.refetch()} /><div className="flex items-center justify-between gap-3"><Button variant="ghost" onClick={() => setPickerOpen(false)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button><Button onClick={() => { setDraft({ ...draft, members: pickerMembers }); setPickerOpen(false); }}>{t("common.done", { defaultValue: "Done" })}</Button></div></DialogContent></Dialog>
    <AlertDialog open={removing} onOpenChange={open => { if (!busy) setRemoving(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("aiConnections.pool.removeTitle", { name: draft.name, defaultValue: "Remove {{name}}?" })}</AlertDialogTitle><AlertDialogDescription>{t("aiConnections.pool.removeBody", { defaultValue: "The connections in this pool are kept." })}</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter className="sm:justify-between"><AlertDialogCancel disabled={busy}>{t("common.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{busy ? t("aiConnections.pool.removing", { defaultValue: "Removing…" }) : t("aiConnections.pool.remove", { defaultValue: "Remove connection" })}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
function ConnectionPicker({ accounts, selected, disabled, onChange, onRefresh }: { accounts: AiManagedConnectionSummary[]; selected: AiConnectionPoolMember[]; disabled: boolean; onChange: (members: AiConnectionPoolMember[]) => void; onRefresh: () => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const filtered = accounts.filter(account => `${account.name} ${AI_PROVIDERS[account.provider].name}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-4">
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label={t("aiConnections.pool.searchAria", { defaultValue: "Search connections" })} placeholder={t("aiConnections.pool.searchPlaceholder", { defaultValue: "Search connections…" })} value={search} onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
    <div className="max-h-80 overflow-y-auto rounded-lg border border-border divide-y divide-border">
      {filtered.map(account => { const existing = selected.find(member => member.binding.connectionId === account.id); const checked = existing?.binding.grantId === account.grantId; return <label key={account.grantId} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent/50"><Checkbox checked={checked} disabled={disabled || (!checked && (account.status !== "connected" || Boolean(existing)))} onCheckedChange={value => onChange(value ? [...selected, memberOf(account)] : selected.filter(member => member.binding.connectionId !== account.id))} aria-label={account.name} /><AppLogo name={AI_PROVIDERS[account.provider].name} logoUrl={AI_PROVIDERS[account.provider].logo} size={32} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{account.name}</span><span className="block text-xs text-muted-foreground">{aiMethodLabel(account.provider, account.method)} · {account.ownership === "shared" ? t("aiConnections.pool.shared", { defaultValue: "Shared" }) : t("aiConnections.pool.personal", { defaultValue: "Personal" })}</span></span>{account.status !== "connected" && <span className="text-xs text-muted-foreground">{t("aiConnections.pool.needsAttention", { defaultValue: "Needs attention" })}</span>}</label>; })}
      {filtered.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{accounts.length ? t("aiConnections.pool.noMatches", { defaultValue: "No matching connections." }) : t("aiConnections.pool.noConnections", { defaultValue: "No AI connections yet." })}</p>}
    </div>
    <div className="flex items-center justify-between gap-3 text-sm"><Link to="/apps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">{t("aiConnections.pool.connectNew", { defaultValue: "Connect a new account" })}<ExternalLink className="size-3.5" /></Link><Button variant="ghost" size="sm" onClick={onRefresh}>{t("aiConnections.pool.refresh", { defaultValue: "Refresh" })}</Button></div>
  </div>;
}
