import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ToolConnection } from "@paperclipai/shared";
import { isConnectableAppSlug } from "@paperclipai/shared";
import { Navigate, useNavigate, useParams } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { toolsApi } from "@/api/tools";
import { QueryErrorState, useQueryView } from "@/components/QueryView";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLogo } from "./AppLogo";
import {
  appApplicationSourceSlug,
  appDefinitionDarkLogoUrl,
  appDefinitionLogoUrl,
  appDefinitionName,
  appDefinitionSlug,
  type AppGalleryDisplayEntry,
} from "./app-definition-display";
import { connectionAddress } from "./AppDetail";
import { ReviewPanel } from "./app-detail/ReviewPanel";
import { appApplicationTabHref, appTabHref, appTabLabel, isAppTabKey, type AppTabKey } from "./app-tabs";
import { useTranslation } from "../../i18n";

export function AppNotConnected() {
  const { t } = useTranslation();
  const { applicationId = "", tab } = useParams<{ applicationId: string; tab?: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const activeTab: AppTabKey | null = isAppTabKey(tab) ? tab : null;

  const applicationsQuery = useQuery({
    queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listApplications(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const galleryQuery = useQuery({
    queryKey: queryKeys.apps.gallery(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listGallery(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });

  const application = useMemo(
    () => (applicationsQuery.data?.applications ?? []).find((app) => app.id === applicationId),
    [applicationsQuery.data, applicationId],
  );
  const appSourceSlug = appApplicationSourceSlug(application);
  const relatedApplicationIds = useMemo(() => {
    if (!application) return new Set<string>();
    if (!appSourceSlug) return new Set([application.id]);
    return new Set(
      (applicationsQuery.data?.applications ?? [])
        .filter((candidate) => appApplicationSourceSlug(candidate) === appSourceSlug)
        .map((candidate) => candidate.id),
    );
  }, [application, applicationsQuery.data, appSourceSlug]);
  const appConnections = useMemo(
    () => (connectionsQuery.data?.connections ?? []).filter((c) => relatedApplicationIds.has(c.applicationId)),
    [connectionsQuery.data, relatedApplicationIds],
  );
  const activeConnections = useMemo(
    () => appConnections.filter((c) => c.status !== "archived" && c.status !== "draft"),
    [appConnections],
  );
  const activeConnection = activeConnections[0] ?? null;
  const previousConnection = useMemo(() => latestArchivedConnection(appConnections), [appConnections]);
  const grantsQuery = useQuery({
    queryKey: queryKeys.tools.connectionGrants(previousConnection?.id ?? "__none__"),
    queryFn: () => toolsApi.listConnectionGrants(previousConnection!.id),
    enabled: !!previousConnection && !!activeTab,
  });
  const applicationsView = useQueryView(applicationsQuery);
  const connectionsView = useQueryView(connectionsQuery);
  const grantsView = useQueryView(grantsQuery);

  const appName = application?.name ?? t("appNotConnected.appFallback", { defaultValue: "App" });
  useEffect(() => {
    if (!activeTab) return;
    setBreadcrumbs([
      { label: t("appNotConnected.breadcrumbConnectors", { defaultValue: "Connectors" }), href: "/apps" },
      { label: appName, href: appApplicationTabHref(applicationId, "permissions") },
      { label: appTabLabel(activeTab) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, appName, applicationId, activeTab, t]);

  if (tab === "activity") {
    return <Navigate to="/activity?action=tool_" replace />;
  }
  if (tab === "setup" || tab === "test") {
    return <Navigate to={appApplicationTabHref(applicationId, "permissions")} replace />;
  }
  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("appNotConnected.selectOrganization", { defaultValue: "Select an organization to manage apps." })}</div>;
  }
  if (!applicationId || !activeTab) {
    return <Navigate to={applicationId ? appApplicationTabHref(applicationId, "permissions") : "/apps"} replace />;
  }
  const loadFailure = [applicationsView, connectionsView].find((view) => view.kind === "error");
  if (loadFailure) {
    return (
      <QueryErrorState
        size="page"
        error={loadFailure.error}
        action="load this app"
        onRetry={loadFailure.retry}
        retrying={loadFailure.isFetching}
      />
    );
  }
  if (
    applicationsQuery.isLoading || connectionsQuery.isLoading
    || applicationsView.kind === "reconnecting" || connectionsView.kind === "reconnecting"
  ) {
    return (
      <div className="max-w-3xl space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!application) {
    return (
      <div className="max-w-3xl space-y-3 p-6 text-sm text-muted-foreground">
        <p>{t("appNotConnected.appGone", { defaultValue: "This app doesn’t exist anymore." })}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/apps")}>{t("appNotConnected.backToConnectors", { defaultValue: "Back to connectors" })}</Button>
      </div>
    );
  }
  if (activeConnection) {
    return <Navigate to={appTabHref(activeConnection.id, activeTab)} replace />;
  }

  const gallery = (galleryQuery.data?.apps ?? []) as AppGalleryDisplayEntry[];
  const logoEntry = (appSourceSlug
    ? gallery.find((entry) => appDefinitionSlug(entry) === appSourceSlug)
    : undefined) ?? gallery.find(
      (entry) => appDefinitionName(entry).toLowerCase() === application.name.toLowerCase(),
    );
  const logoUrl = appDefinitionLogoUrl(logoEntry);
  const darkLogoUrl = appDefinitionDarkLogoUrl(logoEntry);

  const previousAddress = previousConnection ? connectionAddress(previousConnection) : null;
  const retainedPersonalGrant = previousConnection?.credentialPolicy === "per_user"
    ? grantsQuery.data?.grants.find((grant) => (
      grant.kind === "user" && grant.subjectUserId === previousConnection.createdByUserId
    ))
      ?? grantsQuery.data?.grants.find((grant) => grant.kind === "user" && grant.status === "active")
      ?? grantsQuery.data?.grants.find((grant) => grant.kind === "user")
      ?? null
    : null;
  const retainedPersonalUserId = previousConnection?.credentialPolicy === "per_user"
    ? previousConnection.createdByUserId ?? retainedPersonalGrant?.subjectUserId ?? null
    : null;
  const canReconnect = !previousConnection
    || (previousConnection.credentialPolicy === "per_user"
      ? Boolean(
        retainedPersonalUserId
        && retainedPersonalUserId === grantsQuery.data?.currentUserId
        && grantsQuery.data?.capabilities.canConnectAsCurrentUser,
      )
      : grantsQuery.data?.capabilities.canConfigure === true);
  const reconnectUnavailableMessage = grantsQuery.isLoading || grantsView.kind === "reconnecting"
    ? "Checking who can reconnect this identity…"
    : grantsView.kind === "error"
      ? "We couldn't verify who can reconnect this identity. Reload the page to try again."
      : previousConnection?.credentialPolicy === "per_user"
        && retainedPersonalUserId !== grantsQuery.data?.currentUserId
        ? t("appNotConnected.reconnectOwnerOnly", { defaultValue: "The person this connection belongs to must reconnect it." })
        : t("appNotConnected.reconnectNoPermission", {
            defaultValue: "You don't have permission to reconnect this identity.",
          });
  const connectHref = newConnectionHref({
    applicationId,
    appName: application.name,
    previousAddress,
    previousConnection,
    sourceSlug: isConnectableAppSlug(appSourceSlug) ? appSourceSlug : null,
  });

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <ApplicationHeader
        applicationName={application.name}
        description={application.description}
        logoUrl={logoUrl}
        darkLogoUrl={darkLogoUrl}
        connectedCount={activeConnections.length}
      />

      <ConnectionCallout
        applicationName={application.name}
        previousConnection={previousConnection}
        canReconnect={canReconnect}
        reconnectUnavailableMessage={reconnectUnavailableMessage}
        onConnect={() => navigate(connectHref)}
      />
      {activeTab === "review" && (
        previousConnection ? (
          <ReviewPanel connectionId={previousConnection.id} />
        ) : (
          <EmptyTab
            title={t("appNotConnected.reviewEmptyTitle", { defaultValue: "Nothing is waiting for your OK right now." })}
            body={t("appNotConnected.reviewEmptyBody", { defaultValue: "Review requests will appear here after this app is connected." })}
          />
        )
      )}
      {activeTab === "permissions" && (
        <PermissionsTab previousConnection={previousConnection} />
      )}
    </div>
  );
}

function ApplicationHeader({
  applicationName,
  description,
  logoUrl,
  darkLogoUrl,
  connectedCount,
}: {
  applicationName: string;
  description: string | null;
  logoUrl: string | undefined;
  darkLogoUrl: string | undefined;
  connectedCount: number;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-wrap items-center gap-4">
      <AppLogo name={applicationName} logoUrl={logoUrl} darkLogoUrl={darkLogoUrl} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-2xl font-bold tracking-tight">{applicationName}</h1>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {connectedCount > 0
              ? t("appNotConnected.connectedCount", {
                  count: connectedCount,
                  defaultValue: "{{count}} connected",
                })
              : t("appNotConnected.notConnected", { defaultValue: "Not connected" })}
          </span>
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </header>
  );
}

function ConnectionCallout({
  applicationName,
  previousConnection,
  canReconnect,
  reconnectUnavailableMessage,
  onConnect,
}: {
  applicationName: string;
  previousConnection: ToolConnection | null;
  canReconnect: boolean;
  reconnectUnavailableMessage: string;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {previousConnection
            ? t("appNotConnected.needsAttention", { defaultValue: "Needs attention" })
            : t("appNotConnected.notConnected", { defaultValue: "Not connected" })}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {previousConnection
            ? previousConnection.authKind === "oauth"
              ? t("appNotConnected.signInToRestore", {
                  appName: applicationName,
                  defaultValue: "Sign in to {{appName}} again to restore access.",
                })
              : t("appNotConnected.addKeyToRestore", {
                  appName: applicationName,
                  defaultValue: "Add a working {{appName}} key to restore access.",
                })
            : t("appNotConnected.connectPrompt", {
                appName: applicationName,
                defaultValue: "Connect {{appName}} so agents can use it.",
              })}
        </p>
        {previousConnection && !canReconnect ? (
          <p className="mt-1 text-sm text-muted-foreground">{reconnectUnavailableMessage}</p>
        ) : null}
      </div>
      {!previousConnection || canReconnect ? (
        <Button onClick={onConnect}>
          {previousConnection
            ? t("appNotConnected.reconnect", { defaultValue: "Reconnect" })
            : t("appNotConnected.connect", { defaultValue: "Connect" })}
        </Button>
      ) : null}
    </section>
  );
}

function PermissionsTab({ previousConnection }: { previousConnection: ToolConnection | null }) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="text-sm font-bold text-foreground">{t("appNotConnected.permissionsPaused", { defaultValue: "Permissions paused" })}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("appNotConnected.permissionsPausedBody", { defaultValue: "Reconnect this app to edit who can use it and which actions need a human first." })}
      </p>
      {previousConnection && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("appNotConnected.permissionsRetainedNote", { defaultValue: "Previous setup is retained for reconnect, but access controls stay read-only until the app is online." })}
        </p>
      )}
    </section>
  );
}

function EmptyTab({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </section>
  );
}

function latestArchivedConnection(connections: ToolConnection[]): ToolConnection | null {
  const archived = connections.filter((c) => c.status === "archived");
  if (archived.length === 0) return null;
  return archived.reduce((latest, connection) => {
    const latestTime = new Date(latest.updatedAt ?? latest.createdAt ?? 0).getTime();
    const connectionTime = new Date(connection.updatedAt ?? connection.createdAt ?? 0).getTime();
    return connectionTime > latestTime ? connection : latest;
  });
}

function newConnectionHref({
  applicationId,
  appName,
  previousAddress,
  previousConnection,
  sourceSlug,
}: {
  applicationId: string;
  appName: string;
  previousAddress: string | null;
  previousConnection: ToolConnection | null;
  sourceSlug: string | null;
}): string {
  const params = new URLSearchParams({ applicationId, name: appName, new: "1" });
  if (previousConnection) {
    params.set("reconnect", previousConnection.id);
    params.set("identity",
      previousConnection.credentialPolicy === "per_user"
        ? "user"
        : previousConnection.credentialPolicy === "per_agent"
          ? "agent"
          : "organization");
  }
  if (sourceSlug) params.set("source", sourceSlug);
  else params.set("byo", "1");
  const storedLink = [
    previousConnection?.config?.url,
    previousConnection?.config?.endpoint,
    previousConnection?.config?.remoteUrl,
    previousConnection?.transportConfig.url,
    previousConnection?.transportConfig.endpoint,
    previousConnection?.transportConfig.remoteUrl,
    previousAddress,
  ].find((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value));
  if (storedLink) params.set("link", storedLink);
  const path = previousConnection?.credentialSource === "vercel_connect"
    ? "/apps/vercel-connect"
    : "/apps/connect";
  return `${path}?${params.toString()}`;
}
