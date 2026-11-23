import { useState } from "react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ANALYTICS_MASK_CLASS } from "@/lib/analytics/privacy";

/** Shared by the saved connection and its interactive review stories. */
export function RemoteMcpManagement({ providerName, connected = true, canReconnect = true, canDisconnect = true, busy = false, onReconnect, onManage, onDisconnect }: {
  providerName: string;
  connected?: boolean;
  canReconnect?: boolean;
  canDisconnect?: boolean;
  busy?: boolean;
  onReconnect: () => void;
  onManage: () => void;
  onDisconnect: () => void | Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  return <section className="space-y-4">
    <h2 className="text-sm font-semibold">{t("connections.remoteMcp.connectionSettings", { defaultValue: "Connection settings" })}</h2>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={!canReconnect || busy} onClick={onReconnect}>{t("connections.remoteMcp.reconnect", { defaultValue: "Reconnect" })}</Button>
      <Button variant="outline" onClick={onManage}>{t("connections.remoteMcp.manageIn", { defaultValue: "Manage in {{provider}}", provider: providerName })}</Button>
      {connected && canDisconnect && <AlertDialog open={confirming} onOpenChange={(open) => { if (!busy) setConfirming(open); }}>
        <AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive">{t("connections.remoteMcp.disconnect", { defaultValue: "Disconnect" })}</Button></AlertDialogTrigger>
        <AlertDialogContent className={ANALYTICS_MASK_CLASS}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("connections.remoteMcp.disconnectTitle", { defaultValue: "Disconnect {{provider}}?", provider: providerName })}</AlertDialogTitle>
            <AlertDialogDescription>{t("connections.remoteMcp.disconnectDescription", { defaultValue: "Delete this connection’s saved credentials and stop further calls through Paperclip. Other connections are unaffected. Actions already sent to the provider may still complete. Connecting again requires a new sign-in or key." })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={async (event) => {
              event.preventDefault();
              try { await onDisconnect(); setConfirming(false); } catch { /* The controller displays the failure. */ }
            }}>{busy ? t("connections.remoteMcp.disconnecting", { defaultValue: "Disconnecting…" }) : t("connections.remoteMcp.disconnectAction", { defaultValue: "Disconnect connection" })}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  </section>;
}
