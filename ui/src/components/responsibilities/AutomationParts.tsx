import { useState } from "react";
import type { AutomationStartKind } from "@paperclipai/shared";
import { CalendarClock, Check, Copy, Hand, Radar, Webhook, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { i18n, useTranslation } from "@/i18n";

/**
 * Small pieces the Automation view and the automation proposal card share:
 * the icon for each way an automation starts, and the webhook details a
 * person needs to finish setting one up (the address, and the secret once).
 */

/** One glyph per way an automation starts, so the kind never rests on words alone. */
export const AUTOMATION_START_ICON: Record<AutomationStartKind, LucideIcon> = {
  schedule: CalendarClock,
  webhook: Webhook,
  standing_check: Radar,
  on_request: Hand,
};

export function AutomationStartIcon({ kind, className }: { kind: AutomationStartKind; className?: string }) {
  const Icon = AUTOMATION_START_ICON[kind];
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground", className)} />;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await copyTextToClipboard(value);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <Input aria-label={label} value={value} readOnly className="h-8 min-w-0 flex-1 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
        <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`${t("responsibilities.copyFieldAria", { defaultValue: "Copy" })} ${label.toLowerCase()}`}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t("responsibilities.copied", { defaultValue: "Copied" }) : t("responsibilities.copy", { defaultValue: "Copy" })}
        </Button>
      </div>
      {failed ? <span role="alert" className="text-xs text-destructive">{t("responsibilities.copyFailed", { defaultValue: "Couldn’t copy; select the text and copy it." })}</span> : null}
    </div>
  );
}

/** How calls to a webhook are secured, in plain words. */
export function webhookSecuredWords(signingMode: string | null | undefined): string {
  switch (signingMode) {
    case "bearer":
    case null:
    case undefined:
      return i18n.t("responsibilities.webhookSecuredBearer", { defaultValue: "Each call sends the secret as a bearer token: Authorization: Bearer <secret>." });
    case "none":
      return i18n.t("responsibilities.webhookSecuredNone", { defaultValue: "Calls are not signed: the address itself is the secret." });
    default:
      return i18n.t("responsibilities.webhookSecuredSigned", { defaultValue: "Calls are signed with the secret." });
  }
}

/**
 * What a person needs to finish a webhook: the address to call and how calls
 * are secured, and right after it was set up, the secret itself, once.
 */
export function WebhookDetails({
  url,
  secret,
  signingMode,
  routineHref,
  className,
}: {
  url: string;
  /** Only right after accepting: never stored, never shown again. */
  secret?: string | null;
  signingMode: string | null | undefined;
  /** Where a new secret can be made. */
  routineHref?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-md border border-border bg-muted/30 p-3", className)} data-webhook-details="">
      <p className="text-sm text-foreground">
        {t("responsibilities.webhookAddressHint", { defaultValue: "Give the other system this address. Each call (POST) starts one run." })}
      </p>
      <CopyField label={t("responsibilities.webhookAddressLabel", { defaultValue: "Address to call" })} value={url} />
      {secret ? (
        <>
          <CopyField label={t("responsibilities.webhookSecretLabel", { defaultValue: "Secret" })} value={secret} />
          <p className="text-xs text-muted-foreground">
            {t("responsibilities.webhookSecretSaveNow", { defaultValue: "Save the secret now: it is shown only this once." })} {webhookSecuredWords(signingMode)}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {webhookSecuredWords(signingMode)} {t("responsibilities.webhookSecretShownOnce", { defaultValue: "The secret was shown once, when it was set up." })}
          {routineHref ? <> {t("responsibilities.webhookNewSecretPrefix", { defaultValue: "You can make a new one from" })} <Link to={routineHref} className="underline underline-offset-4 hover:text-foreground">{t("responsibilities.webhookAutomationPage", { defaultValue: "the automation’s page" })}</Link>.</> : null}
        </p>
      )}
    </div>
  );
}
