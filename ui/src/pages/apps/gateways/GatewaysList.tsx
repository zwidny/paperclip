import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Plus, Search } from "lucide-react";
import type { ToolMcpGatewayWithTokens, ToolProfileWithDetails } from "@paperclipai/shared";
import { useNavigate } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { toolsApi } from "@/api/tools";
import { agentsApi } from "@/api/agents";
import { projectsApi } from "@/api/projects";
import { QueryErrorState, useQueryView } from "@/components/QueryView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { ErrorState, RelativeTime } from "@/pages/tools/shared";
import { useTranslation } from "../../../i18n";
import { CopyableGatewayUrl } from "./CopyableGatewayUrl";
import { NewGatewayDialog, gatewaysQueryKey } from "./NewGatewayDialog";
import { gatewayTabHref } from "./gateway-tabs";
import {
  activeTokenCount,
  deriveGatewayApps,
  expiringTokenCount,
  isGatewayOn,
  latestTokenActivity,
} from "./gateway-helpers";
import { describeError } from "@/api/errors";

function shortScopeId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function gatewayScopeLabel(
  gateway: ToolMcpGatewayWithTokens,
  projectNames: Map<string, string>,
  agentNames: Map<string, string>,
  t: TFunction,
): string {
  if (gateway.contextScopeType !== "none" && gateway.contextScopeId) {
    if (gateway.contextScopeType === "project") {
      return t("gatewaysList.scope.project", {
        name: projectNames.get(gateway.contextScopeId) ?? shortScopeId(gateway.contextScopeId),
        defaultValue: "Project · {{name}}",
      });
    }
    if (gateway.contextScopeType === "agent") {
      return t("gatewaysList.scope.agent", {
        name: agentNames.get(gateway.contextScopeId) ?? shortScopeId(gateway.contextScopeId),
        defaultValue: "Agent · {{name}}",
      });
    }
    return `${gateway.contextScopeType} · ${shortScopeId(gateway.contextScopeId)}`;
  }
  if (gateway.projectId) {
    return t("gatewaysList.scope.project", {
      name: projectNames.get(gateway.projectId) ?? shortScopeId(gateway.projectId),
      defaultValue: "Project · {{name}}",
    });
  }
  if (gateway.agentId) {
    return t("gatewaysList.scope.agent", {
      name: agentNames.get(gateway.agentId) ?? shortScopeId(gateway.agentId),
      defaultValue: "Agent · {{name}}",
    });
  }
  return t("gatewaysList.scope.organization", { defaultValue: "Organization" });
}

function gatewayToolsLabel(profile: ToolProfileWithDetails | undefined, t: TFunction): string {
  if (!profile) return t("gatewaysList.tools.unavailable", { defaultValue: "Profile unavailable" });
  const { accessMode, allowedToolCount, totalToolCount, excludedToolCount } = profile.summary;
  const count =
    accessMode === "all_except"
      ? Math.max(totalToolCount - excludedToolCount, 0)
      : allowedToolCount;
  if (count === 0) return t("gatewaysList.tools.none", { defaultValue: "No tools allowed" });
  return t("gatewaysList.tools.count", { count, defaultValue: "{{count}} tool" });
}

export function GatewaysList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav.connectors", { defaultValue: "Connectors" }), href: "/apps" },
      { label: t("gatewaysList.breadcrumbGateways", { defaultValue: "Gateways" }) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, t]);

  const gatewaysQuery = useQuery({
    queryKey: gatewaysQueryKey(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listGateways(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const profilesQuery = useQuery({
    queryKey: queryKeys.tools.profiles(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listProfiles(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const applicationsQuery = useQuery({
    queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listApplications(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId ?? "__none__"),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const gatewaysView = useQueryView(gatewaysQuery);

  const profileById = useMemo(
    () => new Map((profilesQuery.data?.profiles ?? []).map((profile) => [profile.id, profile])),
    [profilesQuery.data],
  );
  const agentNames = useMemo(
    () => new Map((agentsQuery.data ?? []).map((agent) => [agent.id, agent.name])),
    [agentsQuery.data],
  );
  const projectNames = useMemo(
    () => new Map((projectsQuery.data ?? []).map((project) => [project.id, project.name])),
    [projectsQuery.data],
  );

  const toggleMutation = useMutation({
    mutationFn: ({ gateway }: { gateway: ToolMcpGatewayWithTokens }) =>
      toolsApi.updateGateway(selectedCompanyId!, gateway.id, {
        status: isGatewayOn(gateway) ? "disabled" : "active",
      }),
    onSuccess: async (gateway) => {
      pushToast({
        title: gateway.status === "active"
          ? t("gatewaysList.toast.onTitle", { defaultValue: "Gateway on" })
          : t("gatewaysList.toast.offTitle", { defaultValue: "Gateway off" }),
        body:
          gateway.status === "active"
            ? t("gatewaysList.toast.onBody", {
                name: gateway.name,
                defaultValue: "{{name}} is exposing its tools again.",
              })
            : t("gatewaysList.toast.offBody", {
                name: gateway.name,
                defaultValue: "{{name}} is off — every client goes silent.",
              }),
        tone: "success",
      });
      await queryClient.invalidateQueries({ queryKey: gatewaysQueryKey(selectedCompanyId!) });
    },
    onError: (error) =>
      pushToast({
        title: t("gatewaysList.toast.errorTitle", { defaultValue: "Couldn't update the gateway" }),
        body: describeError(error).body,
        tone: "error",
      }),
  });

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("gatewaysList.selectOrganization", { defaultValue: "Select an organization to manage gateways." })}
      </div>
    );
  }

  const gateways = gatewaysQuery.data?.gateways ?? [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? gateways.filter((gateway) => {
        const scope = gatewayScopeLabel(gateway, projectNames, agentNames, t).toLowerCase();
        return (
          gateway.name.toLowerCase().includes(term) ||
          gateway.displaySlug.toLowerCase().includes(term) ||
          scope.includes(term)
        );
      })
    : gateways;

  return (
    <div className="max-w-5xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("gatewaysList.title", { defaultValue: "Apps" })}</h1>
        <p className="text-sm text-muted-foreground">
          {t("gatewaysList.description", {
            defaultValue:
              "A gateway is one safe MCP endpoint that exposes only the apps you assign. Hand it to a client like Cursor or Claude Desktop.",
          })}
        </p>
      </header>

      {gatewaysQuery.isLoading || gatewaysView.kind === "reconnecting" ? (
        <div className="space-y-3 pt-2">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : gatewaysView.kind === "error" ? (
        <QueryErrorState
          error={gatewaysQuery.error}
          action="load gateways"
          onRetry={gatewaysView.retry}
          retrying={gatewaysView.isFetching}
        />
      ) : gateways.length === 0 ? (
        <EmptyGateways onCreate={() => setCreating(true)} />
      ) : (
        <div className="space-y-4 pt-1">
          <div data-canonical-toolbar="gateways" role="toolbar" aria-label={t("gatewaysList.controls", { defaultValue: "Gateway controls" })} className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("gatewaysList.searchPlaceholder", { defaultValue: "Search by name, app, or owner" })}
                className="pl-9"
                aria-label={t("gatewaysList.searchAria", { defaultValue: "Search gateways" })}
              />
            </div>
            <Button data-toolbar-primary className="ml-auto" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("gatewaysList.newGateway", { defaultValue: "New gateway" })}
            </Button>
          </div>

          {(() => {
            const rows = filtered.map((gateway) => {
              const profile = profileById.get(gateway.profileId);
              const apps = deriveGatewayApps(
                profile,
                applicationsQuery.data?.applications ?? [],
                connectionsQuery.data?.connections ?? [],
              );
              return {
                gateway,
                profile,
                scope: gatewayScopeLabel(gateway, projectNames, agentNames, t),
                appsLabel: `${t("gatewaysList.appCount", { count: apps.length, defaultValue: "{{count}} app" })}${
                  profile ? ` · ${gatewayToolsLabel(profile, t)}` : ""
                }`,
                active: activeTokenCount(gateway),
                expiring: expiringTokenCount(gateway),
                lastUsed: latestTokenActivity(gateway),
                href: gatewayTabHref(gateway.id, "overview"),
              };
            });
            const toggle = (gateway: ToolMcpGatewayWithTokens) => (
              <ToggleSwitch
                checked={isGatewayOn(gateway)}
                disabled={toggleMutation.isPending}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={() => toggleMutation.mutate({ gateway })}
                aria-label={
                  isGatewayOn(gateway)
                    ? t("gatewaysList.turnOff", { name: gateway.name, defaultValue: "Turn {{name}} off" })
                    : t("gatewaysList.turnOn", { name: gateway.name, defaultValue: "Turn {{name}} on" })
                }
              />
            );
            const empty = (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("gatewaysList.emptySearch", { term: search.trim(), defaultValue: "No gateways match “{{term}}”." })}
              </div>
            );
            return (
              <>
                {/* Desktop / tablet: full table. */}
                <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
                  <table className="w-full min-w-(--sz-40rem) text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="whitespace-nowrap px-4 py-2.5">{t("gatewaysList.columnGateway", { defaultValue: "Gateway" })}</th>
                        <th className="whitespace-nowrap px-4 py-2.5">{t("gatewaysList.columnScope", { defaultValue: "Scope" })}</th>
                        <th className="whitespace-nowrap px-4 py-2.5">{t("gatewaysList.columnApps", { defaultValue: "Apps" })}</th>
                        <th className="whitespace-nowrap px-4 py-2.5">{t("gatewaysList.columnTokens", { defaultValue: "Tokens" })}</th>
                        <th className="whitespace-nowrap px-4 py-2.5">{t("gatewaysList.columnLastUsed", { defaultValue: "Last used" })}</th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-right">{t("gatewaysList.columnOn", { defaultValue: "On" })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ gateway, scope, appsLabel, active, expiring, lastUsed, href }) => (
                        <tr
                          key={gateway.id}
                          onClick={() => navigate(href)}
                          className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                        >
                          <td className="w-64 max-w-64 whitespace-nowrap px-4 py-3">
                            <div className="font-medium text-foreground">{gateway.name}</div>
                            <CopyableGatewayUrl endpointPath={gateway.endpointPath} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{scope}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{appsLabel}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {t("gatewaysList.activeCount", { count: active, defaultValue: "{{count}} active" })}
                            {expiring > 0
                              ? ` · ${t("gatewaysList.expiringCount", { count: expiring, defaultValue: "{{count}} expiring" })}`
                              : ""}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {lastUsed ? <RelativeTime value={lastUsed} /> : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">{toggle(gateway)}</div>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={6}>{empty}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: stacked cards so the On toggle stays reachable and thumb-sized. */}
                <div className="space-y-3 sm:hidden">
                  {rows.map(({ gateway, scope, appsLabel, active, expiring, lastUsed, href }) => (
                    <div
                      key={gateway.id}
                      onClick={() => navigate(href)}
                      className="cursor-pointer rounded-lg border border-border p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{gateway.name}</div>
                          <CopyableGatewayUrl endpointPath={gateway.endpointPath} />
                        </div>
                        <div className="shrink-0">{toggle(gateway)}</div>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <MobileField label={t("gatewaysList.columnScope", { defaultValue: "Scope" })} value={scope} />
                        <MobileField label={t("gatewaysList.columnApps", { defaultValue: "Apps" })} value={appsLabel} />
                        <MobileField
                          label={t("gatewaysList.columnTokens", { defaultValue: "Tokens" })}
                          value={`${t("gatewaysList.activeCount", { count: active, defaultValue: "{{count}} active" })}${
                            expiring > 0
                              ? ` · ${t("gatewaysList.expiringCount", { count: expiring, defaultValue: "{{count}} expiring" })}`
                              : ""
                          }`}
                        />
                        <MobileField
                          label={t("gatewaysList.columnLastUsed", { defaultValue: "Last used" })}
                          value={lastUsed ? <RelativeTime value={lastUsed} /> : "—"}
                        />
                      </dl>
                    </div>
                  ))}
                  {rows.length === 0 ? (
                    <div className="rounded-lg border border-border">{empty}</div>
                  ) : null}
                </div>
              </>
            );
          })()}

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="text-sm font-semibold text-foreground">
              {t("gatewaysList.whyTitle", { defaultValue: "Why a gateway?" })}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("gatewaysList.whyDescription", {
                defaultValue:
                  "You pick which apps go through it, who can use it, and how. Revoke the token, the whole gateway goes silent — no app-by-app cleanup.",
              })}
            </p>
          </div>
        </div>
      )}

      <NewGatewayDialog
        companyId={selectedCompanyId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(gatewayId) => navigate(gatewayTabHref(gatewayId, "overview"))}
      />
    </div>
  );
}

/** One label:value pair inside a mobile stacked card. */
function MobileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground">{value}</dd>
    </div>
  );
}

function EmptyGateways({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-dashed border-border p-12 text-center">
      <h2 className="text-lg font-semibold text-foreground">
        {t("gatewaysList.emptyTitle", { defaultValue: "No gateways yet" })}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {t("gatewaysList.emptyDescription", {
          defaultValue:
            "Group your connected apps into one safe endpoint you can hand to a client, then revoke it in one move.",
        })}
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <Plus className="mr-1.5 h-4 w-4" />
        {t("gatewaysList.newGateway", { defaultValue: "New gateway" })}
      </Button>
    </div>
  );
}
