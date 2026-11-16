import type { TaskBrowser } from "@paperclipai/shared";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

export function TaskBrowserActivity({
  browser,
  label,
  onOpen,
}: {
  browser: TaskBrowser;
  label?: string;
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t("taskChatThread.browser", { defaultValue: "Browser" });
  const closed = browser.status === "closed" || browser.status === "failed";
  return (
    <div className="flex flex-wrap items-center gap-2 py-1 text-sm" aria-label={t("taskBrowserActivity.sessionAria", { defaultValue: "{{label}} session", label: resolvedLabel })}>
      <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>{resolvedLabel}</span>
      <span className="text-muted-foreground">· {browser.status}</span>
      {onOpen && (
        <Button variant="ghost" size="sm" onClick={() => onOpen(browser.id)}>
          {closed ? t("taskBrowserActivity.viewSession", { defaultValue: "View session" }) : t("taskBrowserActivity.openBrowser", { defaultValue: "Open browser" })}
        </Button>
      )}
    </div>
  );
}
