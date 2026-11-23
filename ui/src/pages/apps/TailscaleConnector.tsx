import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tailscaleApi, type TailscaleConnection } from "@/api/tailscale";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { tailscaleConnectionsKey, useTailscaleConnections } from "@/hooks/useTailscaleConnections";
import { Link, useSearchParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { useAuthorizationWindow } from "@/hooks/useAuthorizationWindow";
import { AppLogo } from "./AppLogo";
import { TailscaleDeviceSignIn } from "./TailscaleDeviceSignIn";
import { ANALYTICS_MASK_CLASS } from "@/lib/analytics/privacy";
import { cn } from "@/lib/utils";

export const TAILSCALE_CONNECTOR_PATH = "/apps/tailscale";

export function TailscaleConnectorCard({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const connections = useTailscaleConnections(selectedCompanyId);
  const connected = connections.data?.filter(connection => connection.status === "connected") ?? [];
  if (!connections.canManage) return null;
  const action = connected.length
    ? t("tailscale.card.manage", { defaultValue: "Manage" })
    : t("tailscale.card.connect", { defaultValue: "Connect" });
  return <div role="listitem" data-app-slug="tailscale" data-connected={String(connected.length > 0)} className="overflow-hidden rounded-xl border border-border">
    <div className="flex flex-wrap items-center gap-3 px-4 py-4">
      <AppLogo name="Tailscale" brandKey="tailscale" size={36} />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">Tailscale</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("tailscale.card.description", { defaultValue: "Connect your tailnet to use its machines in SSH environments." })}</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => onNavigate(TAILSCALE_CONNECTOR_PATH)} aria-label={t("tailscale.card.actionAria", { action, defaultValue: "{{action}} Tailscale" })}>{action}</Button>
    </div>
    {connected.length > 0 && <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground"><span className={ANALYTICS_MASK_CLASS}>{connected.map(connection => connection.name).join(", ")}</span> · {t("tailscale.card.connected", { defaultValue: "Connected" })}</p>}
    {connections.error && <p role="alert" className="border-t border-border px-4 py-3 text-sm text-destructive">{describeError(connections.error, { action: "load Tailscale connections" }).body}</p>}
  </div>;
}

export function TailscaleConnector() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const connections = useTailscaleConnections(selectedCompanyId);
  const authorization = useAuthorizationWindow();
  const company = useRef(selectedCompanyId);
  company.current = selectedCompanyId;
  const connect = useMutation({ mutationFn: async (input: { companyId: string; connectionId?: string }) => {
    const result = await tailscaleApi.connect(input.companyId, input.connectionId);
    client.setQueryData<TailscaleConnection[]>(tailscaleConnectionsKey(input.companyId), rows => [
      ...(rows ?? []).filter(row => row.id !== result.connection.id), result.connection,
    ]);
    if (company.current !== input.companyId) return;
    if (result.authorizationUrl) await authorization.open(result.authorizationUrl);
    else authorization.cancel();
  }, onError: () => authorization.cancel() });
  const start = (connectionId?: string) => {
    if (!selectedCompanyId) return;
    authorization.reserve();
    connect.mutate({ companyId: selectedCompanyId, connectionId });
  };
  const disconnect = useMutation({ mutationFn: (connectionId: string) => tailscaleApi.disconnect(selectedCompanyId!, connectionId),
    onSuccess: () => { authorization.cancel(); return client.invalidateQueries({ queryKey: tailscaleConnectionsKey(selectedCompanyId) }); } });
  useEffect(() => authorization.cancel, [selectedCompanyId, authorization.cancel]);
  useEffect(() => {
    setBreadcrumbs([{ label: t("appDetail.breadcrumbConnectors", { defaultValue: "Connectors" }), href: "/apps" }, { label: "Tailscale" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, t]);
  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">{t("tailscale.connector.selectOrganization", { defaultValue: "Select an organization to connect Tailscale." })}</p>;
  if (connections.access.isPending) return <p className="text-sm text-muted-foreground">{t("tailscale.connector.checkingAccess", { defaultValue: "Checking Tailscale management access…" })}</p>;
  if (connections.access.error) return <p role="alert" className="text-sm text-destructive">{describeError(connections.access.error, { action: "check Tailscale management access" }).body}</p>;
  if (!connections.canManage) return <p className="text-sm text-muted-foreground">{t("tailscale.connector.adminRequired", { defaultValue: "Ask an instance administrator to connect or manage Tailscale networks." })}</p>;
  const error = connect.error ?? disconnect.error ?? connections.error;
  const outcome = searchParams.get("tailscale_error");
  const returnError = outcome === "cancelled"
    ? t("tailscale.connector.authorizationCancelled", { defaultValue: "Tailscale authorization was canceled. Try again to connect your network." })
    : outcome === "failed"
      ? t("tailscale.connector.authorizationFailed", { defaultValue: "Tailscale authorization could not be completed. Try again." })
      : null;
  const retryConnection = connections.data?.find(connection => connection.id === searchParams.get("tailscale_connection"));
  return <div className="max-w-3xl space-y-6 pb-8">
    <header className="flex items-center gap-3"><AppLogo name="Tailscale" brandKey="tailscale" size={36} /><h1 className="text-xl font-semibold">Tailscale</h1></header>
    <p className="text-sm text-muted-foreground">{t("tailscale.connector.description", { defaultValue: "Give Paperclip access to your tailnet, then choose one of its machines when creating an SSH environment. Agents can use any harness supported by that environment." })}</p>
    {connections.isPending && <p className="text-sm text-muted-foreground">{t("tailscale.connector.loadingConnections", { defaultValue: "Loading tailnet connections…" })}</p>}
    {returnError && <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{returnError}</p>{retryConnection && <Button variant="outline" disabled={connect.isPending} onClick={() => start(retryConnection.id)}>{t("tailscale.connector.tryAgain", { defaultValue: "Try again" })}</Button>}</div>}
    {error && <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{describeError(error, { action: "connect Tailscale" }).body}</p><Button variant="outline" onClick={() => void connections.refetch()}>{t("tailscale.connector.refreshConnections", { defaultValue: "Refresh connections" })}</Button></div>}
    <div className={cn("divide-y divide-border", ANALYTICS_MASK_CLASS)}>{(connections.data ?? []).map(connection => <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1"><p className={cn("font-medium", ANALYTICS_MASK_CLASS)}>{connection.name}</p><p className="text-sm text-muted-foreground">{connection.status === "connected"
        ? t("tailscale.connector.status.connected", { defaultValue: "Connected" })
        : connection.status === "authorizing"
          ? t("tailscale.connector.status.authorizing", { defaultValue: "Waiting for sign-in" })
          : connection.status === "connecting"
            ? t("tailscale.connector.status.connecting", { defaultValue: "Connecting" })
            : connection.status === "disconnected"
              ? t("tailscale.connector.status.disconnected", { defaultValue: "Disconnected" })
              : connection.status === "expired"
                ? t("tailscale.connector.status.expired", { defaultValue: "Sign-in expired" })
                : t("tailscale.connector.status.incomplete", { defaultValue: "Authorization not completed" })}</p></div>
      {connection.status === "connected" ? <>
        <Button variant="outline" asChild><Link to={`/company/settings/instance/environments/new?tailscale_connection=${encodeURIComponent(connection.id)}`}>{t("tailscale.connector.createSshEnvironment", { defaultValue: "Create SSH environment" })}</Link></Button>
        <Button variant="ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate(connection.id)}>{t("tailscale.connector.disconnectVerb", { defaultValue: "Disconnect" })} <span className={ANALYTICS_MASK_CLASS}>{connection.name}</span></Button>
      </> : connection.status === "authorizing" ? <TailscaleDeviceSignIn key={`${selectedCompanyId}:${connection.id}`} connection={connection} cancel={() => disconnect.mutate(connection.id)} disabled={disconnect.isPending} />
        : <Button variant="outline" disabled={connect.isPending} onClick={() => start(connection.id)}>{t("tailscale.connector.reconnectVerb", { defaultValue: "Reconnect" })} <span className={ANALYTICS_MASK_CLASS}>{connection.name}</span></Button>}
    </div>)}</div>
    <footer className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <Button variant="ghost" asChild><Link to="/apps">{t("tailscale.connector.backToConnectors", { defaultValue: "Back to connectors" })}</Link></Button>
      <Button disabled={connect.isPending || connections.isError || connections.data?.some(connection => connection.status === "authorizing")} onClick={() => start()}>{connect.isPending ? t("tailscale.connector.connecting", { defaultValue: "Connecting…" }) : t("environments.tailscale.connectLink", { defaultValue: "Connect Tailscale Network" })}</Button>
    </footer>
  </div>;
}
