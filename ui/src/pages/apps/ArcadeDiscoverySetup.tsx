import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { describeError } from "@/api/errors";
import { toolsApi } from "@/api/tools";
import { useAccountIdentity } from "@/api/companies-query";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ToolConnection } from "@paperclipai/shared";
import { useTranslation } from "../../i18n";

export function ArcadeDiscoverySetup({ connection, onClose }: { connection: ToolConnection; onClose: () => void }) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const queries = useQueryClient();
  const { userId: viewingUserId, settled } = useAccountIdentity();
  const save = useMutation({ mutationFn: async () => {
      const result = await toolsApi.configureArcadeDiscovery(connection.id, { apiKey: apiKey.trim(), userId: userId.trim() });
      queries.setQueryData(queryKeys.tools.aggregatorApps(connection.id, viewingUserId), result);
    },
    onSuccess: onClose,
  });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>{t("arcadeDiscovery.title", { defaultValue: "Sync Arcade accounts" })}</DialogTitle>
      <DialogDescription>{t("arcadeDiscovery.descriptionPrefix", { defaultValue: "See apps available through “" })}{connection.name}{t("arcadeDiscovery.descriptionSuffix", { defaultValue: "”. Your gateway works without account sync." })}</DialogDescription>
    </DialogHeader>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <div className="space-y-2"><Label htmlFor="arcade-discovery-key">{t("arcadeDiscovery.apiKeyLabel", { defaultValue: "Project API key" })}</Label>
        <p className="text-xs text-muted-foreground">{t("arcadeDiscovery.apiKeyHelpPrefix", { defaultValue: "Create a key in " })}<a className="underline" href="https://app.arcade.dev" target="_blank" rel="noopener noreferrer">Arcade</a>{t("arcadeDiscovery.apiKeyHelpSuffix", { defaultValue: " for the same project as this gateway. The key is stored securely and used only for account sync." })}</p>
        <Input id="arcade-discovery-key" type="password" autoComplete="off" required value={apiKey} onChange={event => setApiKey(event.target.value)} />
      </div>
      <div className="space-y-2"><Label htmlFor="arcade-discovery-user">{t("arcadeDiscovery.userIdLabel", { defaultValue: "Arcade user ID" })}</Label>
        <p className="text-xs text-muted-foreground">{t("arcadeDiscovery.userIdHelp", { defaultValue: "Use the end-user ID configured for this gateway’s sign-in. This may differ from your email address." })}</p>
        <Input id="arcade-discovery-user" autoComplete="off" required value={userId} onChange={event => setUserId(event.target.value)} />
      </div>
      {save.error ? <p role="alert" className="text-sm text-destructive">{describeError(save.error).body}</p> : null}
      <DialogFooter className="sm:justify-between"><Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
        <Button type="submit" disabled={!settled || save.isPending || !apiKey.trim() || !userId.trim()}>{save.isPending ? t("common.saving", { defaultValue: "Saving…" }) : t("arcadeDiscovery.saveAndSync", { defaultValue: "Save and sync" })}</Button>
      </DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
