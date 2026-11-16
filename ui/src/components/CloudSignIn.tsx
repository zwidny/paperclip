import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import type { CloudInstanceHealthStatus } from "@/api/health";
import { cloudStackEntryUrl } from "@/lib/cloudLinks";
import { beginCloudSignIn, clearCloudSignInAttempt } from "@/lib/cloud-sign-in";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";
import { Button } from "@/components/ui/button";

export function CloudSignIn({ cloud, returnTo }: { cloud: CloudInstanceHealthStatus; returnTo: string }) {
  const { t } = useTranslation();
  const entryUrl = cloudStackEntryUrl(cloud.cloudBaseUrl, cloud.stackSlug, returnTo);
  const started = useRef(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!entryUrl || started.current) return;
    started.current = true;
    setBlocked(!beginCloudSignIn(entryUrl));
  }, [entryUrl]);

  if (entryUrl && !blocked) return <PaperclipLoading />;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("cloudSignIn.title", { defaultValue: "Sign in to Paperclip Cloud" })}</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        {entryUrl
          ? t("cloudSignIn.restoreFailed", { defaultValue: "We couldn't restore your session. Continue to Paperclip Cloud to try again." })
          : t("cloudSignIn.unavailable", { defaultValue: "Cloud sign-in is unavailable for this workspace. Please contact your administrator." })}
      </p>
      {entryUrl && (
        <Button asChild>
          <a href={entryUrl} onClick={clearCloudSignInAttempt}>{t("cloudSignIn.continue", { defaultValue: "Continue to Paperclip Cloud" })}</a>
        </Button>
      )}
    </div>
  );
}
