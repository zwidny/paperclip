import { configFieldsForSection } from "../config-sections";
import { useTranslation } from "@/i18n";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AdapterConfigFieldsProps, CreateConfigValues } from "../types";
import {
  DraftInput,
  DraftNumberInput,
  DraftTextarea,
  Field,
  ToggleField,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const DEFAULT_SESSION_KEY_STRATEGY = "issue";
const DEFAULT_TIMEOUT_SEC = 600;
const DEFAULT_EVENT_RECONNECT_MS = 2000;

type SecretRef = {
  type: "secret_ref";
  secretId: string;
  version?: number | "latest";
};

function isSecretRef(value: unknown): value is SecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "secret_ref" &&
    typeof (value as { secretId?: unknown }).secretId === "string"
  );
}

function readCreateValue(values: CreateConfigValues | null, key: string, fallback: unknown): unknown {
  return values?.adapterSchemaValues?.[key] ?? fallback;
}

function writeCreateValue(
  values: CreateConfigValues | null,
  set: ((patch: Partial<CreateConfigValues>) => void) | null,
  key: string,
  value: unknown,
) {
  set?.({
    adapterSchemaValues: {
      ...values?.adapterSchemaValues,
      [key]: value,
    },
  });
}

function stringifyHeaders(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }
  return "";
}

function SecretField({
  label,
  value,
  onCommit,
  placeholder,
  stored,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  stored?: boolean;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label={visible
            ? t("adapterConfig.hermesGateway.hideField", { defaultValue: "Hide {{label}}", label })
            : t("adapterConfig.hermesGateway.showField", { defaultValue: "Show {{label}}", label })}
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <DraftInput
          value={value}
          onCommit={onCommit}
          immediate
          type={visible ? "text" : "password"}
          className={inputClass + " pl-8"}
          placeholder={stored
            ? t("adapterConfig.hermesGateway.storedSecret", { defaultValue: "Stored secret; enter a new value to replace it" })
            : placeholder}
        />
      </div>
    </Field>
  );
}

export function HermesGatewayConfigFields({
  section,
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const { t } = useTranslation();
  const storedApiKey = config.apiKey;
  const hasStoredApiKey = isSecretRef(storedApiKey) || typeof storedApiKey === "string";
  const editApiKeyValue = typeof storedApiKey === "string" ? String(eff("adapterConfig", "apiKey", storedApiKey)) : "";

  const configuredHeaders = stringifyHeaders(config.headers);
  const editHeaders = eff("adapterConfig", "headers", configuredHeaders);
  const [headersDraft, setHeadersDraft] = useState(String(editHeaders ?? ""));

  useEffect(() => {
    if (!isCreate) setHeadersDraft(String(editHeaders ?? ""));
  }, [editHeaders, isCreate]);

  const readValue = (key: string, fallback: unknown) =>
    isCreate ? readCreateValue(values, key, fallback) : eff("adapterConfig", key, (config[key] ?? fallback) as never);

  const writeValue = (key: string, value: unknown) => {
    if (isCreate) {
      writeCreateValue(values, set, key, value);
    } else {
      mark("adapterConfig", key, value);
    }
  };

  const apiBaseUrl = String(readValue("apiBaseUrl", "") ?? "");
  const paperclipApiUrl = String(readValue("paperclipApiUrl", "") ?? "");
  const sessionKeyStrategy = String(readValue("sessionKeyStrategy", DEFAULT_SESSION_KEY_STRATEGY) ?? DEFAULT_SESSION_KEY_STRATEGY);
  const timeoutSec = Number(readValue("timeoutSec", DEFAULT_TIMEOUT_SEC) ?? DEFAULT_TIMEOUT_SEC);
  const eventReconnectMs = Number(readValue("eventReconnectMs", DEFAULT_EVENT_RECONNECT_MS) ?? DEFAULT_EVENT_RECONNECT_MS);
  const allowInsecureRemoteHttp = Boolean(readValue("dangerouslyAllowInsecureRemoteHttp", false));
  const instructions = String(readValue("instructions", "") ?? "");
  const headers = isCreate
    ? String(readCreateValue(values, "headers", "") ?? "")
    : headersDraft;

  return configFieldsForSection(section, (
    <>
      <Field
        label={t("adapterConfig.hermesGateway.apiBaseUrl", { defaultValue: "API base URL" })}
        hint={t("adapterConfig.hermesGateway.apiBaseUrlHint", { defaultValue: "Hermes API server base URL that Paperclip can reach, such as http://127.0.0.1:8642 or a private HTTPS URL. Default dashboard root/chat URLs such as http://127.0.0.1:9119/chat are accepted and map to /api." })}
      >
        <DraftInput
          value={apiBaseUrl}
          onCommit={(v) => writeValue("apiBaseUrl", v || undefined)}
          immediate
          className={inputClass}
          placeholder="http://127.0.0.1:8642"
        />
      </Field>

      <SecretField
        label={t("adapterConfig.hermesGateway.apiKey", { defaultValue: "API key" })}
        value={isCreate ? String(readCreateValue(values, "apiKey", "") ?? "") : editApiKeyValue}
        onCommit={(v) => writeValue("apiKey", v || undefined)}
        placeholder={t("adapterConfig.hermesGateway.apiKeyPlaceholder", { defaultValue: "Hermes API_SERVER_KEY, not PAPERCLIP_API_KEY" })}
        stored={!isCreate && hasStoredApiKey && !editApiKeyValue}
      />

      <Field
        label={t("adapterConfig.hermesGateway.paperclipApiUrl", { defaultValue: "Paperclip API URL" })}
        hint={t("adapterConfig.hermesGateway.paperclipApiUrlHint", { defaultValue: "Optional Paperclip API URL reachable by the Hermes host. This is not a credential." })}
      >
        <DraftInput
          value={paperclipApiUrl}
          onCommit={(v) => writeValue("paperclipApiUrl", v || undefined)}
          immediate
          className={inputClass}
          placeholder="http://127.0.0.1:3100"
        />
      </Field>

      <Field configSection="runPolicy"
        label={t("adapterConfig.hermesGateway.sessionKeyStrategy", { defaultValue: "Session key strategy" })}
        hint={t("adapterConfig.hermesGateway.sessionKeyStrategyHint", { defaultValue: "Controls X-Hermes-Session-Key. Issue scoped prevents cross-task memory bleed by default." })}
      >
        <select
          value={sessionKeyStrategy}
          onChange={(event) => writeValue("sessionKeyStrategy", event.target.value)}
          className={inputClass}
        >
          <option value="issue">{t("adapterConfig.hermesGateway.sessionScopedIssue", { defaultValue: "Issue scoped" })}</option>
          <option value="agent">{t("adapterConfig.hermesGateway.sessionScopedAgent", { defaultValue: "Agent scoped" })}</option>
          <option value="run">{t("adapterConfig.hermesGateway.sessionScopedRun", { defaultValue: "Run scoped" })}</option>
          <option value="none">{t("adapterConfig.hermesGateway.sessionScopedNone", { defaultValue: "None" })}</option>
        </select>
      </Field>

      <Field configSection="runPolicy" label={t("adapterConfig.hermesGateway.timeoutSeconds", { defaultValue: "Timeout seconds" })}>
        <DraftNumberInput
          value={Number.isFinite(timeoutSec) ? timeoutSec : DEFAULT_TIMEOUT_SEC}
          onCommit={(v) => writeValue("timeoutSec", v)}
          immediate
          className={inputClass}
        />
      </Field>

      <Field
        label={t("adapterConfig.hermesGateway.eventReconnectMs", { defaultValue: "Event reconnect ms" })}
        hint={t("adapterConfig.hermesGateway.eventReconnectMsHint", { defaultValue: "Delay before reconnecting the Hermes SSE events stream after a nonterminal disconnect." })}
      >
        <DraftNumberInput
          value={Number.isFinite(eventReconnectMs) ? eventReconnectMs : DEFAULT_EVENT_RECONNECT_MS}
          onCommit={(v) => writeValue("eventReconnectMs", v)}
          immediate
          className={inputClass}
        />
      </Field>

      <ToggleField
        label={t("adapterConfig.hermesGateway.allowRemoteHttp", { defaultValue: "Dangerously allow remote HTTP" })}
        hint={t("adapterConfig.hermesGateway.allowRemoteHttpHint", { defaultValue: "Unsafe dev-only escape hatch. Remote Hermes gateways should use HTTPS; loopback HTTP remains allowed." })}
        checked={allowInsecureRemoteHttp}
        onChange={(v) => writeValue("dangerouslyAllowInsecureRemoteHttp", v)}
      />

      <Field
        label={t("adapterConfig.hermesGateway.extraHeaders", { defaultValue: "Extra headers" })}
        hint={t("adapterConfig.hermesGateway.extraHeadersHint", { defaultValue: "Optional JSON object of extra nonsecret headers. Security-critical headers are generated by the adapter." })}
      >
        <textarea
          value={headers}
          onChange={(event) => {
            const next = event.target.value;
            if (isCreate) {
              writeValue("headers", next || undefined);
            } else {
              setHeadersDraft(next);
              mark("adapterConfig", "headers", next || undefined);
            }
          }}
          rows={3}
          className={inputClass}
          placeholder='{"x-custom-header": "value"}'
        />
      </Field>

      <Field label={t("adapterConfig.hermesGateway.instructions", { defaultValue: "Instructions" })} hint={t("adapterConfig.hermesGateway.instructionsHint", { defaultValue: "Optional stable Hermes instructions sent separately from the wake input." })}>
        <DraftTextarea
          value={instructions}
          onCommit={(v) => writeValue("instructions", v || undefined)}
          immediate
          minRows={3}
        />
      </Field>
    </>
  ));
}
