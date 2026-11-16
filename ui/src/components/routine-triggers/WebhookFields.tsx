import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { copyTextToClipboard } from "@/lib/clipboard";
import { AgentSetupPrompt } from "@/components/AgentSetupPrompt";
import { useTranslation } from "@/i18n";

export function CopyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
        <code title={value} className="min-w-0 flex-1 truncate text-xs">
          {value}
        </code>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("webhookFields.copyAria", { defaultValue: "Copy {{label}}", label })}
          onClick={async () => {
            try {
              await copyTextToClipboard(value);
              setCopied(true);
              setError(false);
            } catch {
              setError(true);
            }
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? t("webhookFields.copied", { defaultValue: "Copied" }) : t("webhookFields.copy", { defaultValue: "Copy" })}
        </Button>
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-destructive">
            {t("webhookFields.copyFailed", { defaultValue: "Copy failed. Select and copy the text below." })}
          </p>
          <textarea
            readOnly
            aria-label={t("webhookFields.textAria", { defaultValue: "{{label}} text", label })}
            value={value}
            rows={5}
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}

export function AgentInstructions({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("webhookFields.agentInstructionsAria", { defaultValue: "Agent instructions" })}
      className="space-y-3 rounded-md bg-muted/40 p-4"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("webhookFields.agentInstructionsTitle", { defaultValue: "Agent instructions" })}</h2>
        <p className="text-sm text-muted-foreground">
          {t("webhookFields.agentInstructionsBody", { defaultValue: "Give your agent everything it needs to connect this webhook: the URL, authentication key, and step-by-step instructions." })}
        </p>
      </div>
      <AgentSetupPrompt
        prompt={value}
        label={t("webhookFields.copyForAgent", { defaultValue: "Copy for your agent" })}
        title={t("webhookFields.webhookSetupTitle", { defaultValue: "Webhook setup" })}
        description={t("webhookFields.webhookSetupDescription", { defaultValue: "Paste this into your agent to connect this webhook to your routine." })}
      />
    </section>
  );
}
