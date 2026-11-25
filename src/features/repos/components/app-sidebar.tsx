"use client";

import { ChevronRight, Eye, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMenu } from "@/features/auth/components/user-menu";

type Entry = { href: string; title: string };
/** A page with `lists` unfolds into them instead of being a link. */
export type ProjectLink = { href: string; title: string; color: string | null; isPrivate: boolean; pages: readonly (Entry & { lists: readonly Entry[] })[]; settingsHref: string | null };
type Props = { projects: readonly ProjectLink[]; user: { login: string; image?: string | null }; current?: string };

/** lucide has no brand icons. The GitHub mark of Octicons (MIT). */
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

/** The brand, the projects grouped by Git host (GitHub only for now) with their pages, and the user. */
export function AppSidebar({ projects, user, current }: Props) {
  const t = useTranslations("Shell");
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const entry = (href: string, title: string) => (
    <SidebarMenuSubItem key={href}>
      <SidebarMenuSubButton isActive={href === current} render={<Link href={href} aria-current={href === current ? "page" : undefined} onClick={close} />}>
        <span>{title}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
  const holdsCurrent = (page: ProjectLink["pages"][number]) => page.href === current || page.lists.some((list) => list.href === current);
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" onClick={close} />}>
              <Image src="/icon.svg" alt="" width={32} height={32} />
              <span className="text-base font-semibold tracking-tight">{t("brand")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {projects.length > 0 ? (
          <nav aria-label={t("projects")}>
            <SidebarGroup>
              <SidebarGroupLabel className="gap-2">
                <GithubMark />
                {t("github")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects.map((project) => {
                    const visibility = t(project.isPrivate ? "private" : "public");
                    const Icon = project.isPrivate ? Lock : Eye;
                    const open = project.settingsHref === current || project.pages.some(holdsCurrent);
                    return (
                      <Collapsible key={project.href} defaultOpen={open} render={<SidebarMenuItem />}>
                        <CollapsibleTrigger render={<SidebarMenuButton className="group/project" />}>
                          <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground/40" style={{ backgroundColor: project.color ?? undefined }} />
                          <span className="truncate">{project.title}</span>
                          <Tooltip>
                            <TooltipTrigger render={<span className="ml-auto text-muted-foreground" />}>
                              <Icon role="img" aria-label={visibility} className="size-4" />
                            </TooltipTrigger>
                            <TooltipContent side="right">{visibility}</TooltipContent>
                          </Tooltip>
                          <ChevronRight aria-hidden className="transition-transform group-data-panel-open/project:rotate-90" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {project.pages.map((page) =>
                              page.lists.length === 0 ? (
                                entry(page.href, page.title)
                              ) : (
                                <Collapsible key={page.href} defaultOpen={holdsCurrent(page)} render={<SidebarMenuSubItem />}>
                                  <CollapsibleTrigger render={<SidebarMenuSubButton className="group/page w-full [&>svg]:text-sidebar-foreground" render={<button type="button" />} />}>
                                    <span className="truncate">{page.title}</span>
                                    <ChevronRight aria-hidden className="ml-auto transition-transform group-data-panel-open/page:rotate-90" />
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <SidebarMenuSub>{page.lists.map((list) => entry(list.href, list.title))}</SidebarMenuSub>
                                  </CollapsibleContent>
                                </Collapsible>
                              ),
                            )}
                            {project.settingsHref ? entry(project.settingsHref, t("settings")) : null}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu {...user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
