import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router";
import { QueryErrorState, type QueryViewSize, type QueryViewState } from "@/components/QueryView";
import { useTranslation } from "@/i18n";

export function AppReadError({ failure, onRetry, action = "load tools for this app", size = "panel" }: {
  failure: QueryViewState<unknown>;
  onRetry?: () => void;
  action?: string;
  size?: QueryViewSize;
}) {
  return <div className={size === "page" ? undefined : "py-8"}>
    <QueryErrorState size={size} error={failure.error} action={action}
      onRetry={() => { failure.retry(); onRetry?.(); }} retrying={failure.isFetching} />
  </div>;
}

export function AppNotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return <div className="max-w-3xl p-6">
    <p className="text-sm text-muted-foreground">{t("appDetail.appNotFound", { defaultValue: "We couldn't find that app." })}</p>
    <Button className="mt-4" variant="outline" onClick={() => navigate("/apps")}>{t("appDetail.backToConnectors", { defaultValue: "Back to connectors" })}</Button>
  </div>;
}
