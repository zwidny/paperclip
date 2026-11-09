import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { describeError } from "../api/errors";
import { QueryErrorState, useQueryView } from "../components/QueryView";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "../i18n";

export function BoardClaimPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const token = (params.token ?? "").trim();
  const code = (searchParams.get("code") ?? "").trim();
  const currentPath = useMemo(
    () => `/board-claim/${encodeURIComponent(token)}${code ? `?code=${encodeURIComponent(code)}` : ""}`,
    [token, code],
  );

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const statusQuery = useQuery({
    queryKey: ["board-claim", token, code],
    queryFn: () => accessApi.getBoardClaimStatus(token, code),
    enabled: token.length > 0 && code.length > 0,
  });
  const statusView = useQueryView(statusQuery);

  const claimMutation = useMutation({
    mutationFn: () => accessApi.claimBoard(token, code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      await statusQuery.refetch();
    },
  });

  if (!token || !code) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{t("boardClaim.invalidUrl", { defaultValue: "Invalid board claim URL." })}</div>;
  }

  if (statusQuery.isLoading || sessionQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">{t("boardClaim.loading", { defaultValue: "Loading claim challenge..." })}</div>;
  }

  if (statusView.kind === "error") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <QueryErrorState
            size="panel"
            error={statusView.error}
            action="load the board claim challenge"
            onRetry={statusView.retry}
            retrying={statusView.isFetching}
          />
        </Card>
      </div>
    );
  }

  const status = statusQuery.data;
  if (!status) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{t("boardClaim.unavailable", { defaultValue: "Claim challenge unavailable." })}</div>;
  }

  if (status.status === "claimed") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{t("boardClaim.claimedTitle", { defaultValue: "Board ownership claimed" })}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("boardClaim.claimedBody", { defaultValue: "This instance is now linked to your authenticated user." })}
          </p>
          <Button asChild className="mt-4">
            <Link to="/">{t("boardClaim.openBoard", { defaultValue: "Open board" })}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!sessionQuery.data) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{t("boardClaim.signInRequired", { defaultValue: "Sign in required" })}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("boardClaim.signInBody", { defaultValue: "Sign in or create an account, then return to this page to claim Board ownership." })}
          </p>
          <Button asChild className="mt-4">
            <Link to={`/auth?next=${encodeURIComponent(currentPath)}`}>{t("mcp.signIn", { defaultValue: "Sign in / Create account" })}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="block p-6">
        <h1 className="text-xl font-semibold">{t("boardClaim.claimTitle", { defaultValue: "Claim Board ownership" })}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("boardClaim.claimBody", { defaultValue: "This will promote your user to instance admin and migrate organization ownership access from local trusted mode." })}
        </p>

        {claimMutation.isError && ( // query-error-ok: mutation result
          <p className="mt-3 text-sm text-destructive">{describeError(claimMutation.error).body}</p>
        )}

        <Button
          className="mt-5"
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
        >
          {claimMutation.isPending ? t("boardClaim.claiming", { defaultValue: "Claiming…" }) : t("boardClaim.claimOwnership", { defaultValue: "Claim ownership" })}
        </Button>
      </Card>
    </div>
  );
}
