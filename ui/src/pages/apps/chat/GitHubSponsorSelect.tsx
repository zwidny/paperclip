import type { CompanyMember, CurrentBoardAccess } from "@/api/access";
import { Identity } from "@/components/Identity";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useTranslation } from "../../../i18n";

export function GitHubSponsorSelect({
  companyId, members, access, value, onChange, label,
}: {
  companyId: string;
  members: CompanyMember[];
  access: CurrentBoardAccess | undefined;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const membership = access?.memberships?.find(
    (item) => item.companyId === companyId && item.status === "active",
  );
  const canSelectOthers = access?.isInstanceAdmin === true ||
    membership?.membershipRole === "owner" || membership?.membershipRole === "admin";
  const options = members
    .filter((member) => member.status === "active" && member.membershipRole !== "viewer" &&
      access && (canSelectOthers || member.principalId === access.userId))
    .map((member) => ({
      key: member.principalId,
      value: member.principalId,
      label: member.user?.name ?? member.user?.email ?? member.principalId,
      avatarUrl: member.user?.image,
      searchText: member.user?.email ?? undefined,
    }));
  const current = members.find((member) => member.principalId === value);
  return (
    <SearchableSelect
      value={value}
      groups={[{ id: "sponsors", options }]}
      onValueChange={onChange}
      placeholder={t("githubSponsorSelect.selectMember", { defaultValue: "Select a member" })}
      searchPlaceholder={t("githubSponsorSelect.searchMembers", { defaultValue: "Search members…" })}
      triggerAriaLabel={label}
      disabled={!access || options.length === 0}
      renderValue={(option) => option
        ? <Identity name={option.label} avatarUrl={option.avatarUrl} size="sm" />
        : value ? <Identity name={current?.user?.name ?? current?.user?.email ?? value} avatarUrl={current?.user?.image} size="sm" /> : null}
      renderOption={(option) => <Identity name={option.label} avatarUrl={option.avatarUrl} size="sm" />}
    />
  );
}
