import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentViewer } from "@/features/auth/server/runtime";
import { settingsPath } from "@/features/project-settings/domain/hosts";
import { AppShell } from "@/features/repos/components/app-shell";
import { getProjects } from "@/features/repos/server/runtime";
import { SECRET_ERRORS, type SecretIssueCode } from "../domain/errors";
import { getSecrets } from "../server/runtime";
import { SecretsView } from "./secrets-view";

type Params = Promise<{ owner: string; repo: string }>;
type Query = Promise<{ saved?: string; error?: string }>;

/** `/settings/<owner>/<repo>/secrets`: for maintainers and admins. Anyone else, and a project that does not exist, get the same 404. */
export async function SecretsContent({ params, searchParams }: { params: Params; searchParams: Query }) {
  const { owner, repo } = await params;
  const { saved, error } = await searchParams;
  const viewer = await currentViewer(await headers());
  if (!viewer) redirect("/sign-in");

  const projects = getProjects();
  const project = await projects.open({ owner, name: repo }, viewer.login);
  const secrets = project && (await getSecrets().list(project, viewer));
  if (!project || !secrets) notFound();

  return (
    <AppShell viewer={viewer} projects={await projects.visibleTo(viewer.login)} current={settingsPath(project)}>
      <SecretsView project={project} secrets={secrets} saved={saved === "1"} error={error !== undefined && Object.hasOwn(SECRET_ERRORS, error) ? (error as SecretIssueCode) : null} />
    </AppShell>
  );
}
