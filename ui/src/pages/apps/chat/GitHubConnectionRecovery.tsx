import { useState } from "react";
import { AlertTriangle, CircleHelp, ExternalLink, Loader2 } from "lucide-react";
import type { ChatEndpoint } from "@/api/chatEndpoints";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { CopyText } from "@/components/CopyText";
import { SetupWizardFooter } from "@/components/SetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/lib/router";
import { useTranslation } from "../../../i18n";
import { gitHubAppSettingsUrl } from "./GitHubAppIdentity";

export function GitHubConnectionRecoveryNotice({ endpoint }: { endpoint: ChatEndpoint }) {
  const { t } = useTranslation();
  if (!["attention", "revoked"].includes(endpoint.status)) return null;
  return (
    <section aria-label={t("githubBot.recovery.sectionAria", { defaultValue: "GitHub connection needs repair" })} className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{endpoint.status === "revoked" ? t("githubBot.recovery.disconnectedTitle", { defaultValue: "GitHub bot is disconnected" }) : t("githubBot.recovery.repairTitle", { defaultValue: "GitHub connection needs repair" })}</h2>
          <p className="text-sm">{t("githubBot.recovery.body", { defaultValue: "Reconnect this bot to restore GitHub reviews and @mentions. Start with the App already saved in Paperclip." })}</p>
        </div>
        <Button asChild><Link to={`/apps/chat/connect?provider=github&resume=${endpoint.id}&reconnect=1`}>{t("githubBot.recovery.reconnect", { defaultValue: "Reconnect GitHub" })}</Link></Button>
        {(endpoint.lastError || endpoint.healthMessage) && <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("githubBot.recovery.connectionDetails", { defaultValue: "Connection details" })}</summary>
          <p className="mt-2 break-words">{endpoint.lastError ?? endpoint.healthMessage}</p>
        </details>}
      </div>
    </section>
  );
}

export const GITHUB_APP_CREDENTIAL_FIELDS = ["privateKey", "webhookSecret", "clientSecret"] as const;
export type GitHubAppCredentialField = typeof GITHUB_APP_CREDENTIAL_FIELDS[number];
export type GitHubAppCredentials = { appId: string; privateKey: string; webhookSecret: string; clientSecret?: string };

function CredentialLabel({ id, label, help }: { id: string; label: string; help: string }) {
  const { t } = useTranslation();
  return <div className="flex items-center gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Tooltip><TooltipTrigger asChild><button type="button" aria-label={t("githubBot.appRecovery.helpAria", { defaultValue: "Help with {{label}}", label })} className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      <CircleHelp className="size-3.5" aria-hidden="true" />
    </button></TooltipTrigger><TooltipContent className="max-w-xs">{help}</TooltipContent></Tooltip>
  </div>;
}

export function GitHubAppRecovery({ endpoint, reconnect, credentialFields, requireAllCredentialFields = false, rotateWebhookSecret = false, rotationAlreadyCommitted = false, onConnect, onExit }: {
  endpoint: ChatEndpoint;
  reconnect: boolean;
  credentialFields?: readonly GitHubAppCredentialField[];
  requireAllCredentialFields?: boolean;
  rotateWebhookSecret?: boolean;
  rotationAlreadyCommitted?: boolean;
  onConnect: (credentials?: GitHubAppCredentials) => Promise<void>;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const [replace, setReplace] = useState(!!credentialFields || !reconnect);
  const [credentials, setCredentials] = useState<GitHubAppCredentials>({ appId: endpoint.botExternalId ?? "", privateKey: "", webhookSecret: "" });
  const [privateKeyDraft, setPrivateKeyDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [rotationSecret, setRotationSecret] = useState("");
  const [rotationGeneration, setRotationGeneration] = useState<string | null>(null);
  const [rotationUncertain, setRotationUncertain] = useState(false);
  const needsPrivateKey = !credentialFields || credentialFields.includes("privateKey");
  const needsWebhookSecret = credentialFields ? credentialFields.includes("webhookSecret") : !reconnect && !["active", "paused", "revoked"].includes(endpoint.status);
  const appName = endpoint.botLabel ?? endpoint.setup?.github?.appName ?? t("githubBot.appRecovery.existingAppName", { defaultValue: "your existing App" });
  const appIdInvalid = !!credentials.appId.trim() && !/^\d+$/.test(credentials.appId.trim());
  const keyInvalid = !!credentials.privateKey.trim() && !/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(credentials.privateKey);
  const keyLoaded = !!credentials.privateKey.trim() && !keyInvalid && !privateKeyDraft;
  const incomplete = credentialFields
    ? !credentialFields.length || appIdInvalid || keyInvalid || (requireAllCredentialFields
      ? credentialFields.some(field => !credentials[field]?.trim())
      : credentialFields.every(field => !credentials[field]?.trim()))
    : replace && (!credentials.appId.trim() || !credentials.privateKey.trim() || appIdInvalid || keyInvalid || (needsWebhookSecret && !credentials.webhookSecret.trim()));
  const actionLabel = pending ? t("githubBot.appRecovery.checkingGithub", { defaultValue: "Checking GitHub…" }) : replace ? (reconnect ? t("githubBot.appRecovery.verifyAndReconnect", { defaultValue: "Verify and reconnect" }) : t("githubBot.appRecovery.connectExisting", { defaultValue: "Connect existing App" })) : t("githubBot.appRecovery.reconnectSaved", { defaultValue: "Reconnect saved App" });
  async function connect() {
    setPending(true);
    setError("");
    try { await onConnect(replace ? credentials : undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("githubBot.appRecovery.reconnectFailed", { defaultValue: "Could not reconnect GitHub. Try again." })); }
    finally { setPending(false); }
  }
  async function checkSavedRotation(expected: string | null | undefined) {
    try {
      const saved = await chatEndpointsApi.get(endpoint.id);
      if (expected !== undefined && (saved.setup?.credentialRotationId ?? null) === expected) {
        setRotationUncertain(false);
        return true;
      }
      setRotationSecret("");
      setRotationGeneration(null);
      setError(t("githubBot.appRecovery.rotationChangedError", { defaultValue: "The webhook secret changed, but this page did not receive it. Generate another secret and update GitHub." }));
    } catch {
      // A failed status read cannot establish that the earlier secret is current.
    }
    setRotationUncertain(true);
    return false;
  }
  async function generateSecret() {
    const previousGeneration = rotationGeneration ?? (rotationSecret ? undefined : endpoint.setup?.credentialRotationId ?? null);
    setPending(true);
    setError("");
    try {
      const result = await chatEndpointsApi.generateSetupSecret(endpoint.id);
      setRotationSecret(result.webhookSecret);
      setRotationGeneration(result.credentialRotationId ?? null);
      setRotationUncertain(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("githubBot.appRecovery.rotationGenerateFailed", { defaultValue: "Could not generate the webhook secret. Try again." }));
      setRotationUncertain(true);
      await checkSavedRotation(previousGeneration);
    }
    finally { setPending(false); }
  }
  return <div className="space-y-6">
    {reconnect && <div className="space-y-3">
      <p className="text-sm">{t("githubBot.appRecovery.restorePrefix", { defaultValue: "Restore " })}<strong>{appName}</strong>{t("githubBot.appRecovery.restoreSuffix", { defaultValue: " using its saved credentials. Paperclip will check the App and its installation, then repair event delivery." })}</p>
      <p className="text-sm text-muted-foreground">{t("githubBot.appRecovery.savedConnectionNote", { defaultValue: "Your agent, repository choices, review settings, and task history stay attached to this connection. You don’t need to create another GitHub App." })}</p>
    </div>}
    {rotateWebhookSecret && <section aria-label={t("githubBot.appRecovery.rotationAria", { defaultValue: "Rotate webhook secret" })} className="space-y-3">
      <h2 className="text-base font-semibold">{t("githubBot.appRecovery.rotationTitle", { defaultValue: "Rotate the webhook secret" })}</h2>
      <p className="text-sm">{rotationAlreadyCommitted ? t("githubBot.appRecovery.rotationCommitted", { defaultValue: "The rotated secret is saved. Reconnect using that value; Paperclip will check GitHub’s signed delivery." }) : <>{t("githubBot.appRecovery.rotationIntroPrefix", { defaultValue: "Generate a new secret, then replace the webhook secret in " })}<a href={gitHubAppSettingsUrl(endpoint)} target="_blank" rel="noreferrer" className="underline">{t("githubBot.appRecovery.rotationIntroLink", { defaultValue: "GitHub App settings" })}</a>{t("githubBot.appRecovery.rotationIntroSuffix", { defaultValue: ". GitHub must verify the new secret before you reconnect." })}</>}</p>
      <p className="text-sm text-muted-foreground">{t("githubBot.appRecovery.rotationInvalidateNote", { defaultValue: "Generating immediately invalidates the previous secret. This value is shown only here; keep this page open until you have copied it." })}</p>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void generateSecret()}>{rotationSecret || rotationAlreadyCommitted ? t("githubBot.appRecovery.rotationGenerateAnother", { defaultValue: "Generate another secret" }) : t("githubBot.appRecovery.rotationGenerate", { defaultValue: "Generate webhook secret" })}</Button>
      {rotationUncertain && <p role="status" className="text-sm">{t("githubBot.appRecovery.rotationUncertain", { defaultValue: "The active secret is not confirmed. Check its saved status before using an earlier value." })}</p>}
      {rotationUncertain && rotationSecret && <Button type="button" variant="outline" disabled={pending} onClick={async () => {
        setPending(true);
        try { if (await checkSavedRotation(rotationGeneration ?? undefined)) setError(""); }
        finally { setPending(false); }
      }}>{t("githubBot.appRecovery.rotationCheckSaved", { defaultValue: "Check saved secret status" })}</Button>}
      {rotationSecret && !rotationUncertain && <div className="space-y-2">
        <Label htmlFor="github-rotation-secret">{t("githubBot.appRecovery.rotationNewSecret", { defaultValue: "New webhook secret" })}</Label>
        <Input id="github-rotation-secret" type="password" autoComplete="off" disabled={pending} readOnly value={rotationSecret} />
        {!pending && <CopyText text={rotationSecret} ariaLabel={t("githubBot.appRecovery.rotationCopyAria", { defaultValue: "Copy webhook secret" })} className="text-sm underline">{t("githubBot.appRecovery.rotationCopy", { defaultValue: "Copy webhook secret" })}</CopyText>}
      </div>}
    </section>}
    {error && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium">{rotateWebhookSecret ? t("githubBot.appRecovery.errorTitleRotation", { defaultValue: "Could not finish secret rotation" }) : replace ? t("githubBot.appRecovery.errorTitleReplace", { defaultValue: "Could not reconnect this App" }) : t("githubBot.appRecovery.errorTitleSaved", { defaultValue: "Could not reconnect the saved App" })}</p>
      <p className="break-words">{error}</p>
      <p>{rotateWebhookSecret ? t("githubBot.appRecovery.errorHintRotation", { defaultValue: "Use the newest secret in GitHub App settings, then retry reconnecting after GitHub verifies delivery." }) : t("githubBot.appRecovery.errorHint", { defaultValue: "Try again if the service is temporarily unavailable. If GitHub rejected the saved key, replace the credentials for this same App below." })}</p>
    </div>}
    {reconnect && !rotateWebhookSecret && !credentialFields && <Button variant="link" className="h-auto p-0" disabled={pending} onClick={() => { setReplace(!replace); setError(""); }}>
      {replace ? t("githubBot.appRecovery.useSaved", { defaultValue: "Use saved credentials instead" }) : t("githubBot.appRecovery.replaceCredentials", { defaultValue: "Replace App credentials…" })}
    </Button>}
    {replace && <div className="space-y-6">
      <div className="space-y-2 text-sm">
        <h2 className="text-base font-semibold">{reconnect ? t("githubBot.appRecovery.replaceTitle", { defaultValue: "Replace credentials for the same App" }) : t("githubBot.appRecovery.connectTitle", { defaultValue: "Connect your existing GitHub App" })}</h2>
        <p><a href={gitHubAppSettingsUrl(endpoint)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">{t("githubBot.appRecovery.openSettings", { defaultValue: "Open GitHub App settings" })}<ExternalLink className="size-3.5" /></a>{t("githubBot.appRecovery.andChoose", { defaultValue: " and choose " })}<strong>{appName}</strong>{t("githubBot.appRecovery.period", { defaultValue: "." })}</p>
        <p className="text-muted-foreground">{t("githubBot.appRecovery.orgSettingsHint", { defaultValue: "If it’s owned by an organization, open that organization’s Settings → Developer settings → GitHub Apps → Edit. You’ll need permission to manage the App." })}</p>
        {credentialFields && <p className="text-muted-foreground">{t("githubBot.appRecovery.credentialFieldsNote", { defaultValue: "Enter the requested credentials below. Other saved credentials stay in place." })}</p>}
      </div>
      {needsPrivateKey && <div className="space-y-2">
        <CredentialLabel id="github-app-id" label={t("githubBot.appRecovery.appId", { defaultValue: "App ID" })} help={t("githubBot.appRecovery.appIdHelp", { defaultValue: "The numeric App ID on the GitHub App’s settings page. This is different from its Client ID or installation ID." })} />
        <p id="github-app-id-help" className="text-sm text-muted-foreground">{t("githubBot.appRecovery.appIdCopyPrefix", { defaultValue: "Copy " })}<strong>{t("githubBot.appRecovery.appId", { defaultValue: "App ID" })}</strong>{t("githubBot.appRecovery.appIdCopySuffix", { defaultValue: " from the App’s settings page." })}{reconnect && t("githubBot.appRecovery.appIdSavedNote", { defaultValue: " The saved ID is filled in when available." })}</p>
        <Input id="github-app-id" aria-describedby="github-app-id-help" inputMode="numeric" value={credentials.appId} disabled={pending} aria-invalid={appIdInvalid} onChange={event => setCredentials({ ...credentials, appId: event.target.value })} />
        {appIdInvalid && <p role="alert" className="text-sm text-destructive">{t("githubBot.appRecovery.appIdInvalid", { defaultValue: "Use the numeric App ID, not the Client ID." })}</p>}
      </div>}
      {needsPrivateKey && <div className="space-y-2">
        <CredentialLabel id="github-private-key" label={t("githubBot.appRecovery.privateKey", { defaultValue: "Private key" })} help={t("githubBot.appRecovery.privateKeyHelp", { defaultValue: "Upload the .pem file downloaded from this GitHub App, or paste its entire contents, including the BEGIN and END lines." })} />
        <ol id="github-private-key-help" className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("githubBot.appRecovery.keyStep1Prefix", { defaultValue: "In the same App’s settings, open " })}<strong>{t("githubBot.appRecovery.keyStep1Path", { defaultValue: "Credentials → Key pairs → New key" })}</strong>{t("githubBot.appRecovery.keyStep1Middle", { defaultValue: ". On the older settings page, use " })}<strong>{t("githubBot.appRecovery.keyStep1LegacyPath", { defaultValue: "Private keys → Generate a private key" })}</strong>{t("githubBot.appRecovery.period", { defaultValue: "." })}</li>
          <li>{t("githubBot.appRecovery.keyStep2Prefix", { defaultValue: "Upload the downloaded " })}<strong>{t("githubBot.appRecovery.keyStep2Extension", { defaultValue: ".pem" })}</strong>{t("githubBot.appRecovery.keyStep2Suffix", { defaultValue: " file below, or paste its entire contents." })}</li>
        </ol>
        <p className="text-sm text-muted-foreground">{t("githubBot.appRecovery.privateKeyNote", { defaultValue: "You can reuse a .pem file you already saved. GitHub cannot show an old private key again. Creating a new key for the same App keeps its installation." })}</p>
        <Input type="file" accept=".pem" aria-label={t("githubBot.appRecovery.uploadKeyAria", { defaultValue: "Upload private key PEM file" })} disabled={pending} onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFileError("");
          try {
            const privateKey = await file.text();
            setCredentials(current => ({ ...current, privateKey }));
            setPrivateKeyDraft("");
          } catch { setFileError(t("githubBot.appRecovery.readFileFailed", { defaultValue: "Could not read this file. Try again or paste the key below." })); }
        }} />
        <Input id="github-private-key" type="password" autoComplete="off" placeholder={keyLoaded ? t("githubBot.appRecovery.pasteReplacementKey", { defaultValue: "Paste a replacement PEM key" }) : t("githubBot.appRecovery.pasteKey", { defaultValue: "Or paste the complete PEM key" })} aria-describedby="github-private-key-help" disabled={pending} value={privateKeyDraft} aria-invalid={keyInvalid}
          onPaste={event => { event.preventDefault(); setCredentials({ ...credentials, privateKey: event.clipboardData.getData("text") }); setPrivateKeyDraft(""); setFileError(""); }}
          onChange={event => { setPrivateKeyDraft(event.target.value); setCredentials({ ...credentials, privateKey: event.target.value }); }} />
        {keyLoaded && <p role="status" className="text-sm">{t("githubBot.appRecovery.keyLoaded", { defaultValue: "Private key loaded. Paste or upload another key to replace it." })}</p>}
        {keyInvalid && <p role="alert" className="text-sm text-destructive">{t("githubBot.appRecovery.keyInvalid", { defaultValue: "Use a PEM private key, including its BEGIN and END lines. A token or client secret won’t work here." })}</p>}
        {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
        <a className="inline-flex items-center gap-1 text-sm underline" href="https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps" target="_blank" rel="noreferrer">{t("githubBot.appRecovery.keyInstructions", { defaultValue: "GitHub’s private key instructions" })}<ExternalLink className="size-3.5" /></a>
      </div>}
      {needsWebhookSecret && <div className="space-y-2">
        <CredentialLabel id="github-webhook-secret" label={t("githubBot.appRecovery.webhookSecret", { defaultValue: "Webhook secret" })} help={t("githubBot.appRecovery.webhookSecretHelp", { defaultValue: "The secret configured for this App’s webhook. It must match GitHub exactly." })} />
        <p className="text-sm text-muted-foreground">{t("githubBot.appRecovery.webhookSecretNote", { defaultValue: "Use the secret saved when you configured this App’s webhook. If you no longer have it, change the webhook secret in GitHub App settings and enter the same value here." })}</p>
        <Input id="github-webhook-secret" type="password" autoComplete="off" disabled={pending} value={credentials.webhookSecret} onChange={event => setCredentials({ ...credentials, webhookSecret: event.target.value })} />
      </div>}
      {credentialFields?.includes("clientSecret") && <div className="space-y-2">
        <CredentialLabel id="github-client-secret" label={t("githubBot.appRecovery.clientSecret", { defaultValue: "Client secret" })} help={t("githubBot.appRecovery.clientSecretHelp", { defaultValue: "The client secret for this GitHub App’s user authentication. Leave the saved private key in place." })} />
        <Input id="github-client-secret" type="password" autoComplete="off" disabled={pending} value={credentials.clientSecret ?? ""} onChange={event => setCredentials({ ...credentials, clientSecret: event.target.value })} />
      </div>}
    </div>}
    <SetupWizardFooter onSaveExit={onExit} disabled={pending}>
      <Button aria-label={actionLabel} disabled={pending || incomplete || rotationUncertain || (rotateWebhookSecret && !rotationSecret && !rotationAlreadyCommitted)} onClick={() => void connect()}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        <span className="sm:hidden" aria-hidden="true">{pending ? t("githubBot.appRecovery.checking", { defaultValue: "Checking…" }) : reconnect ? t("githubBot.appRecovery.reconnect", { defaultValue: "Reconnect" }) : t("githubBot.appRecovery.connect", { defaultValue: "Connect" })}</span>
        <span className="hidden sm:inline" aria-hidden="true">{actionLabel}</span>
      </Button>
    </SetupWizardFooter>
  </div>;
}
