import { useAuthorizationWindow } from "@/hooks/useAuthorizationWindow";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { slackRegistrationErrorMessage } from "@paperclipai/shared";
import { chatEndpointsApi, type ChatEndpoint } from "@/api/chatEndpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SetupWizardFooter } from "@/components/SetupWizard";
import { useTranslation } from "../../../../i18n";
import { sanitizedSetupErrorMessage } from "../chat-setup-error";
import { SlackSetupAdvanced } from "../SlackAppDetails";
import { createUuid } from "../../../../lib/uuid";

/** Uses ordinary request-local state: configuration tokens never enter a query/mutation cache. */
export function OwnSlackAppSetup({ endpoint, stage, disabled, saveDetails, onSaved, onBusy,
  onManual, onManaged, onContinue, onSaveExit }: {
  endpoint: ChatEndpoint;
  stage: "app" | "credentials";
  disabled: boolean;
  saveDetails: () => Promise<void>;
  onSaved: (endpoint: ChatEndpoint) => void;
  onBusy: (busy: boolean) => void;
  onManual: (existing: boolean) => Promise<void>;
  onManaged?: () => Promise<void>;
  onContinue: () => void;
  onSaveExit: () => void;
}) {
  const { t } = useTranslation();
  const [configurationToken, setConfigurationToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedNoApp, setCheckedNoApp] = useState(false);
  const requestId = useRef(createUuid());
  const inFlight = useRef(false);
  const pendingWindow = useRef<Window | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingWindow.current?.close();
      pendingWindow.current = null;
    };
  }, []);
  const registration = endpoint.setup?.slackRegistration;
  const uncertain = registration?.status === "uncertain";
  const creating = registration?.status === "creating";
  const created = Boolean(registration?.appId);
  const configurationPending = registration?.errorCode === "slack_manifest_update_pending";

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    setError(null);
    try { await action(); }
    catch (failure) { authorization.cancel(); setError(sanitizedSetupErrorMessage(failure, { configurationToken })); }
    finally {
      setConfigurationToken("");
      setBusy(false);
      onBusy(false);
      inFlight.current = false;
    }
  }

  async function create() {
    // Reserve the window during the click so async app creation cannot trigger a popup blocker.
    const installWindow = window.open("about:blank", "_blank");
    if (installWindow) {
      installWindow.opener = null;
      installWindow.document.title = t("ownSlackAppSetup.preparingTitle", { defaultValue: "Preparing Slack installation" });
      installWindow.document.body.textContent = t("ownSlackAppSetup.preparingBody", { defaultValue: "Preparing your Slack installation…" });
      pendingWindow.current = installWindow;
    }
    let token = configurationToken.trim();
    setConfigurationToken("");
    try {
      let next: ChatEndpoint;
      try {
        if (!created) await saveDetails();
        if (registration?.status === "failed" || checkedNoApp) requestId.current = createUuid();
        setCheckedNoApp(false);
        next = await chatEndpointsApi.createSlackApp(endpoint.id, {
          requestId: requestId.current,
          credentials: { configurationToken: token },
          ...(checkedNoApp ? { confirmedNoAppCreated: true } : {}),
        });
      } catch (failure) {
        // A response can be lost after Slack creates the app. Only saved state can advance.
        const current = await chatEndpointsApi.get(endpoint.id).catch(() => null);
        if (current && mounted.current) onSaved(current);
        if (!current?.setup?.slackRegistration?.appId) {
          throw new Error(sanitizedSetupErrorMessage(failure, { configurationToken: token }));
        }
        next = current;
      }
      token = "";
      if (!mounted.current) return;
      onSaved(next);
      const saved = next.setup?.slackRegistration;
      if (!saved?.appId) return;
      onContinue();
      // Pending/uncertain configuration and existing installations must not start OAuth.
      if (saved.status !== "install" || saved.errorCode) return;
      if (!installWindow || installWindow.closed) {
        setError(t("ownSlackAppSetup.installPrompt", { defaultValue: "Select Install in Slack to open the installation page." }));
        return;
      }
      const result = await chatEndpointsApi.installSlackApp(endpoint.id);
      if (!mounted.current) return;
      if (installWindow.closed) {
        setError(t("ownSlackAppSetup.reopenPrompt", { defaultValue: "Select Install in Slack to reopen the installation page." }));
        return;
      }
      installWindow.location.replace(result.authorizationUrl);
      pendingWindow.current = null;
    } finally {
      token = "";
      pendingWindow.current?.close();
      pendingWindow.current = null;
    }
  }

  const authorization = useAuthorizationWindow();
  async function authorize() {
    authorization.reserve();
    const result = await chatEndpointsApi.installSlackApp(endpoint.id);
    await authorization.open(result.authorizationUrl);
  }

  return <div className="space-y-5">
    {authorization.fallback}
    {error || registration?.errorCode ? <p role="alert" className="text-sm text-destructive">
      {error ?? slackRegistrationErrorMessage(registration!.errorCode!)}
    </p> : null}
    {(stage === "app" && !created && !creating || configurationPending) && <>
      {uncertain && <div className="space-y-3 text-sm">
        <a href={registration?.managementUrl ?? "https://api.slack.com/apps"} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("ownSlackAppSetup.openAppSettings", { defaultValue: "Open Slack app settings" })} <ExternalLink className="inline size-3" /></a>
        <label className="flex items-center gap-2">
          <Checkbox checked={checkedNoApp} disabled={busy} onCheckedChange={value => setCheckedNoApp(value === true)} />
          {t("ownSlackAppSetup.checkedNoApp", { defaultValue: "I checked Slack and no app was created. Create a new app." })}
        </label>
      </div>}
      {(!uncertain || checkedNoApp) && <div className="space-y-2">
        <Button asChild size="lg" className="mb-4 h-auto w-full whitespace-normal py-4">
          <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">{t("ownSlackAppSetup.getToken", { defaultValue: "Get your App configuration access token" })} <ExternalLink className="size-4" /></a>
        </Button>
        <div id="slack-configuration-token-help" className="space-y-3 pb-3 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>{t("ownSlackAppSetup.stepOnePrefix", { defaultValue: "In Slack app settings, find " })}<strong>{t("ownSlackAppSetup.stepOneTokensLabel", { defaultValue: "Your App Configuration Tokens" })}</strong>{t("ownSlackAppSetup.stepOneMid", { defaultValue: " and choose " })}<strong>{t("ownSlackAppSetup.stepOneGenerateLabel", { defaultValue: "Generate Token" })}</strong>{t("ownSlackAppSetup.stepOneSuffix", { defaultValue: "." })}</li>
            <li>{t("ownSlackAppSetup.stepTwo", { defaultValue: "Select the workspace where you want to install your bot." })}</li>
            <li>{t("ownSlackAppSetup.stepThreePrefix", { defaultValue: "Copy the " })}<strong>{t("ownSlackAppSetup.stepThreeTokenLabel", { defaultValue: "Access Token" })}</strong>{t("ownSlackAppSetup.stepThreeSuffix", { defaultValue: " and paste it below." })}</li>
          </ol>
          <p className="text-muted-foreground">{t("ownSlackAppSetup.tokenUsage", { defaultValue: "Paperclip uses this token to create your app" })}</p>
        </div>
        <label htmlFor="slack-configuration-token" className="text-sm font-medium">{t("ownSlackAppSetup.appConfigTokenLabel", { defaultValue: "App configuration access token" })}</label>
        <Input id="slack-configuration-token" type="password" autoComplete="off" spellCheck={false}
          value={configurationToken} disabled={busy} onChange={event => setConfigurationToken(event.target.value)}
          aria-describedby="slack-configuration-token-help" />
      </div>}
    </>}
    {creating && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t("ownSlackAppSetup.creating", { defaultValue: "Creating your Slack app. You can return to this saved setup." })}</p>}
    {created && <p className="text-sm">
      <strong>{endpoint.setup?.slackApp?.appName ?? t("ownSlackAppSetup.yourSlackApp", { defaultValue: "Your Slack app" })}</strong> {t("ownSlackAppSetup.createdSuffix", { defaultValue: "is created." })}
      {stage === "credentials" && <> {t("ownSlackAppSetup.credentialsNote", { defaultValue: "Approve installation with your Slack account. Paperclip will link it to your signed-in Paperclip account and send you a welcome DM." })}</>}
    </p>}
    {stage === "credentials" && registration?.status === "credentials_saved" && <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t("ownSlackAppSetup.credentialsSaved", { defaultValue: "Your installation credentials are saved. Retry connecting to finish setup. If Slack access has changed, authorize the same app again." })}</p>
      <Button variant="link" className="h-auto p-0" disabled={busy || disabled} onClick={() => void run(authorize)}>{t("ownSlackAppSetup.authorizeAgain", { defaultValue: "Authorize in Slack again" })}</Button>
    </div>}
    {stage === "app" && <SlackSetupAdvanced><div className="flex flex-wrap gap-4 text-sm">
      {onManaged && !registration && <Button variant="link" className="h-auto p-0" disabled={busy} onClick={() => void run(onManaged)}>{t("ownSlackAppSetup.useManagedSetup", { defaultValue: "Use managed setup" })}</Button>}
      <Button variant="link" className="h-auto p-0" disabled={busy || creating} onClick={() => void run(() => onManual(false))}>{t("ownSlackAppSetup.createManually", { defaultValue: "Create manually" })}</Button>
      <Button variant="link" className="h-auto p-0" disabled={busy || creating} onClick={() => void run(() => onManual(true))}>{t("ownSlackAppSetup.useExistingApp", { defaultValue: "Use an existing app" })}</Button>
    </div></SlackSetupAdvanced>}
    <SetupWizardFooter onSaveExit={onSaveExit} disabled={busy}>
      {configurationPending ? <Button disabled={busy || disabled || !configurationToken.trim()} onClick={() => void run(create)}>
        {busy && <Loader2 className="size-4 animate-spin" />}{t("ownSlackAppSetup.retryAppConfiguration", { defaultValue: "Retry app configuration" })}
      </Button> : stage === "app" ? <Button disabled={busy || disabled || creating || (!created && (!configurationToken.trim() || uncertain && !checkedNoApp))}
        onClick={() => created ? onContinue() : void run(create)}>
        {busy && <Loader2 className="size-4 animate-spin" />}{created ? t("ownSlackAppSetup.continueToInstallation", { defaultValue: "Continue to installation" }) : t("ownSlackAppSetup.createSlackApp", { defaultValue: "Create Slack app" })}
      </Button> : registration?.status === "credentials_saved" ? <Button disabled={busy} onClick={() => void run(async () => onSaved(await chatEndpointsApi.resumeSlackInstallation(endpoint.id)))}>
        {busy && <Loader2 className="size-4 animate-spin" />}{t("ownSlackAppSetup.retryConnecting", { defaultValue: "Retry connecting" })}
      </Button> : <Button disabled={busy || !created || disabled} onClick={() => void run(authorize)}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}{t("ownSlackAppSetup.installInSlack", { defaultValue: "Install in Slack" })}
      </Button>}
    </SetupWizardFooter>
  </div>;
}
