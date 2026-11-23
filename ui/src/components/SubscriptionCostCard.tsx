import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { SUBSCRIPTION_CURRENCIES, centsToUsd, usdToCents, type SubscriptionAccountReport, type SubscriptionCostReport, type SubscriptionUsage } from "@paperclipai/shared";
import { subscriptionsApi } from "../api/subscriptions";
import { cn, formatCents, formatDateTime, formatTokens, providerDisplayName } from "../lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useTranslation } from "../i18n";
import { ANALYTICS_MASK_CLASS } from "@/lib/analytics/privacy";

export function subscriptionMoney(cents: string, currency: string) {
  return currency === "USD" ? formatCents(Number(cents))
    : new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "code" }).format(Number(cents) / 100);
}

export function SubscriptionTokenUsage({ usage }: { usage: SubscriptionUsage }) {
  const { t } = useTranslation();
  return <span className="font-mono text-xs text-muted-foreground">
    {t("subscriptionCost.usage.inOut", { defaultValue: "{{input}} in · {{output}} out", input: formatTokens(usage.inputTokens + usage.cachedInputTokens), output: formatTokens(usage.outputTokens) })}
    {usage.cachedInputTokens > 0 && <span className="block">{t("subscriptionCost.usage.cachedInput", { defaultValue: "{{tokens}} input cached", tokens: formatTokens(usage.cachedInputTokens) })}</span>}
  </span>;
}

function SubscriptionEditor({ account, accounts, companyId, onDone }: {
  account: SubscriptionAccountReport; accounts: SubscriptionAccountReport[]; companyId: string; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState(account.price.plan);
  const [amount, setAmount] = useState(account.price.amountCents == null ? "" : centsToUsd(account.price.amountCents).replace(/\.?0+$/, ""));
  const [currency, setCurrency] = useState(account.price.currency);
  const [cadence, setCadence] = useState(account.price.cadence);
  const [status, setStatus] = useState(account.price.status);
  const [targetId, setTargetId] = useState("");
  const save = useMutation({ mutationFn: () => subscriptionsApi.update(companyId, account.id, {
    expectedRevision: account.price.revision, plan, amountCents: amount.trim() ? usdToCents(amount.trim()) : null,
    currency: currency as typeof SUBSCRIPTION_CURRENCIES[number], cadence, status,
  }), onSuccess: onDone });
  const link = useMutation({ mutationFn: () => subscriptionsApi.link(companyId, account.id, targetId, account.price.revision,
    accounts.find(row => row.id === targetId)!.price.revision), onSuccess: onDone });
  const targets = accounts.filter(row => row.id !== account.id && row.provider === account.provider && row.canEdit);
  const busy = save.isPending || link.isPending;
  const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
  return <div className="space-y-5">
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <div className="space-y-2"><Label htmlFor="subscription-plan">{t("subscriptionCost.editor.plan", { defaultValue: "Plan" })}</Label><Input id="subscription-plan" value={plan} onChange={event => setPlan(event.target.value)} required maxLength={100} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="subscription-price">{t("subscriptionCost.editor.pricePerPeriod", { defaultValue: "Price per billing period" })}</Label><Input id="subscription-price" type="number" min="0" step="any" value={amount} placeholder={t("subscriptionCost.editor.pricePlaceholder", { defaultValue: "Unknown" })} onChange={event => setAmount(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="subscription-currency">{t("subscriptionCost.editor.currency", { defaultValue: "Currency" })}</Label><select id="subscription-currency" className={selectClass} value={currency} onChange={event => setCurrency(event.target.value)}>{SUBSCRIPTION_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="subscription-cadence">{t("subscriptionCost.editor.billed", { defaultValue: "Billed" })}</Label><select id="subscription-cadence" className={selectClass} value={cadence} onChange={event => setCadence(event.target.value as typeof cadence)}><option value="month">{t("subscriptionCost.editor.monthly", { defaultValue: "Monthly" })}</option><option value="year">{t("subscriptionCost.editor.annually", { defaultValue: "Annually" })}</option></select></div>
        <div className="space-y-2"><Label htmlFor="subscription-status">{t("subscriptionCost.editor.tracking", { defaultValue: "Tracking" })}</Label><select id="subscription-status" className={selectClass} value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="active">{t("subscriptionCost.editor.statusActive", { defaultValue: "Active" })}</option><option value="ended">{t("subscriptionCost.editor.statusEnded", { defaultValue: "Subscription ended" })}</option><option value="excluded">{t("subscriptionCost.editor.statusExcluded", { defaultValue: "Exclude from this organization" })}</option></select></div>
      </div>
      <p className="text-xs text-muted-foreground">{t("subscriptionCost.editor.help", { defaultValue: "Enter the full amount for one account or seat. Annual prices are divided by 12. Changes apply from now. Ending tracking here does not cancel your provider subscription." })}</p>
      {save.error && <p role="alert" className="text-sm text-destructive">{t("subscriptionCost.editor.saveFailed", { defaultValue: "Could not save this price. Check the amount, or reopen the account if another person updated it." })}</p>}
      <div className="flex items-center justify-between"><Button type="button" variant="ghost" disabled={busy} onClick={onDone}>{t("common.cancel", { defaultValue: "Cancel" })}</Button><Button type="submit" disabled={busy}>{save.isPending ? t("common.saving", { defaultValue: "Saving…" }) : t("subscriptionCost.editor.save", { defaultValue: "Save price" })}</Button></div>
    </form>
    {targets.length > 0 && <div className="space-y-2 border-t border-border pt-4">
      <Label htmlFor="subscription-link">{t("subscriptionCost.editor.sameSubscription", { defaultValue: "Same subscription as another account?" })}</Label>
      <select id="subscription-link" className={cn(selectClass, ANALYTICS_MASK_CLASS)} value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">{t("subscriptionCost.editor.chooseAccount", { defaultValue: "Choose an account" })}</option>{targets.map(row => <option key={row.id} value={row.id}>{row.name} · {row.price.plan}</option>)}</select>
      <p className="text-xs text-muted-foreground">{t("subscriptionCost.editor.linkHelp", { defaultValue: "Linking counts these accounts once, combines their Paperclip usage, and keeps the selected account’s price. Only link the same subscription or paid seat." })}</p>
      {link.error && <p role="alert" className="text-sm text-destructive">{t("subscriptionCost.editor.linkFailed", { defaultValue: "Could not link these accounts. Reopen their details and try again." })}</p>}
      <Button type="button" variant="outline" disabled={!targetId || busy} onClick={() => link.mutate()}>{t("subscriptionCost.editor.linkAccounts", { defaultValue: "Link accounts" })}</Button>
    </div>}
  </div>;
}

export function SubscriptionCostCard({ companyId, report, error, onChanged }: {
  companyId: string; report?: SubscriptionCostReport; error?: unknown; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionAccountReport | null>(null);
  const closeEditor = () => { setEditing(null); onChanged(); };
  const known = report?.monthlyTotals.length;
  const estimatedCount = report?.monthlyTotals.reduce((sum, total) => sum + total.estimatedCount, 0) ?? 0;
  return <>
    <Card className="block p-4">
      <div className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{t("subscriptionCost.title", { defaultValue: "Subscriptions" })}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
        {known ? report!.monthlyTotals.map(total => <div key={total.currency}>{subscriptionMoney(total.amountCents, total.currency)}<span className="text-sm font-normal">{t("subscriptionCost.perMonthSuffix", { defaultValue: "/month" })}</span></div>) : report && report.activeCount === 0 && report.accounts.length > 0 ? t("subscriptionCost.zeroMonthly", { defaultValue: "$0.00/month" }) : "—"}
      </div>
      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
        {report ? <>
          {estimatedCount > 0 && <div><Badge variant="outline" className="font-normal text-muted-foreground">{estimatedCount < report.activeCount - report.unknownPriceCount ? t("subscriptionCost.partiallyEstimated", { defaultValue: "Partially estimated" }) : t("subscriptionCost.estimated", { defaultValue: "Estimated" })}</Badge></div>}
          {report.unknownPriceCount > 0 && !!known && <div>{t("subscriptionCost.knownSubtotal", { defaultValue: "Known monthly subtotal" })}</div>}
          <div>{report.accounts.length === 0 ? t("subscriptionCost.noVisibleSubscriptions", { defaultValue: "No visible subscriptions" }) : <>{t("subscriptionCost.activeSubscriptions", { count: report.activeCount, defaultValue: "{{count}} active subscriptions" })}{report.unknownPriceCount > 0 && t("subscriptionCost.unknownPrices", { count: report.unknownPriceCount, defaultValue: "{{count}} prices unknown" })}</>}</div>
          {report.accounts.length > 0 && <div>{t("subscriptionCost.monthlyFeesVisible", { defaultValue: "Monthly fees for accounts visible to you" })}</div>}
          {report.unidentifiedAccountCount > 0 && <div>{t("subscriptionCost.unconfirmedIdentities", { count: report.unidentifiedAccountCount, defaultValue: "{{count}} unconfirmed account identities" })}</div>}
          <SubscriptionTokenUsage usage={report.subscription} />
        </> : error ? <div>{t("subscriptionCost.unavailable", { defaultValue: "Subscription data is unavailable." })}</div> : <div>{t("subscriptionCost.loading", { defaultValue: "Loading subscriptions…" })}</div>}
        {report && error ? <div>{t("subscriptionCost.showingCached", { defaultValue: "Showing last loaded subscription data." })}</div> : null}
      </div>
      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setOpen(true)} disabled={!report}>{t("subscriptionCost.viewDetails", { defaultValue: "View details" })}</Button>
    </Card>
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setEditing(null); }}>
      <DialogContent className="max-h-(--sz-80vh) overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{editing ? t("subscriptionCost.dialog.priceTitle", { defaultValue: "Subscription price" }) : t("subscriptionCost.title", { defaultValue: "Subscriptions" })}</DialogTitle><DialogDescription>{t("subscriptionCost.dialog.description", { defaultValue: "Current monthly costs for accounts visible to you. Token totals cover company work in the selected period." })}</DialogDescription></DialogHeader>
        {editing ? <SubscriptionEditor key={editing.id} companyId={companyId} account={editing} accounts={report?.accounts ?? []} onDone={closeEditor} /> : <div className="space-y-4">
          {report?.accounts.length === 0 && <p className="text-sm text-muted-foreground">{t("subscriptionCost.dialog.empty", { defaultValue: "No subscriptions are visible to you yet. Connect an AI account or run an agent with a connected subscription." })}</p>}
          {report?.accounts.map(account => <div key={account.id} className="space-y-2 border-b border-border pb-4 last:border-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className={ANALYTICS_MASK_CLASS}><div className="font-medium">{account.name}</div><div className="text-xs text-muted-foreground">{account.shared ? t("subscriptionCost.dialog.shared", { defaultValue: "Shared" }) : account.ownerName ?? (account.ownerUserId ? t("subscriptionCost.dialog.accountOwner", { defaultValue: "Account owner" }) : t("subscriptionCost.dialog.personalAccounts", { defaultValue: "Personal accounts" }))} · {providerDisplayName(account.provider)} · {account.price.plan}</div></div>
              <div className="text-right"><div className="font-mono">{account.price.status !== "active" ? account.price.status === "ended" ? t("subscriptionCost.dialog.ended", { defaultValue: "Ended" }) : t("subscriptionCost.dialog.excluded", { defaultValue: "Excluded" }) : account.price.monthlyCents == null ? t("subscriptionCost.dialog.priceUnknown", { defaultValue: "Price unknown" }) : t("subscriptionCost.perMonth", { defaultValue: "{{amount}}/month", amount: subscriptionMoney(account.price.monthlyCents, account.price.currency) })}</div><div className="text-xs text-muted-foreground">{account.price.source === "catalog" ? t("subscriptionCost.dialog.catalogSource", { defaultValue: "Estimated · before tax" }) : account.price.source === "user" ? t("subscriptionCost.dialog.userSource", { defaultValue: "User supplied" }) : ""}{account.price.cadence === "year" ? t("subscriptionCost.dialog.annualDivided", { defaultValue: " · annual payment ÷ 12" }) : ""}</div></div>
            </div>
            <SubscriptionTokenUsage usage={account.usage} />
            {Number(account.usage.costCents) > 0 && <div className="text-xs text-muted-foreground">{t("subscriptionCost.dialog.recordedCharges", { defaultValue: "{{amount}} recorded usage charges in selected period, separate from the subscription fee.", amount: formatCents(Number(account.usage.costCents)) })}</div>}
            {account.agents.length > 0 && <div className="text-xs text-muted-foreground">{t("subscriptionCost.dialog.usedBy", { defaultValue: "Used by {{names}}", names: account.agents.map(agent => agent.name).join(", ") })}</div>}
            {!account.identityVerified && <p className="text-xs text-muted-foreground">{t("subscriptionCost.dialog.identityUnconfirmed", { defaultValue: "Account identity is unconfirmed. Link duplicates if these connections use the same subscription." })}</p>}
            {account.observedAt && <div className="text-xs text-muted-foreground">{t("subscriptionCost.dialog.planChecked", { defaultValue: "Plan checked {{date}}", date: formatDateTime(account.observedAt) })}{account.refreshStatus === "unavailable" ? t("subscriptionCost.dialog.latestCheckUnavailable", { defaultValue: " · latest check unavailable" }) : ""}</div>}
            {account.refreshStatus === "unavailable" && !account.observedAt && <p className="text-xs text-muted-foreground">{t("subscriptionCost.dialog.planUnavailable", { defaultValue: "The provider did not make plan details available. You can enter the price yourself." })}</p>}
            {account.canEdit && <div><Button variant="outline" size="sm" onClick={() => setEditing(account)}>{t("subscriptionCost.dialog.editPrice", { defaultValue: "Edit price" })}</Button></div>}
          </div>)}
          {!!report?.unattributedSubscription.eventCount && <p className="text-xs text-muted-foreground">{t("subscriptionCost.dialog.unattributed", { defaultValue: "Some subscription usage has no recorded account. It is included in the subscription token total." })}</p>}
          <p className="text-xs text-muted-foreground">{t("subscriptionCost.dialog.footnote", { defaultValue: "Monthly fees cover the whole account, including use outside Paperclip. They are separate from recorded charges and agent budgets. Currencies are totaled separately." })}</p>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
