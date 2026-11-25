import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentViewer } from "@/features/auth/server/runtime";
import { getProjects } from "@/features/repos/server/runtime";
import { SETTINGS_ERRORS, type SettingsErrorCode } from "../domain/hosts";
import { getProjectSettings } from "../server/runtime";
import { SettingsView } from "./settings-view";

type Params = Promise<{ owner: string; repo: string }>;
type Query = Promise<{ saved?: string; error?: string }>;

/** `/settings/<owner>/<repo>`: for maintainers and admins. Anyone else, and a project that does not exist, get the same 404. */
export async function SettingsContent({ params, searchParams }: { params: Params; searchParams: Query }) {
  const { owner, repo } = await params;
  const { saved, error } = await searchParams;
  const viewer = await currentViewer(await headers());
  if (!viewer) redirect("/sign-in");

  const projects = getProjects();
  const project = await projects.open({ owner, name: repo }, viewer.login);
  const overview = project && (await getProjectSettings().overview(project, viewer));
  if (!project || !overview) notFound();

  return <SettingsView project={project} overview={overview} saved={saved === "1"} error={error !== undefined && Object.hasOwn(SETTINGS_ERRORS, error) ? (error as SettingsErrorCode) : null} />;
}
