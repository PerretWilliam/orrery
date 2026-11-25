import { useTranslations } from "next-intl";
import { ThemeSync } from "@/components/theme-choice";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Viewer } from "@/features/auth/domain/profile";
import { settingsPath } from "@/features/project-settings/domain/hosts";
import { listsOf } from "@/features/widgets/domain/lists";
import { projectPath } from "../domain/project";
import type { ListedProject } from "../server/projects";
import { AppSidebar } from "./app-sidebar";

/** `current` is the path of the sidebar entry being shown. */
type Props = { viewer: Viewer; projects: readonly ListedProject[]; current?: string; children: React.ReactNode };

/** The sidebar around a page. Only what the sidebar shows crosses to the browser, never a project's configuration. */
export function AppShell({ viewer, projects, current, children }: Props) {
  const t = useTranslations("Shell");
  const links = projects.map((project) => ({
    href: projectPath(project),
    title: project.title,
    color: project.color,
    isPrivate: project.isPrivate,
    // A project whose config has never been valid still needs a way to its page, where the problems are shown.
    pages: project.config?.pages.map((page) => ({
      href: projectPath(project, page.id),
      title: page.title,
      lists: listsOf(page.widgets).map(({ id, kind, widget }) => ({ href: projectPath(project, page.id, id), title: ("title" in widget ? widget.title : undefined) ?? t(`lists.${kind}`) })),
    })) ?? [{ href: projectPath(project), title: t("overview"), lists: [] }],
    settingsHref: project.canManage ? settingsPath(project) : null,
  }));
  return (
    <TooltipProvider>
      {/* Always open on a wide screen: every page has its own shell, so a collapsed state would be lost on the next one. */}
      <SidebarProvider open>
        <ThemeSync />
        <AppSidebar projects={links} user={{ login: viewer.login, image: viewer.image }} current={current} />
        <SidebarInset className="min-w-0">
          <header className="flex items-center gap-2 border-b bg-card px-4 py-2 md:hidden">
            <SidebarTrigger />
            <span className="font-semibold tracking-tight">{t("brand")}</span>
          </header>
          <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export function EmptyProjects() {
  const t = useTranslations("Shell");
  return (
    <div className="mx-auto max-w-md pt-16 text-center">
      <h1 className="text-xl font-semibold">{t("emptyTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("emptyBody")}</p>
    </div>
  );
}
