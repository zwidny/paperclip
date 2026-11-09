import { useState } from "react";
import type { Agent, ToolCatalogEntry, ToolPolicy, ToolProfileConfiguration } from "@paperclipai/shared";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { describeError } from "@/api/errors";
import { useTranslation } from "../../../i18n";

export function AgentConnectionAccess({ connectionId, profiles, policies, catalog, agents, canManage, onRemove }: {
  connectionId: string;
  profiles: ToolProfileConfiguration[];
  policies: ToolPolicy[];
  catalog: ToolCatalogEntry[];
  agents: Agent[];
  canManage: boolean;
  onRemove: (profileId: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const grants = profiles.filter(profile => {
    const agentId = profile.metadata?.agentId;
    return profile.status === "active"
      && profile.metadata?.source === "connection_intent"
      && profile.metadata.connectionId === connectionId
      && typeof agentId === "string"
      && profile.profileKey === `connection-intent:${connectionId}:${agentId}`
      && profile.bindings.some(binding => binding.targetType === "agent" && binding.targetId === agentId);
  });
  if (grants.length === 0) return null;

  async function remove(profileId: string) {
    setPending(profileId);
    setError(null);
    try {
      await onRemove(profileId);
    } catch (cause) {
      setError(describeError(cause).body);
    } finally {
      setPending(null);
    }
  }

  return <section className="space-y-4 border-t border-border pt-8">
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{t("appDetail.agentAccess.title", { defaultValue: "Additional agent access" })}</h2>
      <p className="text-sm text-muted-foreground">{t("appDetail.agentAccess.description", { defaultValue: "These agents can use the listed actions in addition to the permissions above. Removing a grant restores their other permissions." })}</p>
    </div>
    {grants.map(profile => {
      const agentId = profile.metadata!.agentId as string;
      const agent = agents.find(candidate => candidate.id === agentId);
      const tools = catalog.filter(tool => profile.entries.some(entry => entry.effect === "include" && entry.catalogEntryId === tool.id));
      return <div key={profile.id} className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AgentAvatar agent={agent ?? { id: agentId, name: t("appDetail.agentFallback", { defaultValue: "Agent" }) }} size={32} />
            <span className="text-sm font-medium">{agent?.name ?? t("appDetail.agentFallback", { defaultValue: "Agent" })}</span>
          </div>
          {canManage && <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void remove(profile.id)}>
            {pending === profile.id
              ? t("appDetail.agentAccess.removing", { defaultValue: "Removing…" })
              : t("appDetail.agentAccess.removeGrant", { defaultValue: "Remove grant" })}
          </Button>}
        </div>
        <ul className="space-y-2">
          {tools.map(tool => {
            const askFirst = policies.some(policy => policy.enabled && policy.policyType === "require_approval"
              && policy.config?.source === "connection_intent"
              && policy.config.connectionId === connectionId && policy.config.agentId === agentId
              && policy.selectors?.catalogEntryId === tool.id);
            return <li key={tool.id} className="flex items-center justify-between gap-4 text-sm">
              <span className="min-w-0 break-all">{tool.title || tool.toolName}</span>
              <span className="shrink-0 text-muted-foreground">{askFirst
                ? t("appDetail.agentAccess.askFirst", { defaultValue: "Ask first" })
                : t("appDetail.agentAccess.allowed", { defaultValue: "Allowed" })}</span>
            </li>;
          })}
        </ul>
      </div>;
    })}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
