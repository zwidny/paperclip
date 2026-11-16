import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n";

/** Providers supply only credentials the current user is authorized to use.
 * Values are opaque connection references, never secret values. */
export function ApiKeyCredentialField({ options, connectionId, onConnectionChange, value, onChange,
  disabled, loading, error, providerName, keysUrl, label }: {
  options: { id: string; label: string; disabled?: boolean }[];
  connectionId: string | null;
  onConnectionChange(id: string): void;
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  providerName: string;
  keysUrl: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const labelText = label ?? t("apiKeyCredentialField.label", { defaultValue: "API key" });
  const choices = connectionId && !options.some(option => option.id === connectionId)
    ? [{ id: connectionId, label: loading
      ? t("apiKeyCredentialField.checkingSaved", { defaultValue: "Checking saved API key…" })
      : t("apiKeyCredentialField.unavailableSaved", { defaultValue: "Previously selected key · unavailable" }), disabled: true }, ...options] : options;
  return <div className="space-y-2">
    <Label htmlFor={id}>{labelText}</Label>
    {choices.length > 0 && <select id={id} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={connectionId ?? ""} disabled={disabled} onChange={event => onConnectionChange(event.target.value)}>
      {choices.map(option => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}
      <option value="">{t("apiKeyCredentialField.enterNew", { defaultValue: "Enter a new API key" })}</option>
    </select>}
    {!connectionId && <Input id={choices.length ? `${id}-new` : id} aria-label={choices.length ? t("apiKeyCredentialField.newAria", { defaultValue: "New API key" }) : undefined}
      type="password" autoComplete="off" value={value} disabled={disabled}
      onChange={event => { onConnectionChange(""); onChange(event.target.value); }} placeholder={t("apiKeyCredentialField.pasteKey", { defaultValue: "Paste your {{provider}} API key", provider: providerName })} />}
    {loading && <p role="status" className="text-sm text-muted-foreground">{t("apiKeyCredentialField.checkingSavedPlural", { defaultValue: "Checking saved API keys…" })}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{t("apiKeyCredentialField.loadFailed", { defaultValue: "Could not load saved API keys. {{error}}", error })}</p>}
    <a href={keysUrl} target="_blank" rel="noreferrer" className="text-sm underline">{t("apiKeyCredentialField.getKey", { defaultValue: "Get an {{provider}} API key ↗", provider: providerName })}</a>
  </div>;
}
