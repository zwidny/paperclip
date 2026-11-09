import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical, Lock, Play } from "lucide-react";
import type {
  InstanceExperimentalSettings,
  InstanceExperimentalSettingsWithManaged,
  InstanceFeatureKey,
  ManagedSettingMetadata,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { experimentalSettingKey } from "@paperclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { QueryErrorState, useQueryView } from "@/components/QueryView";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";
import { getWorktreeInstanceId, isWorktreeRuntime } from "../lib/worktree-branding";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/lib/router";
import { ClassicWorkspaceSetting } from "@/components/ClassicWorkspaceSetting";
import { describeError } from "@/api/errors";
import { useTranslation } from "../i18n";

type WorktreeRunExecutionDisplayState =
  | { kind: "off" }
  | { kind: "armed"; activatedAt: string }
  | { kind: "fail_closed"; reason: "missing_cutoff" | "missing_instance_id" | "instance_mismatch" };

/**
 * Mirror of the server's `resolveWorktreeRunExecutionActivation` fail-closed
 * ladder (server/src/services/instance-settings.ts) so the card never claims a
 * copied/legacy row is arming execution. The derived fields are display-only —
 * the PATCH the toggle sends still writes just the boolean.
 */
function resolveWorktreeRunExecutionDisplayState(
  settings:
    | Pick<
        InstanceExperimentalSettings,
        | "enableWorktreeRunExecution"
        | "worktreeRunExecutionActivatedAt"
        | "worktreeRunExecutionActivationInstanceId"
      >
    | undefined,
  currentInstanceId: string | null,
): WorktreeRunExecutionDisplayState {
  if (settings?.enableWorktreeRunExecution !== true) return { kind: "off" };
  if (!settings.worktreeRunExecutionActivatedAt) return { kind: "fail_closed", reason: "missing_cutoff" };
  if (!currentInstanceId) return { kind: "fail_closed", reason: "missing_instance_id" };
  if (settings.worktreeRunExecutionActivationInstanceId !== currentInstanceId) {
    return { kind: "fail_closed", reason: "instance_mismatch" };
  }
  return { kind: "armed", activatedAt: settings.worktreeRunExecutionActivatedAt };
}

function formatActivationTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// PAP-11233: keep Conference Room code intact, but hide the user-facing opt-in for now.
const SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING = false;

function ManagedByCloudBadge() {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Lock aria-hidden="true" />
      {t("experimental.managedByCloud", { defaultValue: "Managed by Paperclip Cloud" })}
    </Badge>
  );
}

function ExperimentalToggleCard({
  title,
  description,
  footnote,
  checked,
  onCheckedChange,
  disabled,
  settingKey,
  managed,
  ariaLabel,
}: {
  title: string;
  description: string;
  footnote?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  /** Flag key backing this card; operator-hidden keys render nothing. */
  settingKey: InstanceFeatureKey;
  managed?: ManagedSettingMetadata;
  ariaLabel: string;
}) {
  const { hidden: hiddenSettings } = useHiddenSettings();
  const isManaged = managed?.managed === true;
  if (hiddenSettings.has(experimentalSettingKey(settingKey))) return null;
  return (
    <Card id={`experimental-${settingKey}`} className="block scroll-mt-4 bg-transparent p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {isManaged ? <ManagedByCloudBadge /> : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          {footnote ? <p className="max-w-2xl text-xs text-muted-foreground">{footnote}</p> : null}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={(next) => {
            if (isManaged) return;
            onCheckedChange(next);
          }}
          disabled={disabled || isManaged}
          aria-label={ariaLabel}
        />
      </div>
    </Card>
  );
}

export function InstanceExperimentalSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { hidden: hiddenSettings } = useHiddenSettings();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav.settings", { defaultValue: "Settings" }), href: "/company/settings" },
      { label: t("experimental.title", { defaultValue: "Experimental" }) },
    ]);
  }, [setBreadcrumbs, t]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const experimentalView = useQueryView(experimentalQuery);

  const toggleMutation = useMutation<
    InstanceExperimentalSettingsWithManaged,
    Error,
    PatchInstanceExperimentalSettings,
    { previousSettings?: InstanceExperimentalSettingsWithManaged }
  >({
    mutationFn: async (patch: PatchInstanceExperimentalSettings) =>
      instanceSettingsApi.updateExperimental(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.instance.experimentalSettings });
      const previousSettings = queryClient.getQueryData<InstanceExperimentalSettingsWithManaged>(
        queryKeys.instance.experimentalSettings,
      );
      if (previousSettings) {
        queryClient.setQueryData<InstanceExperimentalSettingsWithManaged>(
          queryKeys.instance.experimentalSettings,
          { ...previousSettings, ...patch },
        );
      }
      return { previousSettings };
    },
    onSuccess: async (updatedSettings) => {
      setActionError(null);
      queryClient.setQueryData(queryKeys.instance.experimentalSettings, updatedSettings);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adapters.all }),
        queryClient.invalidateQueries({ queryKey: ["built-in-agents"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
        queryClient.invalidateQueries({ queryKey: ["apps"] }),
      ]);
    },
    onError: (error, _patch, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.instance.experimentalSettings, context.previousSettings);
      }
      setActionError(describeError(error).body);
    },
  });

  if (experimentalQuery.isLoading || experimentalView.kind === "reconnecting") {
    return (
      <div className="max-w-6xl space-y-6">
        <ClassicWorkspaceSetting key="personal-workspace" />
        <div className="text-sm text-muted-foreground">{t("experimental.loading", { defaultValue: "Loading experimental settings..." })}</div>
      </div>
    );
  }

  if (experimentalView.kind === "error") {
    return (
<div className="max-w-6xl space-y-6"><ClassicWorkspaceSetting key="personal-workspace" />      <QueryErrorState
        size="page"
        error={experimentalQuery.error}
        action="load experimental settings"
        onRetry={experimentalView.retry}
        retrying={experimentalView.isFetching}
      />
</div>
    );
  }

  const inWorktree = isWorktreeRuntime();
  // Present only on cloud-managed instances: keys the managed overlay controls
  // render locked with the "Managed by Paperclip Cloud" badge. Self-hosted
  // responses carry no `managedKeys`, so every card stays editable.
  const managedKeys = experimentalQuery.data?.managedKeys ?? {};
  const enableWorktreeRunExecution = experimentalQuery.data?.enableWorktreeRunExecution === true;
  const worktreeRunExecutionManaged = managedKeys.enableWorktreeRunExecution?.managed === true;
  const worktreeRunExecutionState = resolveWorktreeRunExecutionDisplayState(
    experimentalQuery.data,
    getWorktreeInstanceId(),
  );
  const enableEnvironments = experimentalQuery.data?.enableEnvironments === true;
  const enableNativeRunner = experimentalQuery.data?.enableNativeRunner === true;
  const enableChatConnectors = experimentalQuery.data?.enableChatConnectors === true;
  const enableManagedSandboxOnly = experimentalQuery.data?.enableManagedSandboxOnly === true;
  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  const enableIsolatedWorkspacesByDefault =
    experimentalQuery.data?.enableIsolatedWorkspacesByDefault === true;
  // Streamlined left navigation is now the standard sidebar (PAP-12472); the
  // experimental opt-out was retired, so it no longer surfaces a toggle here.
  const enableStreamlinedUi = experimentalQuery.data?.enableStreamlinedUi !== false;
  const enableConferenceRoomChat = experimentalQuery.data?.enableConferenceRoomChat === true;
  const enableClassicTaskInterface = experimentalQuery.data?.enableClassicTaskInterface === true;
  const enableIssuePlanDecompositions =
    experimentalQuery.data?.enableIssuePlanDecompositions === true;
  const enableExperimentalFileViewer =
    experimentalQuery.data?.enableExperimentalFileViewer === true;
  const enableExternalObjects = experimentalQuery.data?.enableExternalObjects === true;
  const enableBuiltInAgents = experimentalQuery.data?.enableBuiltInAgents === true;
  const enableBetaSkills = experimentalQuery.data?.enableBetaSkills === true;
  const enableSummaries = experimentalQuery.data?.enableSummaries === true;
  const enableStatusCards = experimentalQuery.data?.enableStatusCards === true;
  const summariesManaged = managedKeys.enableSummaries?.managed === true;
  const statusCardsManaged = managedKeys.enableStatusCards?.managed === true;
  const statusCardsBlockedByManagedSummaries = summariesManaged && !enableSummaries;
  const summariesRequiredByManagedStatusCards = statusCardsManaged && enableStatusCards;
  const enableDecisions = experimentalQuery.data?.enableDecisions === true;
  const enableGoalsSidebarLink = experimentalQuery.data?.enableGoalsSidebarLink === true;
  const enableCases = experimentalQuery.data?.enableCases === true;
  const enableServerInfoDebugView = experimentalQuery.data?.enableServerInfoDebugView === true;
  const enablePaperclipDeveloperMode =
    experimentalQuery.data?.enablePaperclipDeveloperMode === true;
  const enableSimplifiedEnglishInteractions =
    experimentalQuery.data?.enableSimplifiedEnglishInteractions === true;
  const enableFirstTaskPlanProposal =
    experimentalQuery.data?.enableFirstTaskPlanProposal === true;
  const enableSmokeLab = experimentalQuery.data?.enableSmokeLab === true;
  const autoRestartDevServerWhenIdle = experimentalQuery.data?.autoRestartDevServerWhenIdle === true;
  const isVisible = (key: InstanceFeatureKey) => !hiddenSettings.has(experimentalSettingKey(key));
  const showWorktreeRunExecution = inWorktree && isVisible("enableWorktreeRunExecution");
  const showDeveloperSection = showWorktreeRunExecution || ([
    "autoRestartDevServerWhenIdle",
    "enableManagedSandboxOnly",
    "enablePaperclipDeveloperMode",
    "enableServerInfoDebugView",
    "enableSmokeLab",
    "enableIssuePlanDecompositions",
  ] satisfies InstanceFeatureKey[]).some(isVisible);
  const showLegacySection = isVisible("enableClassicTaskInterface") || isVisible("enableGoalsSidebarLink");
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("experimental.title", { defaultValue: "Experimental" })}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("experimental.description", {
            defaultValue:
              "Opt into features that are still being evaluated before they become default behavior.",
          })}
        </p>
      </div>

      <ClassicWorkspaceSetting key="personal-workspace" />

      <div
        role="alert"
        className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">
              {t("experimental.warningTitle", { defaultValue: "Experimental features may break at any time." })}
            </p>
            <p className="text-muted-foreground">
              {t("experimental.warningBody", {
                defaultValue:
                  "These features are opt-in and come with no compatibility guarantees. They may change, break, or be removed without notice. Avoid relying on them for critical or production workflows.",
              })}
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="space-y-3" aria-labelledby="experimental-features-heading">
        <div className="space-y-1">
          <h2 id="experimental-features-heading" className="text-sm font-semibold">
            {t("experimental.featuresHeading", { defaultValue: "Experimental features" })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("experimental.featuresDescription", {
              defaultValue: "Optional product features that are still being evaluated.",
            })}
          </p>
        </div>

        <ExperimentalToggleCard
          title={t("experimental.cards.assistantConnections.title", { defaultValue: "Assistant connections (MCP)" })}
          description={t("experimental.cards.assistantConnections.description", { defaultValue: "Connect Codex, Claude, and other assistants to your Paperclip organization. People sign in, select an organization once, and approve access to review work, delegate tasks, and add feedback." })}
          footnote={<>{t("experimental.cards.assistantConnections.footnote", { defaultValue: "Requires an authenticated instance with a configured public URL. Takes effect immediately. Turning this off blocks assistant calls and event delivery; work already delegated continues." })}{experimentalQuery.data?.enablePublicMcp && <> <Link className="underline" to="/apps/assistant-connection">{t("experimental.cards.assistantConnections.setupLink", { defaultValue: "Set up an assistant connection" })}</Link></>}</>}
          checked={experimentalQuery.data?.enablePublicMcp === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enablePublicMcp: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enablePublicMcp"
          managed={managedKeys.enablePublicMcp}
          ariaLabel={t("experimental.cards.assistantConnections.ariaLabel", { defaultValue: "Toggle assistant connections experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.betaSkills.title", { defaultValue: "Beta skills" })}
          description={t("experimental.cards.betaSkills.description", { defaultValue: "Allow agents to pin beta releases of the Paperclip core skill. Disabling this returns every agent to the default live skill without removing saved pins." })}
          checked={enableBetaSkills}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBetaSkills: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBetaSkills"
          managed={managedKeys.enableBetaSkills}
          ariaLabel={t("experimental.cards.betaSkills.ariaLabel", { defaultValue: "Toggle beta skills experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.builtInAgents.title", { defaultValue: "Built-in Agents" })}
          description={t("experimental.cards.builtInAgents.description", { defaultValue: "Show Paperclip-managed built-in agent surfaces, including built-in roster badges, the Built-in agents tab, and built-in agent setup controls." })}
          checked={enableBuiltInAgents}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBuiltInAgents: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBuiltInAgents"
          managed={managedKeys.enableBuiltInAgents}
          ariaLabel={t("experimental.cards.builtInAgents.ariaLabel", { defaultValue: "Toggle built-in agents experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.cases.title", { defaultValue: "Cases" })}
          description={t("experimental.cards.cases.description", { defaultValue: "Durable work products (blog posts, tweet storms…) that tasks create and iterate on. Adds the Cases tab and the agent case API." })}
          footnote={t("experimental.cards.cases.footnote", { defaultValue: "Turning Cases off hides the tab and blocks the case API; existing case data is kept." })}
          checked={enableCases}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableCases: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableCases"
          managed={managedKeys.enableCases}
          ariaLabel={t("experimental.cards.cases.ariaLabel", { defaultValue: "Toggle cases experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.chatConnectors.title", { defaultValue: "Chat connectors" })}
          description={t("experimental.cards.chatConnectors.description", { defaultValue: "Connect agents to Slack, Discord, Microsoft Teams, and Telegram conversations." })}
          footnote={t("experimental.cards.chatConnectors.footnote", { defaultValue: "Turning this off hides experimental chat setup and connected-task controls. Existing chat connections keep running. AgentMail, GitHub review bots, and tool connectors are controlled separately." })}
          checked={enableChatConnectors}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableChatConnectors: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableChatConnectors"
          managed={managedKeys.enableChatConnectors}
          ariaLabel={t("experimental.cards.chatConnectors.ariaLabel", { defaultValue: "Toggle chat connectors experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.combinedInbox.title", { defaultValue: "Combined Inbox + Task List" })}
          description={t("experimental.cards.combinedInbox.description", { defaultValue: "In the Classic workspace, fold Inbox into Tasks. One Tasks row carries the unread badge, and a Views menu reaches every personal and organization task view." })}
          footnote={t("experimental.cards.combinedInbox.footnote", { defaultValue: "Coordinator always includes personal views in Tasks. For Classic, turning this off restores its separate Inbox. No data changes." })}
          checked={experimentalQuery.data?.enableCombinedInboxTasks ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableCombinedInboxTasks: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableCombinedInboxTasks"
          managed={managedKeys.enableCombinedInboxTasks}
          ariaLabel={t("experimental.cards.combinedInbox.ariaLabel", { defaultValue: "Toggle combined inbox and task list experimental setting" })}
        />

        {SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING ? (
          <ExperimentalToggleCard
            title={t("experimental.cards.conferenceRoom.title", { defaultValue: "Conference Room Chat" })}
            description={t("experimental.cards.conferenceRoom.description", { defaultValue: "Adds a Conference Room — one chat where you and your whole team work together — plus the live activity feed and the redesigned onboarding. Also restyles task threads as chat bubbles. Turn off anytime to restore the classic UI." })}
            checked={enableConferenceRoomChat}
            onCheckedChange={(checked) => toggleMutation.mutate({ enableConferenceRoomChat: checked })}
            disabled={toggleMutation.isPending}
            settingKey="enableConferenceRoomChat"
            managed={managedKeys.enableConferenceRoomChat}
            ariaLabel={t("experimental.cards.conferenceRoom.ariaLabel", { defaultValue: "Toggle conference room chat experimental setting" })}
          />
        ) : null}

        <ExperimentalToggleCard
          title={t("experimental.cards.legacyComposer.title", { defaultValue: "Command/Ctrl+Enter to Submit" })}
          description={t("experimental.cards.legacyComposer.description", { defaultValue: "Restore the previous keyboard shortcut for task replies and new tasks: Command/Ctrl+Enter submits, and Enter adds a new line." })}
          footnote={t("experimental.cards.legacyComposer.footnote", { defaultValue: "Off by default: Enter submits, and Shift+Enter adds a new line." })}
          checked={experimentalQuery.data?.enableLegacyComposerSubmit === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableLegacyComposerSubmit: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableLegacyComposerSubmit"
          managed={managedKeys.enableLegacyComposerSubmit}
          ariaLabel={t("experimental.cards.legacyComposer.ariaLabel", { defaultValue: "Toggle Command/Ctrl+Enter to submit" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.decisions.title", { defaultValue: "Decisions" })}
          description={t("experimental.cards.decisions.description", { defaultValue: "Show the Decisions item in the main sidebar — the attention home that surfaces the tasks awaiting your input — while the surface is still being evaluated." })}
          checked={enableDecisions}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableDecisions: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableDecisions"
          managed={managedKeys.enableDecisions}
          ariaLabel={t("experimental.cards.decisions.ariaLabel", { defaultValue: "Toggle decisions experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.environments.title", { defaultValue: "Enable Environments" })}
          description={t("experimental.cards.environments.description", { defaultValue: "Show environment management in company settings and allow project and agent environment assignment controls." })}
          checked={enableEnvironments}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableEnvironments: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableEnvironments"
          managed={managedKeys.enableEnvironments}
          ariaLabel={t("experimental.cards.environments.ariaLabel", { defaultValue: "Toggle environments experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.externalObjects.title", { defaultValue: "Enable External Objects" })}
          description={t("experimental.cards.externalObjects.description", { defaultValue: "Detect external URLs in issues and show resolved status for pull requests, tickets, and other referenced work objects." })}
          checked={enableExternalObjects}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExternalObjects: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExternalObjects"
          managed={managedKeys.enableExternalObjects}
          ariaLabel={t("experimental.cards.externalObjects.ariaLabel", { defaultValue: "Toggle external objects experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.isolatedWorkspaces.title", { defaultValue: "Enable Isolated Workspaces" })}
          description={t("experimental.cards.isolatedWorkspaces.description", { defaultValue: "Show execution workspace controls in project configuration and allow isolated workspace behavior for new and existing task runs." })}
          checked={enableIsolatedWorkspaces}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableIsolatedWorkspaces: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableIsolatedWorkspaces"
          managed={managedKeys.enableIsolatedWorkspaces}
          ariaLabel={t("experimental.cards.isolatedWorkspaces.ariaLabel", { defaultValue: "Toggle isolated workspaces experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.fastResponses.title", { defaultValue: "Experimental fast responses" })}
          description={t("experimental.cards.fastResponses.description", { defaultValue: "Allow short acknowledgements while agents begin work. Configure them in Settings → Connections." })}
          checked={experimentalQuery.data?.enableFastResponses ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableFastResponses: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableFastResponses"
          managed={managedKeys.enableFastResponses}
          ariaLabel={t("experimental.cards.fastResponses.ariaLabel", { defaultValue: "Toggle fast responses experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.fileViewer.title", { defaultValue: "Experimental File Viewer" })}
          description={t("experimental.cards.fileViewer.description", { defaultValue: "Show task detail controls for browsing and previewing workspace files relative to a task." })}
          checked={enableExperimentalFileViewer}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExperimentalFileViewer: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExperimentalFileViewer"
          managed={managedKeys.enableExperimentalFileViewer}
          ariaLabel={t("experimental.cards.fileViewer.ariaLabel", { defaultValue: "Toggle experimental file viewer setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.firstTaskPlan.title", { defaultValue: "First task: propose with a plan document" })}
          description={t("experimental.cards.firstTaskPlan.description", { defaultValue: "When the user's first request is a single task, the chief of staff writes a short plan document and a checkbox card instead of a one-card confirmation. Applies to organizations created after the toggle is flipped." })}
          checked={enableFirstTaskPlanProposal}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableFirstTaskPlanProposal: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableFirstTaskPlanProposal"
          managed={managedKeys.enableFirstTaskPlanProposal}
          ariaLabel={t("experimental.cards.firstTaskPlan.ariaLabel", { defaultValue: "Toggle first task plan proposal experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.githubReviewBots.title", { defaultValue: "GitHub review bots" })}
          description={t("experimental.cards.githubReviewBots.description", { defaultValue: "Connect agents to GitHub with their own App identity to review pull requests and respond to issues." })}
          footnote={t("experimental.cards.githubReviewBots.footnote", { defaultValue: "Independent of Chat connectors. Turning this off hides setup and management; existing bots keep running. GitHub tool connections stay available." })}
          checked={experimentalQuery.data?.enableGitHubReviewBots === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableGitHubReviewBots: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableGitHubReviewBots"
          managed={managedKeys.enableGitHubReviewBots}
          ariaLabel={t("experimental.cards.githubReviewBots.ariaLabel", { defaultValue: "Toggle GitHub review bots experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.googleWorkspace.title", { defaultValue: "Google Workspace connector (Paperclip)" })}
          description={t("experimental.cards.googleWorkspace.description", { defaultValue: "Show the built-in Google Workspace connector for Gmail, Drive, and Calendar while Google verification is pending." })}
          footnote={t("experimental.cards.googleWorkspace.footnote", { defaultValue: "Off by default. While off, Google apps are offered through Composio and Arcade instead, and the built-in connector cannot be set up or run." })}
          checked={experimentalQuery.data?.enableGoogleWorkspaceConnector === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableGoogleWorkspaceConnector: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableGoogleWorkspaceConnector"
          managed={managedKeys.enableGoogleWorkspaceConnector}
          ariaLabel={t("experimental.cards.googleWorkspace.ariaLabel", { defaultValue: "Toggle Paperclip Google Workspace connector experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.grokBot.title", { defaultValue: "Grok Bot" })}
          description={t("experimental.cards.grokBot.description", { defaultValue: "Connect an existing Grok Bot as an agent. Verify routine delivery and an authenticated reply before assigning work." })}
          footnote={t("experimental.cards.grokBot.footnote", { defaultValue: "Requires Assistant connections (MCP), Paperclip Runner, and authenticated public HTTPS. Usage is not reported. Turning this off blocks Grok calls and new dispatch." })}
          checked={experimentalQuery.data?.enableGrokBot === true}
          onCheckedChange={checked => toggleMutation.mutate({ enableGrokBot: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableGrokBot" managed={managedKeys.enableGrokBot}
          ariaLabel={t("experimental.cards.grokBot.ariaLabel", { defaultValue: "Toggle Grok Bot experimental setting" })}
        />


        <ExperimentalToggleCard
          title={t("experimental.cards.memoryConnectors.title", { defaultValue: "Memory connectors" })}
          description={t("experimental.cards.memoryConnectors.description", { defaultValue: "Connect Mem0, Zep, Supermemory, Cognee, and Honcho for long-term memory and context." })}
          footnote={t("experimental.cards.memoryConnectors.footnote", { defaultValue: "Turning this off hides setup for these connectors. Existing connections keep running." })}
          checked={experimentalQuery.data?.enableMemoryConnectors === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableMemoryConnectors: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableMemoryConnectors"
          managed={managedKeys.enableMemoryConnectors}
          ariaLabel={t("experimental.cards.memoryConnectors.ariaLabel", { defaultValue: "Toggle memory connectors experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.muse.title", { defaultValue: "Muse — Personal agent" })}
          description={t("experimental.cards.muse.description", { defaultValue: "Connect your personal Meta Muse. Pair it, detect its receiver, and verify an independent background reply before assigning tasks." })}
          footnote={t("experimental.cards.muse.footnote", { defaultValue: "Requires Paperclip Runner and an authenticated instance with a public HTTPS URL. Turning this off blocks new work; cleanup and stop evidence remain available. Provider usage and cost are unavailable." })}
          checked={experimentalQuery.data?.enableMuse === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableMuse: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableMuse"
          managed={managedKeys.enableMuse}
          ariaLabel={t("experimental.cards.muse.ariaLabel", { defaultValue: "Toggle Muse experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.openAiDot.title", { defaultValue: "OpenAI Dot" })}
          description={t("experimental.cards.openAiDot.description", { defaultValue: "Add OpenAI Dot as a standalone agent choice. Pair your Dot and verify event delivery before assigning work." })}
          footnote={t("experimental.cards.openAiDot.footnote", { defaultValue: "Requires Assistant connections (MCP) and an authenticated instance with a public HTTPS URL. Turning this off blocks Dot calls and new work; saved connections are kept." })}
          checked={experimentalQuery.data?.enableOpenAiDot === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableOpenAiDot: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableOpenAiDot"
          managed={managedKeys.enableOpenAiDot}
          ariaLabel={t("experimental.cards.openAiDot.ariaLabel", { defaultValue: "Toggle OpenAI Dot experimental setting" })}
        />


        <ExperimentalToggleCard
          title={t("experimental.cards.paperclipRunner.title", { defaultValue: "Paperclip Runner" })}
          description={t("experimental.cards.paperclipRunner.description", { defaultValue: "Allow agents to select Paperclip Runner, including authenticated runner ingress when a sandbox requires it. First-run setup offers qualified GitHub Copilot. Turning this off hides the choice without affecting existing native runs." })}
          checked={enableNativeRunner}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableNativeRunner: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableNativeRunner"
          managed={managedKeys.enableNativeRunner}
          ariaLabel={t("experimental.cards.paperclipRunner.ariaLabel", { defaultValue: "Toggle Paperclip Runner experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.simplifiedEnglish.title", { defaultValue: "Simplified English Interactions" })}
          description={t("experimental.cards.simplifiedEnglish.description", { defaultValue: "Instruct agents to write user interactions (plan confirmations, questions, suggested tasks, checkbox prompts) in ASD-STE100 Simplified Technical English, with brief context on what information the decision needs and what happens for each choice." })}
          checked={enableSimplifiedEnglishInteractions}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableSimplifiedEnglishInteractions: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableSimplifiedEnglishInteractions"
          managed={managedKeys.enableSimplifiedEnglishInteractions}
          ariaLabel={t("experimental.cards.simplifiedEnglish.ariaLabel", { defaultValue: "Toggle simplified english interactions experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.statusCards.title", { defaultValue: "Status Cards" })}
          description={t("experimental.cards.statusCards.description", { defaultValue: "Enable the experimental shared status-card board and its gated API. Existing card data is kept when this is disabled." })}
          footnote={t("experimental.cards.statusCards.footnote", { defaultValue: "Enabling Status Cards also enables Summaries." })}
          checked={enableStatusCards}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked
                ? { enableSummaries: true, enableStatusCards: true }
                : { enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || statusCardsBlockedByManagedSummaries}
          settingKey="enableStatusCards"
          managed={managedKeys.enableStatusCards}
          ariaLabel={t("experimental.cards.statusCards.ariaLabel", { defaultValue: "Toggle status cards experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.streamlinedUi.title", { defaultValue: "Streamlined UI" })}
          description={t("experimental.cards.streamlinedUi.description", { defaultValue: "Use the simplified main sidebar, shared Tasks and Inbox presentation, focused task detail layout, and contextual navigation across Agents, Routines, Skills, and Settings." })}
          footnote={t("experimental.cards.streamlinedUi.footnote", { defaultValue: "Turning this off restores the legacy shell and navigation. Task and page data are unchanged." })}
          checked={enableStreamlinedUi}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableStreamlinedUi: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableStreamlinedUi"
          managed={managedKeys.enableStreamlinedUi}
          ariaLabel={t("experimental.cards.streamlinedUi.ariaLabel", { defaultValue: "Toggle Streamlined UI experimental setting" })}
        />

        <ExperimentalToggleCard
          title={t("experimental.cards.summaries.title", { defaultValue: "Summaries" })}
          description={t("experimental.cards.summaries.description", { defaultValue: "Show Summarizer-generated status slots on project and workspace pages, with on-demand refresh and revision history. Existing summary data is kept when this is disabled." })}
          footnote={t("experimental.cards.summaries.footnote", { defaultValue: "Status Cards requires Summaries. Disabling Summaries also disables Status Cards." })}
          checked={enableSummaries}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked || !enableStatusCards
                ? { enableSummaries: checked }
                : { enableSummaries: false, enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || summariesRequiredByManagedStatusCards}
          settingKey="enableSummaries"
          managed={managedKeys.enableSummaries}
          ariaLabel={t("experimental.cards.summaries.ariaLabel", { defaultValue: "Toggle summaries experimental setting" })}
        />

        {enableIsolatedWorkspaces && (
          <ExperimentalToggleCard
            title={t("experimental.cards.isolatedWorkspacesDefault.title", { defaultValue: "Use Isolated Workspaces By Default" })}
            description={t("experimental.cards.isolatedWorkspacesDefault.description", { defaultValue: "Treat a project that has no execution workspace policy of its own as if it selected isolated workspaces, so its tasks get a per-task worktree instead of sharing the project checkout. A project that carries its own policy keeps it." })}
            checked={enableIsolatedWorkspacesByDefault}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableIsolatedWorkspacesByDefault: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableIsolatedWorkspacesByDefault"
            managed={managedKeys.enableIsolatedWorkspacesByDefault}
            ariaLabel={t("experimental.cards.isolatedWorkspacesDefault.ariaLabel", { defaultValue: "Toggle isolated workspaces by default experimental setting" })}
          />
        )}
      </section>

      {showDeveloperSection ? (
        <section className="space-y-3" aria-labelledby="developer-mode-heading">
          <div className="space-y-1">
            <h2 id="developer-mode-heading" className="text-sm font-semibold">
              {t("experimental.developerHeading", { defaultValue: "Paperclip Developer Mode" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("experimental.developerDescription", {
                defaultValue: "Internal tools for developing, testing, and debugging Paperclip.",
              })}
            </p>
          </div>

          <ExperimentalToggleCard
            title={t("experimental.cards.devAutoRestart.title", { defaultValue: "Auto-Restart Dev Server When Idle" })}
            description={t("experimental.cards.devAutoRestart.description", { defaultValue: "In `pnpm dev:once`, wait for all queued and running local agent runs to finish, then restart the server automatically when backend changes or migrations make the current boot stale." })}
            checked={autoRestartDevServerWhenIdle}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ autoRestartDevServerWhenIdle: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="autoRestartDevServerWhenIdle"
            managed={managedKeys.autoRestartDevServerWhenIdle}
            ariaLabel={t("experimental.cards.devAutoRestart.ariaLabel", { defaultValue: "Toggle guarded dev-server auto-restart" })}
          />

          <ExperimentalToggleCard
            title={t("experimental.cards.devManagedSandboxOnly.title", { defaultValue: "Managed Environment Only" })}
            description={t("experimental.cards.devManagedSandboxOnly.description", { defaultValue: "Hide the local environment and run all agents in the platform-managed environment." })}
            checked={enableManagedSandboxOnly}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableManagedSandboxOnly: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableManagedSandboxOnly"
            managed={managedKeys.enableManagedSandboxOnly}
            ariaLabel={t("experimental.cards.devManagedSandboxOnly.ariaLabel", { defaultValue: "Toggle managed environment only experimental setting" })}
          />

          <ExperimentalToggleCard
            title={t("experimental.cards.devDeveloperMode.title", { defaultValue: "Paperclip Developer Mode" })}
            description={t("experimental.cards.devDeveloperMode.description", { defaultValue: "Show internal Paperclip maintainer tools and observability links, including Honeycomb trace queries on run pages." })}
            checked={enablePaperclipDeveloperMode}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enablePaperclipDeveloperMode: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enablePaperclipDeveloperMode"
            managed={managedKeys.enablePaperclipDeveloperMode}
            ariaLabel={t("experimental.cards.devDeveloperMode.ariaLabel", { defaultValue: "Toggle Paperclip developer mode experimental setting" })}
          />

          {showWorktreeRunExecution ? (
            <Card className="block bg-transparent p-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {t("experimental.worktree.title", { defaultValue: "Run tasks in this worktree" })}
                      </h3>
                      {worktreeRunExecutionManaged ? <ManagedByCloudBadge /> : null}
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      {t("experimental.worktree.description", {
                        defaultValue:
                          "This is an isolated git-worktree preview instance. Turn this on to let the scheduler execute runs here. Only tasks created after enabling will run automatically — copied/pre-existing tasks stay parked. Toggling off and on resets the cutoff.",
                      })}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={enableWorktreeRunExecution}
                    onCheckedChange={(checked) => {
                      if (worktreeRunExecutionManaged) return;
                      toggleMutation.mutate({ enableWorktreeRunExecution: checked });
                    }}
                    disabled={toggleMutation.isPending || worktreeRunExecutionManaged}
                    aria-label={t("experimental.worktree.ariaLabel", {
                      defaultValue: "Toggle worktree run execution setting",
                    })}
                  />
                </div>

                {worktreeRunExecutionState.kind === "armed" ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-foreground">
                    <Play className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      {t("experimental.worktree.runningAfterPrefix", {
                        defaultValue: "Running tasks created after",
                      })}{" "}
                      <span className="font-medium">
                        {formatActivationTimestamp(worktreeRunExecutionState.activatedAt)}
                      </span>
                      {t("experimental.worktree.runningAfterSuffix", { defaultValue: "." })}
                    </span>
                  </div>
                ) : null}

                {worktreeRunExecutionState.kind === "fail_closed" ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">
                        {t("experimental.worktree.suppressedTitle", {
                          defaultValue: "Execution is suppressed — effectively off.",
                        })}
                      </p>
                      <p className="text-muted-foreground">
                        {worktreeRunExecutionState.reason === "instance_mismatch"
                          ? t("experimental.worktree.mismatchReason", {
                              defaultValue:
                                "This setting was armed in a different instance and copied here, so no tasks run automatically.",
                            })
                          : t("experimental.worktree.missingCutoffReason", {
                              defaultValue:
                                "This setting is missing its activation cutoff, so no tasks run automatically.",
                            })}{" "}
                        {t("experimental.worktree.armHint", {
                          defaultValue:
                            "Toggle it off and back on to arm execution for tasks created here.",
                        })}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <ExperimentalToggleCard
            title={t("experimental.cards.devServerInfo.title", { defaultValue: "Server Info Debug View" })}
            description={t("experimental.cards.devServerInfo.description", { defaultValue: "Show a \"Server\" section in the account drawer with the current server restart time and running commit." })}
            checked={enableServerInfoDebugView}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableServerInfoDebugView: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableServerInfoDebugView"
            managed={managedKeys.enableServerInfoDebugView}
            ariaLabel={t("experimental.cards.devServerInfo.ariaLabel", { defaultValue: "Toggle server info debug view experimental setting" })}
          />

          <ExperimentalToggleCard
            title={t("experimental.cards.devSmokeLab.title", { defaultValue: "Smoke Lab" })}
            description={t("experimental.cards.devSmokeLab.description", { defaultValue: "Add a \"Smoke Lab\" tab under Apps → Developer and an \"Integration smoke\" card on the dashboard for exercising every integration path against deterministic local fixtures (fake OAuth provider + loopback MCP servers). Private (non-public) deployments only." })}
            checked={enableSmokeLab}
            onCheckedChange={(checked) => toggleMutation.mutate({ enableSmokeLab: checked })}
            disabled={toggleMutation.isPending}
            settingKey="enableSmokeLab"
            managed={managedKeys.enableSmokeLab}
            ariaLabel={t("experimental.cards.devSmokeLab.ariaLabel", { defaultValue: "Toggle smoke lab experimental setting" })}
          />

          <ExperimentalToggleCard
            title={t("experimental.cards.devTaskPlanDecomposition.title", { defaultValue: "Task Plan Decomposition" })}
            description={t("experimental.cards.devTaskPlanDecomposition.description", { defaultValue: "Show accepted-plan decomposition history on task detail pages. Intended for debugging and validating subtask creation behavior while the presentation is still being refined." })}
            checked={enableIssuePlanDecompositions}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableIssuePlanDecompositions: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableIssuePlanDecompositions"
            managed={managedKeys.enableIssuePlanDecompositions}
            ariaLabel={t("experimental.cards.devTaskPlanDecomposition.ariaLabel", { defaultValue: "Toggle task plan decomposition panel experimental setting" })}
          />
        </section>
      ) : null}

      {showLegacySection ? (
        <section className="space-y-3" aria-labelledby="legacy-heading">
          <div className="space-y-1">
            <h2 id="legacy-heading" className="text-sm font-semibold">
              {t("experimental.legacyHeading", { defaultValue: "Legacy" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("experimental.legacyDescription", {
                defaultValue: "These features are going to be removed.",
              })}
            </p>
          </div>

          <ExperimentalToggleCard
            title={t("experimental.cards.classicTaskInterface.title", { defaultValue: "Classic Task Interface" })}
            description={t("experimental.cards.classicTaskInterface.description", { defaultValue: "Restores the previous task detail page: the page-level header with inline description editing, the plain comment thread, and the fixed Properties sidebar. Chat-only features — streaming activity folding, inline plan and question cards, the three-mode composer — are unavailable in the classic view." })}
            footnote={t("experimental.cards.classicTaskInterface.footnote", { defaultValue: "Switching takes effect immediately. No task data is affected." })}
            checked={enableClassicTaskInterface}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableClassicTaskInterface: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableClassicTaskInterface"
            managed={managedKeys.enableClassicTaskInterface}
            ariaLabel={t("experimental.cards.classicTaskInterface.ariaLabel", { defaultValue: "Toggle classic task interface experimental setting" })}
          />

          <ExperimentalToggleCard
            title={t("experimental.cards.goalsSidebarLink.title", { defaultValue: "Goals Sidebar Link" })}
            description={t("experimental.cards.goalsSidebarLink.description", { defaultValue: "Restore the Goals item in the main sidebar while the goals surface is being evaluated." })}
            checked={enableGoalsSidebarLink}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableGoalsSidebarLink: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableGoalsSidebarLink"
            managed={managedKeys.enableGoalsSidebarLink}
            ariaLabel={t("experimental.cards.goalsSidebarLink.ariaLabel", { defaultValue: "Toggle goals sidebar link experimental setting" })}
          />
        </section>
      ) : null}
    </div>
  );
}
