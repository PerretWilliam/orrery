import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentViewer } from "@/features/auth/server/runtime";
import { pickPage } from "../domain/project";
import { getProjects } from "../server/runtime";
import { AppShell } from "./app-shell";
import { ProjectView } from "./project-view";
import { RememberLocation } from "./remember-location";

type Params = Promise<{ owner: string; repo: string; page?: string[] }>;

/** `/p/<owner>/<repo>/<page?>`. A project that does not exist and one the user may not see are the same 404. */
export async function ProjectContent({ params }: { params: Params }) {
  const { owner, repo, page: segments = [] } = await params;
  if (segments.length > 1) notFound();
  const viewer = await currentViewer(await headers());
  if (!viewer) redirect("/sign-in");

  const projects = getProjects();
  const project = await projects.open({ owner, name: repo }, viewer.login);
  if (!project) notFound();
  const page = project.config ? pickPage(project.config.pages, segments[0]) : null;
  if (segments[0] !== undefined && !page) notFound();

  return (
    <AppShell projects={await projects.visibleTo(viewer.login)} current={project}>
      <ProjectView project={project} page={page} />
      <RememberLocation place={{ owner: project.owner, name: project.name, page: page?.id ?? null }} />
    </AppShell>
  );
}
