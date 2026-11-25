import { useTranslations } from "next-intl";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { projectPath } from "../domain/project";
import type { Project } from "../server/projects";

/** Header with the project switcher, and the sign-out button, around a page. */
export function AppShell({ projects, current, children }: { projects: readonly Project[]; current?: { owner: string; name: string }; children: React.ReactNode }) {
  const t = useTranslations("Shell");
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card px-6 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {t("brand")}
        </Link>
        <nav aria-label={t("projects")} className="flex flex-1 flex-wrap gap-1">
          {projects.map((project) => {
            const active = project.owner === current?.owner && project.name === current?.name;
            return (
              <Link
                key={`${project.owner}/${project.name}`}
                href={projectPath(project)}
                aria-current={active ? "page" : undefined}
                className={cn(buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }))}
              >
                {project.color ? <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: project.color }} /> : null}
                {project.title}
              </Link>
            );
          })}
        </nav>
        <Link href="/account/tokens" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("tokens")}
        </Link>
        <ThemeToggle />
        <form method="post" action="/auth/sign-out">
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("signOut")}
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col gap-6 p-6">{children}</main>
    </div>
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
