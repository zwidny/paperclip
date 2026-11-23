import { useId } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

export const PRIVACY_POLICY_URL = "https://paperclip.ing/privacy/";

export function AnalyticsConsentBanner({
  recordings,
  onAccept,
  onDecline,
}: {
  recordings: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const textId = useId();
  return (
    <section
      aria-label={t("analyticsConsent.choiceAria", { defaultValue: "Analytics choice" })}
      aria-describedby={textId}
      className="fixed inset-x-4 bottom-(--sz-calc-14) z-40 mx-auto max-w-xl rounded-md border bg-popover text-popover-foreground shadow-lg md:bottom-4"
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <p id={textId} className="flex-1 text-sm text-muted-foreground">
          {recordings
            ? t("analyticsConsent.withRecordings", { defaultValue: "Paperclip uses analytics and session recordings to improve the product. Recordings hide what you type and your messages, documents and connected accounts, but may show page names like task titles. " })
            : t("analyticsConsent.withoutRecordings", { defaultValue: "Paperclip uses analytics to improve the product. " })}
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-4 hover:opacity-90"
          >
            {t("analyticsConsent.privacyPolicy", { defaultValue: "Privacy policy" })}
          </a>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDecline}>
            {t("analyticsConsent.decline", { defaultValue: "Decline" })}
          </Button>
          <Button type="button" size="sm" onClick={onAccept}>
            {t("analyticsConsent.accept", { defaultValue: "Accept" })}
          </Button>
        </div>
      </div>
    </section>
  );
}
