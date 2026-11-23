import { Bot, Compass } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { usePrimaryAgentPresentation } from "@/components/primary-agent/PrimaryAgentPresentation";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { agentRouteRef } from "@/lib/utils";
import { useTranslation } from "@/i18n";

/** Nothing owned and nothing proposed yet: add a responsibility, or ask the primary agent to draft them. */
export function ResponsibilitiesEmpty({ companyId, onAdd }: { companyId: string; onAdd: () => void }) {
  const { t } = useTranslation();
  const primary = usePrimaryAgentPresentation(companyId);
  const agent = primary?.primaryAgent ?? null;
  return (
    <div className="flex flex-col items-center gap-2">
      <EmptyState
        icon={Compass}
        title={t("responsibilities.emptyTitle", { defaultValue: "What do you own?" })}
        message={t("responsibilities.emptyMessage", { defaultValue: "A responsibility is something you own, with a bar for success and a number that shows whether you are meeting it. Group them under the areas you care about, such as Fundraising or Hiring." })}
        action={t("responsibilities.emptyAdd", { defaultValue: "Add a responsibility" })}
        onAction={onAdd}
      />
      {agent ? (
        <Button asChild variant="ghost">
          <Link to={`/chats/${encodeURIComponent(agentRouteRef(agent))}`}>
            <Bot aria-hidden="true" />
            {t("responsibilities.askAgentToDraft", { name: agent.name, defaultValue: "Ask {{name}} to draft them" })}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
