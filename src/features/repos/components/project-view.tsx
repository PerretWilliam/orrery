import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { accentStyle } from "@/lib/accent";
import { WidgetGrid } from "@/features/widgets/components/widget-grid";
import type { Project } from "../server/projects";

type Page = NonNullable<Project["config"]>["pages"][number];

/** A project: its title, the problems with its config file, and the selected page. Everything from the repository is shown as text. */
export function ProjectView({ project, page }: { project: Project; page: Page | null }) {
  const t = useTranslations("Shell");
  return (
    <div className="contents" style={accentStyle(project.color)}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        <span className="text-sm text-muted-foreground">
          {project.owner}/{project.name}
        </span>
        {project.archived ? <span className="rounded border px-1.5 text-xs">{t("archived")}</span> : null}
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
      {project.config && page ? <WidgetGrid project={{ id: project.id, owner: project.owner, name: project.name, config: project.config }} widgets={page.widgets} /> : null}
    </div>
  );
}
