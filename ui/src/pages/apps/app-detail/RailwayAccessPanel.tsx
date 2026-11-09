import { useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConfigureRailwaySsh, ConnectionGrantsResponse, RailwaySshSetup, ToolConnection } from "@paperclipai/shared";
import { describeError } from "@/api/errors";
import { toolsApi } from "@/api/tools";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "../../../i18n";

export function RailwayAccessPanel({ connection, grants }: { connection: ToolConnection; grants?: ConnectionGrantsResponse }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const id = useId();
  const setup = connection.config?.railwaySsh as RailwaySshSetup | null | undefined;
  const owned = (grants?.grants ?? []).filter((grant) => grant.kind !== "user" || grant.subjectUserId === grants?.currentUserId);
  const eligible = owned.filter((grant) => grant.status === "active");
  const [selectedGrant, setSelectedGrant] = useState("");
  const [knownHosts, setKnownHosts] = useState(setup?.knownHosts ?? "");
  useEffect(() => { setKnownHosts(setup?.knownHosts ?? ""); }, [setup?.knownHosts]);
  const grantId = setup?.grantId ?? (selectedGrant || eligible[0]?.id);
  const canConfigure = grants?.capabilities.canConfigure && connection.status === "active" && eligible.some((grant) => grant.id === grantId);
  const canRemove = grants?.capabilities.canConfigure && owned.some((grant) => grant.id === setup?.grantId);
  const mutation = useMutation({
    mutationFn: (input: ConfigureRailwaySsh) => toolsApi.configureRailwaySsh(connection.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connection.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.connectionGrants(connection.id) });
    },
  });
  return <section className="space-y-4" aria-labelledby={`${id}-title`}>
    <div className="space-y-2">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{t("appRailway.title", { defaultValue: "Railway operations" })}</h2>
      <p className="text-sm text-muted-foreground">
        {typeof connection.config?.railwayApiMessage === "string" ? connection.config?.railwayApiMessage : t("appRailway.refreshHint", { defaultValue: "Refresh actions after connecting to check service, log, and deployment access." })}
      </p>
    </div>
    <div className="space-y-2">
      <h3 className="font-medium">{t("appRailway.containerAccess", { defaultValue: "Container access" })}</h3>
      <p className="text-sm text-muted-foreground">{t("appRailway.containerAccessDescription", { defaultValue: "To allow Paperclip direct SSH access to Railway containers, you can optionally generate an SSH key pair." })} <a className="underline" href="https://docs.railway.com/cli/ssh" target="_blank" rel="noreferrer">{t("appRailway.sshDocs", { defaultValue: "Railway SSH documentation" })}</a></p>
    </div>
    {!canConfigure && <p className="text-sm text-muted-foreground">{t("appRailway.noPermission", { defaultValue: "The connection manager and authorization owner can configure container access." })}</p>}
    {(canConfigure || canRemove) && grantId && <>
      {!setup && eligible.length > 1 && <div className="space-y-2">
        <Label htmlFor={`${id}-grant`}>{t("appRailway.authorization", { defaultValue: "Authorization" })}</Label>
        <select id={`${id}-grant`} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={grantId} onChange={(event) => setSelectedGrant(event.target.value)}>
          {eligible.map((grant) => <option key={grant.id} value={grant.id}>{grant.kind === "organization"
            ? t("appRailway.grantOrganization", { defaultValue: "Shared account" })
            : grant.kind === "user"
              ? t("appRailway.grantUser", { defaultValue: "My account" })
              : t("appRailway.grantAgent", { defaultValue: "Agent account" })}</option>)}
        </select>
      </div>}
      {!setup && <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "prepare", grantId })}>{t("appRailway.generateKeyPair", { defaultValue: "Generate SSH key pair" })}</Button>}
      {setup && <>
        <div className="space-y-2">
          <Label htmlFor={`${id}-public`}>{t("appRailway.publicKey", { defaultValue: "Public key" })}</Label>
          <Textarea id={`${id}-public`} readOnly value={setup.publicKey} className="font-mono text-xs" />
          <p className="text-sm text-muted-foreground">{t("appRailway.publicKeyHint", { defaultValue: "Register this public key in the Railway account used by this authorization. The private key stays in Paperclip’s vault." })} <a className="underline" href="https://docs.railway.com/cli/ssh#manage-ssh-keys" target="_blank" rel="noreferrer">{t("appRailway.keySetup", { defaultValue: "Railway key setup" })}</a></p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-host`}>{t("appRailway.verifiedHostKey", { defaultValue: "Verified Railway host key" })}</Label>
          <Textarea id={`${id}-host`} value={knownHosts} onChange={(event) => setKnownHosts(event.target.value)} placeholder="ssh.railway.com ssh-ed25519 …" className="font-mono text-xs" />
          <p className="text-sm text-muted-foreground">{t("appRailway.hostKeyHint", { defaultValue: "Paste the ssh.railway.com line from a known_hosts entry you have independently verified. Paperclip refuses untrusted or changed host keys." })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canConfigure || mutation.isPending || !knownHosts.trim()} onClick={() => mutation.mutate({ action: "enable", grantId, knownHosts })}>{setup.enabled
            ? t("appRailway.updateHostKey", { defaultValue: "Update trusted host key" })
            : t("appRailway.enableContainerAccess", { defaultValue: "Enable container access" })}</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "remove", grantId })}>{t("appRailway.removeContainerKey", { defaultValue: "Remove container key" })}</Button>
        </div>
        <p className="text-sm text-muted-foreground">{setup.enabled
          ? t("appRailway.enabledNote", { defaultValue: "Container access is enabled for this authorization." })
          : t("appRailway.disabledNote", { defaultValue: "Register the public key and verify the host key before enabling access." })}{" "}
          {t("appRailway.removeNote", { defaultValue: "Removing the key stops new Paperclip connections. Also remove its public key from Railway." })}</p>
      </>}
    </>}
    {mutation.error ? <p role="alert" className="text-sm text-destructive">{describeError(mutation.error).body}</p> : null}
  </section>;
}
