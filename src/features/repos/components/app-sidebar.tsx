"use client";

import { ChevronRight, Eye, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { GithubMark } from "@/components/github-mark";
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
import { currentEntry } from "../domain/nav";

type Entry = { href: string; title: string };
/** A page with `lists` unfolds into them instead of being a link. */
export type ProjectLink = { href: string; title: string; color: string | null; isPrivate: boolean; pages: readonly (Entry & { lists: readonly Entry[] })[]; settingsHref: string | null };

/** Folded until it holds the current page, then left as the user puts it. */
function useUnfolded(holds: boolean) {
  const [open, setOpen] = useState(holds);
  const [held, setHeld] = useState(holds);
  if (holds !== held) {
    setHeld(holds);
    if (holds) setOpen(true);
  }
  return [open, setOpen] as const;
}

type Props = { projects: readonly ProjectLink[]; user: { login: string; image?: string | null } };

type ItemProps = { project: ProjectLink; current: string | undefined; onNavigate: () => void };
type Page = ProjectLink["pages"][number];

function SubEntry({ href, title, current, onNavigate }: Entry & Omit<ItemProps, "project">) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton isActive={href === current} render={<Link href={href} aria-current={href === current ? "page" : undefined} onClick={onNavigate} />}>
        <span>{title}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

const holds = (page: Page, current: string | undefined) => page.href === current || page.lists.some((list) => list.href === current);

/** A page of GitHub lists: it unfolds into one entry per list. */
function ListsEntry({ page, current, onNavigate }: { page: Page } & Omit<ItemProps, "project">) {
  const [open, setOpen] = useUnfolded(holds(page, current));
  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuSubItem />}>
      <CollapsibleTrigger render={<SidebarMenuSubButton className="group/page w-full [&>svg]:text-sidebar-foreground" render={<button type="button" />} />}>
        <span className="truncate">{page.title}</span>
        <ChevronRight aria-hidden className="ml-auto transition-transform group-data-panel-open/page:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {page.lists.map((list) => (
            <SubEntry key={list.href} {...list} current={current} onNavigate={onNavigate} />
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A project and, once unfolded, its pages and its settings. */
function ProjectItem({ project, current, onNavigate }: ItemProps) {
  const t = useTranslations("Shell");
  const visibility = t(project.isPrivate ? "private" : "public");
  const Icon = project.isPrivate ? Lock : Eye;
  const [open, setOpen] = useUnfolded((current !== undefined && project.settingsHref === current) || project.pages.some((page) => holds(page, current)));
  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuItem />}>
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
              <SubEntry key={page.href} href={page.href} title={page.title} current={current} onNavigate={onNavigate} />
            ) : (
              <ListsEntry key={page.href} page={page} current={current} onNavigate={onNavigate} />
            ),
          )}
          {project.settingsHref ? <SubEntry href={project.settingsHref} title={t("settings")} current={current} onNavigate={onNavigate} /> : null}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The brand, the projects grouped by Git host (GitHub only for now) with their pages, and the user. */
export function AppSidebar({ projects, user }: Props) {
  const t = useTranslations("Shell");
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  // `null` outside the app router.
  const current = currentEntry(usePathname() ?? "", projects);
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
                  {projects.map((project) => (
                    <ProjectItem key={project.href} project={project} current={current} onNavigate={close} />
                  ))}
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
