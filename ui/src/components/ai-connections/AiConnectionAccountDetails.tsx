import { useQuery } from "@tanstack/react-query";
import type { AiManagedConnectionSummary, ConnectionGrant } from "@paperclipai/shared";
import { aiConnectionsApi } from "@/api/ai-connections";
import { describeError } from "@/api/errors";
import { useTranslation } from "@/i18n";
import { retryTransientOnly } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { AI_PROVIDERS, aiMethodLabel } from "./model";

/** Provider profile loading is independent of account access and maintenance controls. */
export function AiConnectionAccountDetails({ account, grant }: {
  account: AiManagedConnectionSummary;
  grant: ConnectionGrant;
}) {
  const { t } = useTranslation();
  const canLookUp = account.provider === "anthropic" && account.method === "subscription" && account.status === "connected";
  const identity = useQuery({
    queryKey: ["ai-account-identity", account.companyId, account.id, grant.id, grant.updatedAt],
    queryFn: ({ signal }) => aiConnectionsApi.accountIdentity(account.companyId, account.id, grant.id, { signal }),
    enabled: canLookUp,
    staleTime: 5 * 60_000,
    retry: retryTransientOnly(0),
  });
  const accountLabel = identity.data?.accountLabel ?? account.accountLabel;
  const message = identity.error ? describeError(identity.error).body : identity.data?.message;
  const retryable = identity.isError || identity.data?.status === "error";
  return (
    <section className="space-y-3" aria-label={t("aiConnectionAccountDetails.connectedAccount", { defaultValue: "Connected account" })}>
      <h3 className="text-sm font-semibold">{t("aiConnectionAccountDetails.connectedAccount", { defaultValue: "Connected account" })}</h3>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt className="text-muted-foreground">{t("aiConnectionAccountDetails.providerAccount", { defaultValue: "{{provider}} account", provider: AI_PROVIDERS[account.provider].name })}</dt>
        <dd className="break-words">{accountLabel ?? t("aiConnectionAccountDetails.notAvailable", { defaultValue: "Not available" })}</dd>
        {identity.data?.organizationLabel && <>
          <dt className="text-muted-foreground">{t("aiConnectionAccountDetails.organization", { defaultValue: "Organization" })}</dt>
          <dd className="break-words">{identity.data.organizationLabel}</dd>
        </>}
        <dt className="text-muted-foreground">{t("aiConnectionAccountDetails.signInMethod", { defaultValue: "Sign-in method" })}</dt>
        <dd>{aiMethodLabel(account.provider, account.method)}</dd>
        <dt className="text-muted-foreground">{t("aiConnectionAccountDetails.access", { defaultValue: "Access" })}</dt>
        <dd>{account.ownership === "shared" ? t("aiConnectionAccountDetails.companyShared", { defaultValue: "Company shared" }) : t("aiConnectionAccountDetails.personal", { defaultValue: "Personal · {{owner}}", owner: account.ownerName ?? t("aiConnectionAccountDetails.accountOwner", { defaultValue: "Account owner" }) })}</dd>
      </dl>
      {canLookUp && identity.isPending && <p role="status" className="text-xs text-muted-foreground">{t("aiConnectionAccountDetails.checking", { defaultValue: "Checking account details…" })}</p>}
      {message && <p role={retryable ? "alert" : undefined} className="text-xs text-muted-foreground">{message}</p>}
      {retryable && <Button variant="outline" size="sm" disabled={identity.isFetching} onClick={() => void identity.refetch()}>{t("aiConnectionAccountDetails.retry", { defaultValue: "Retry account check" })}</Button>}
    </section>
  );
}
