import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { accentStyle } from "@/lib/accent";
import { WidgetBoundary } from "@/features/widgets/components/widget-boundary";
import { PageFreshness } from "@/features/widgets/components/widget-frame";
import { WidgetGrid } from "@/features/widgets/components/widget-grid";
import type { Project } from "../server/projects";

type Page = NonNullable<Project["config"]>["pages"][number];

/** A project: its title, the problems with its config file, and the selected page, or the one `list` of it. Everything from the repository is shown as text. */
export function ProjectView({ project, page, list }: { project: Project; page: Page | null; list?: Page["widgets"][number] }) {
  const t = useTranslations("Shell");
  // One object for the grid and the page's age, so each widget's data is asked for once.
  const target = project.config && { id: project.id, owner: project.owner, name: project.name, config: project.config };
  const widgets = list ? [list] : (page?.widgets ?? []);
  return (
    <div className="contents" style={accentStyle(project.color)}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        <span className="text-sm text-muted-foreground">
          {project.owner}/{project.name}
        </span>
        {project.archived ? <span className="rounded border px-1.5 text-xs">{t("archived")}</span> : null}
        {target && widgets.length > 0 ? (
          <div className="ml-auto">
            <WidgetBoundary fallback={null}>
              <Suspense fallback={null}>
                <PageFreshness project={target} widgets={widgets} />
              </Suspense>
            </WidgetBoundary>
          </div>
        ) : null}
      </div>
      {project.issues.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>{t("issuesTitle")}</AlertTitle>
          <AlertDescription>
            <p>{project.config ? t("issuesShowingLast") : t("issuesNeverValid")}</p>
            <ul className="mt-2 list-disc pl-5">
              {project.issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.path}-${index}`}>
                  <code>{issue.code}</code> — {issue.message} ({t("issuePath")}: <code>{issue.path}</code>
                  {issue.line ? `:${issue.line}` : ""}). {t("issueFix")}: {issue.fix}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {target && page ? <WidgetGrid project={target} widgets={widgets} single={list !== undefined} /> : null}
    </div>
  );
}
