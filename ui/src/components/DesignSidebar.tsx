import type { Issue } from "@paperclipai/shared";
import { Boxes, CircleCheck, CirclePlus, FolderOpen, History, LayoutDashboard, MessageCircle, Package, Repeat, Search, Unplug, Users } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { SidebarAccountMenu } from "./SidebarAccountMenu";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarSection } from "./SidebarSection";
import { RecentTaskNavItem, recentTaskPathRef } from "./RecentTaskNavItem";
import { TruncatedTextMarqueeProvider } from "./TruncatedText";
import { Button } from "./ui/button";
import { FlyoutAppearanceProvider } from "./ui/flyout";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useScrollbarWhileScrolling } from "./side-panel/use-scrollbar-while-scrolling";
import { useTranslation } from "../i18n";

export type DesignSidebarRecentTask = Pick<Issue, "id" | "companyId" | "identifier" | "title">;

/** Shared staged sidebar. The caller supplies company-scoped recent tasks and actions. */
export function DesignSidebar({ onNewTask, recentTasks = [] }: { onNewTask: () => void; recentTasks?: readonly DesignSidebarRecentTask[] }) {
  const { t } = useTranslation();
  const { selectedCompany } = useCompany();
  const root = `/${selectedCompany?.issuePrefix ?? "PAP"}`;
  const companyRecentTasks = recentTasks.filter(task => task.companyId === selectedCompany?.id);
  const handleRecentScroll = useScrollbarWhileScrolling();
  return (
    <FlyoutAppearanceProvider><TruncatedTextMarqueeProvider>
      <div className="design-sidebar">
        <div className="design-sidebar-brand">
          <SidebarCompanyMenu showChevron={false} />
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" className="design-sidebar-search" aria-label={t("nav.globalSearch", { defaultValue: "Global search" })} onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }))}><Search aria-hidden /></Button></TooltipTrigger><TooltipContent side="right">{t("coordinatorSidebar.searchTooltip", { defaultValue: "Search tasks, agents, projects" })}</TooltipContent></Tooltip>
        </div>
        <nav className="design-sidebar-navigation" aria-label={t("nav.mainNavigation", { defaultValue: "Main navigation" })}>
          <div className="design-sidebar-primary">
            <Button variant="ghost" className="design-sidebar-new-task" onClick={onNewTask}><CirclePlus aria-hidden />{t("nav.newTask", { defaultValue: "New Task" })}</Button>
            <SidebarNavItem className="design-sidebar-item" to={`${root}/dashboard`} label={t("nav.dashboard", { defaultValue: "Dashboard" })} icon={LayoutDashboard} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/chats`} label={t("nav.chat", { defaultValue: "Chat" })} icon={MessageCircle} />
          </div>
          <SidebarSection label={t("nav.sections.work", { defaultValue: "Work" })}>
            <SidebarNavItem className="design-sidebar-item" to={`${root}/issues`} label={t("nav.tasks", { defaultValue: "Tasks" })} icon={CircleCheck} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/projects`} label={t("nav.projects", { defaultValue: "Projects" })} icon={FolderOpen} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/routines`} label={t("nav.routines", { defaultValue: "Routines" })} icon={Repeat} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/artifacts`} label={t("nav.artifacts", { defaultValue: "Artifacts" })} icon={Package} />
          </SidebarSection>
          <SidebarSection label={t("nav.sections.org", { defaultValue: "Org" })}>
            <SidebarNavItem className="design-sidebar-item" to={`${root}/agents`} label={t("nav.agents", { defaultValue: "Agents" })} icon={Users} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/skills`} label={t("nav.skills", { defaultValue: "Skills" })} icon={Boxes} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/apps`} label={t("nav.connectors", { defaultValue: "Connectors" })} icon={Unplug} />
            <SidebarNavItem className="design-sidebar-item" to={`${root}/activity`} label={t("nav.audit", { defaultValue: "Audit" })} icon={History} />
          </SidebarSection>
          {companyRecentTasks.length > 0 ? <div className="design-sidebar-recents">
            <SidebarSection label={t("nav.sections.recentTasks", { defaultValue: "Recent Tasks" })}>
              <div onScroll={handleRecentScroll} className="design-sidebar-recent-list scrollbar-while-scrolling" role="region" aria-label={t("nav.sections.recentTasks", { defaultValue: "Recent Tasks" })} tabIndex={0}>
              {companyRecentTasks.map(issue => <RecentTaskNavItem key={issue.id} task={issue} className="design-sidebar-item" to={`${root}/issues/${recentTaskPathRef(issue)}`} label={issue.title} />)}
              </div>
            </SidebarSection>
          </div> : null}
        </nav>
        <div className="design-sidebar-account"><SidebarAccountMenu /></div>
      </div>
    </TruncatedTextMarqueeProvider></FlyoutAppearanceProvider>
  );
}
