import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  ConnectToolAppResult,
  CreateMachineSignIn,
  MachineSignInMethod,
  MachineSignInSetupResult,
  MachineSignInStatus,
  TestMachineSignIn,
} from "@paperclipai/shared";
import { toolsApi } from "@/api/tools";
import { describeError } from "@/api/errors";
import { InlineBanner } from "@/components/InlineBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useTranslation } from "@/i18n";

/** The calls this setup makes. Stories pass in-memory fakes. */
export interface MachineSignInClient {
  create(companyId: string, input: CreateMachineSignIn): Promise<MachineSignInSetupResult>;
  test(connectionId: string, input: TestMachineSignIn): Promise<ConnectToolAppResult>;
  status(connectionId: string): Promise<MachineSignInStatus>;
}

export const machineSignInApiClient: MachineSignInClient = {
  create: (companyId, input) => toolsApi.createMachineSignIn(companyId, input),
  test: (connectionId, input) => toolsApi.testMachineSignIn(connectionId, input),
  status: (connectionId) => toolsApi.getMachineSignIn(connectionId),
};

type MachineSignInDraft = Pick<MachineSignInSetupResult, "connectionId" | "machineSignIn">;

/**
 * The draft this browser tab started for a server, so switching options or
 * reloading resumes it (and its key) instead of creating another.
 */
function draftStorageKey(companyId: string, applicationId: string | null | undefined, link: string) {
  // Keyed by app too: a draft started for one app is never resumed for another.
  return `paperclip.machine-sign-in-draft.v2:${companyId}:${applicationId ?? "new"}:${link}`;
}
function readDraftId(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeDraftId(key: string, connectionId: string | null) {
  try {
    if (connectionId) sessionStorage.setItem(key, connectionId);
    else sessionStorage.removeItem(key);
  } catch { /* storage unavailable: the draft is still listed in Apps */ }
}

const METHOD_OPTIONS: Array<{ method: MachineSignInMethod; label: string; hint: string; labelKey: string; hintKey: string }> = [
  {
    method: "paperclip_key",
    label: "Paperclip key (recommended)",
    labelKey: "connections.machineSignIn.paperclipKey",
    hint: "Paperclip creates a key and keeps its private half. You register the public key with the provider; nothing secret is copied.",
    hintKey: "connections.machineSignIn.paperclipKeyHint",
  },
  {
    method: "client_secret",
    label: "Client secret",
    labelKey: "connections.machineSignIn.clientSecret",
    hint: "For providers that only issue a secret. Paperclip stores it securely and never shows it again.",
    hintKey: "connections.machineSignIn.clientSecretHint",
  },
];

export interface MachineSignInSetupProps {
  companyId: string;
  link: string;
  name?: string;
  /** The existing app this connection belongs to, when setup was opened for one. */
  applicationId?: string | null;
  client?: MachineSignInClient;
  /** Resume at "register the key" with a key Paperclip already created. */
  initialSetup?: MachineSignInSetupResult | null;
  initialMethod?: MachineSignInMethod;
  initialError?: string | null;
  onBack: () => void;
  onConnected: (result: ConnectToolAppResult) => void;
  /** Shown above the footer, such as who gets access to the connection. */
  beforeFooter?: React.ReactNode;
}

/**
 * Machine sign-in for an organization connection: the server's provider issues
 * Paperclip a client of its own, so no person signs in. With a Paperclip key the
 * admin registers the public key we show; with a client secret they paste it.
 * Either way the last step is a real test against the provider and the server.
 */
export function MachineSignInSetup({
  companyId,
  link,
  name,
  applicationId,
  client = machineSignInApiClient,
  initialSetup = null,
  initialMethod = "paperclip_key",
  initialError = null,
  onBack,
  onConnected,
  beforeFooter,
}: MachineSignInSetupProps) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<MachineSignInMethod>(initialSetup?.machineSignIn.method ?? initialMethod);
  const [signInService, setSignInService] = useState("");
  const [clientId, setClientId] = useState(initialSetup?.machineSignIn.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState(initialSetup?.machineSignIn.scopes.join(" ") ?? "");
  const [setup, setSetup] = useState<MachineSignInDraft | null>(initialSetup);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState<"creating" | "testing" | null>(null);
  const storageKey = draftStorageKey(companyId, applicationId, link);
  // While a saved draft loads, creating another would race it; wait for it.
  const [restoring, setRestoring] = useState(() => !initialSetup && Boolean(readDraftId(storageKey)));

  useEffect(() => {
    if (initialSetup) return;
    const draftId = readDraftId(storageKey);
    if (!draftId) return;
    let cancelled = false;
    setRestoring(true);
    client.status(draftId).then((status) => {
      if (cancelled) return;
      setSetup({ connectionId: draftId, machineSignIn: status });
      setMethod(status.method);
      setClientId((current) => current || (status.clientId ?? ""));
      setScopes((current) => current || status.scopes.join(" "));
    }, () => writeDraftId(storageKey, null)).finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => { cancelled = true; };
  }, [client, initialSetup, storageKey]);

  const trimmedScopes = scopes.trim();
  const canCreate = method === "paperclip_key" || (clientId.trim().length > 0 && clientSecret.length > 0);
  const canTest = clientId.trim().length > 0;

  async function createDraft(): Promise<MachineSignInDraft | null> {
    setBusy("creating");
    setError(null);
    try {
      const created = await client.create(companyId, {
        link,
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(signInService.trim() ? { authorizationServer: signInService.trim() } : {}),
        method,
        ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
        ...(method === "client_secret" && clientSecret ? { clientSecret } : {}),
        ...(trimmedScopes ? { scopes: trimmedScopes } : {}),
        ...(applicationId ? { applicationId } : {}),
      });
      setSetup(created);
      writeDraftId(storageKey, created.connectionId);
      // The secret is saved with the draft; a later test only sends a replacement.
      setClientSecret("");
      return created;
    } catch (caught) {
      setError(describeError(caught).body);
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** `replacementSecret` is sent only when the admin typed a new one after the draft was saved. */
  async function testConnection(target: MachineSignInDraft, replacementSecret: string) {
    setBusy("testing");
    setError(null);
    try {
      const result = await client.test(target.connectionId, {
        clientId: clientId.trim(),
        // Always sent, so clearing the field clears the saved scopes.
        scopes: trimmedScopes,
        ...(target.machineSignIn.method === "client_secret" && replacementSecret ? { clientSecret: replacementSecret } : {}),
      });
      writeDraftId(storageKey, null);
      onConnected(result);
    } catch (caught) {
      setError(describeError(caught).body);
    } finally {
      setBusy(null);
    }
  }

  const host = (() => {
    try { return new URL(link).host; } catch { return link; }
  })();
  const publicKey = setup?.machineSignIn.publicKey ?? null;

  return (
    <div className="space-y-5" data-testid="machine-sign-in-setup">
      <p className="text-xs text-muted-foreground">
        {t("connections.machineSignIn.intro", {
          defaultValue: "For automation your organization owns. Agents use this connection as the provider client you set up for Paperclip, not as any person. Only shared connections can use machine sign-in.",
        })}
      </p>

      {error ? <InlineBanner tone="warning" title={t("connections.machineSignIn.errorTitle", { defaultValue: "Machine sign-in didn’t work" })}>{error}</InlineBanner> : null}

      {!setup ? (
        <div className="space-y-4">
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={t("connections.machineSignIn.methodAria", { defaultValue: "How Paperclip proves who it is" })}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              event.stopPropagation();
              const index = METHOD_OPTIONS.findIndex((option) => option.method === method);
              const next = (index + step + METHOD_OPTIONS.length) % METHOD_OPTIONS.length;
              setMethod(METHOD_OPTIONS[next]!.method);
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
            }}
          >
            {METHOD_OPTIONS.map((option) => (
              <button
                key={option.method}
                type="button"
                role="radio"
                aria-checked={method === option.method}
                onClick={() => setMethod(option.method)}
                className={cn(
                  "rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors",
                  method === option.method ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(option.labelKey, { defaultValue: option.label })}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t(METHOD_OPTIONS.find((option) => option.method === method)?.hintKey ?? "", { defaultValue: METHOD_OPTIONS.find((option) => option.method === method)?.hint })}</p>
          <Field
            id="machine-sign-in-service"
            label={t("connections.machineSignIn.signInService", { defaultValue: "Sign-in service" })}
            hint={t("connections.machineSignIn.signInServiceHint", {
              host,
              defaultValue: "Leave blank and Paperclip asks {{host}} where to sign in. Otherwise enter the address or token URL from the provider’s docs.",
            })}
          >
            <Input id="machine-sign-in-service" value={signInService} onChange={(event) => setSignInService(event.target.value)} placeholder={t("connections.machineSignIn.signInServicePlaceholder", { defaultValue: "Found automatically" })} autoComplete="off" className="h-11 font-mono" />
          </Field>
          <Field id="machine-sign-in-client-id" label={t("connections.machineSignIn.clientId", { defaultValue: "Client ID" })} hint={method === "paperclip_key" ? t("connections.machineSignIn.clientIdHint", { defaultValue: "You can add this after registering the key." }) : undefined}>
            <Input id="machine-sign-in-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" className="h-11 font-mono" />
          </Field>
          {method === "client_secret" ? (
            <Field id="machine-sign-in-client-secret" label={t("connections.machineSignIn.clientSecret", { defaultValue: "Client secret" })}>
              <Input id="machine-sign-in-client-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="off" className="h-11 font-mono" />
            </Field>
          ) : null}
          <Field id="machine-sign-in-scopes" label={t("connections.machineSignIn.scopes", { defaultValue: "Scopes" })} hint={t("connections.machineSignIn.scopesHint", { defaultValue: "Optional. Separate with spaces, as the provider’s docs list them." })}>
            <Input id="machine-sign-in-scopes" value={scopes} onChange={(event) => setScopes(event.target.value)} placeholder={t("connections.machineSignIn.scopesPlaceholder", { defaultValue: "Optional" })} autoComplete="off" className="h-11 font-mono" />
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          {publicKey ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                {t("connections.machineSignIn.publicKeyIntro", {
                  defaultValue: "Register this public key with the provider for the Paperclip client. It isn’t secret, so you can paste it into the provider’s console or send it to whoever manages it.",
                })}
              </p>
              <PublicKeyBlock label={t("connections.machineSignIn.publicKeyPem", { defaultValue: "Public key (PEM)" })} value={publicKey.pem} />
              <PublicKeyBlock label={t("connections.machineSignIn.publicKeyJson", { defaultValue: "Public key (JSON)" })} value={JSON.stringify(publicKey.jwk, null, 2)} />
            </div>
          ) : null}
          <Field id="machine-sign-in-client-id-confirm" label={t("connections.machineSignIn.clientId", { defaultValue: "Client ID" })} hint={t("connections.machineSignIn.clientIdConfirmHint", { defaultValue: "The ID the provider shows for the Paperclip client." })}>
            <Input id="machine-sign-in-client-id-confirm" value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" className="h-11 font-mono" />
          </Field>
          {setup.machineSignIn.method === "client_secret" ? (
            <Field id="machine-sign-in-client-secret-replace" label={t("connections.machineSignIn.clientSecret", { defaultValue: "Client secret" })} hint={setup.machineSignIn.hasClientSecret ? t("connections.machineSignIn.clientSecretReplaceHint", { defaultValue: "Saved. Enter a new one only to replace it." }) : undefined}>
              <Input id="machine-sign-in-client-secret-replace" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={setup.machineSignIn.hasClientSecret ? "••••••••" : ""} autoComplete="off" className="h-11 font-mono" />
            </Field>
          ) : null}
          <Field id="machine-sign-in-scopes-confirm" label={t("connections.machineSignIn.scopes", { defaultValue: "Scopes" })} hint={t("connections.machineSignIn.scopesConfirmHint", { defaultValue: "Optional. Separate with spaces." })}>
            <Input id="machine-sign-in-scopes-confirm" value={scopes} onChange={(event) => setScopes(event.target.value)} autoComplete="off" className="h-11 font-mono" />
          </Field>
        </div>
      )}

      {beforeFooter}

      <div className="flex items-center justify-between pt-3">
        <Button variant="ghost" onClick={onBack} disabled={busy !== null}>{t("connections.machineSignIn.back", { defaultValue: "Back" })}</Button>
        {!setup && method === "paperclip_key" ? (
          <Button onClick={() => void createDraft()} disabled={busy !== null || restoring || !canCreate}>
            {busy === "creating" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy === "creating" ? t("connections.machineSignIn.creatingKey", { defaultValue: "Creating key…" }) : t("connections.machineSignIn.createKey", { defaultValue: "Create key" })}
          </Button>
        ) : (
          <Button
            onClick={async () => {
              const target = setup ?? await createDraft();
              if (target) await testConnection(target, setup ? clientSecret : "");
            }}
            disabled={busy !== null || restoring || (setup ? !canTest : !canCreate)}
          >
            {busy !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy === "testing"
              ? t("connections.machineSignIn.testing", { defaultValue: "Testing…" })
              : busy === "creating"
                ? t("connections.machineSignIn.saving", { defaultValue: "Saving…" })
                : t("connections.machineSignIn.testConnection", { defaultValue: "Test connection" })}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground" htmlFor={id}>{label}</label>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function PublicKeyBlock({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await copyTextToClipboard(value).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          {copied ? t("connections.machineSignIn.copied", { defaultValue: "Copied" }) : t("connections.machineSignIn.copy", { defaultValue: "Copy" })}
        </Button>
      </div>
      <Textarea readOnly value={value} aria-label={label} rows={6} className="mt-2 font-mono text-xs" />
    </div>
  );
}
