import type { CompanySkill } from '@paperclipai/shared';
import { Link } from '@/lib/router';
import { useTranslation } from '@/i18n';
export function SkillSourceProvenance({ skill }: { skill: CompanySkill }) {
  const { t } = useTranslation();
  const id = skill.metadata?.skillSourceId ?? skill.metadata?.legacySkillSourceId;
  if (typeof id !== 'string') return null;
  const state = skill.metadata?.skillSourceState;
  const label = !skill.metadata?.skillSourceId
    ? t("skillSourceProvenance.refreshToSync", { defaultValue: "Refresh this source to sync all files" })
    : state === 'removed'
      ? t("skillSourceProvenance.removed", { defaultValue: "Removed from source · last installed version retained" })
      : state === 'not_syncing'
        ? t("skillSourceProvenance.notSyncing", { defaultValue: "Not syncing · installed copy retained" })
        : state === 'update_failed'
          ? t("skillSourceProvenance.updateFailed", { defaultValue: "Update failed · last installed version retained" })
          : t("skillSourceProvenance.synced", { defaultValue: "Synced from GitHub" });
  return <div className="flex flex-col gap-1 py-3 text-xs text-muted-foreground">
    <span>{label}</span>
    <span className="break-all font-mono">{String(skill.metadata?.skillSourcePath ?? '')}{skill.sourceRef ? ` · ${skill.sourceRef.slice(0, 8)}` : ''}</span>
    <Link to={`/skills/sources/${id}`} className="text-foreground underline">{t("skillSourceProvenance.manageSource", { defaultValue: "Manage source" })}</Link>
  </div>;
}
