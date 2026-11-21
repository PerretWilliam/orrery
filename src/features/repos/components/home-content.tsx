import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { currentViewer } from "@/features/auth/server/runtime";
import { getSetupService } from "@/features/setup/server/runtime";
import { LAST_PAGE_COOKIE, pickPage, placeFromCookie, projectPath, sameRepo } from "../domain/project";
import { getProjects } from "../server/runtime";
import { AppShell, EmptyProjects } from "./app-shell";

/** The product name, all there is before an instance has a database. */
export function Brand() {
  const t = useTranslations("Home");
  return (
    <main className="flex flex-1 items-center justify-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
    </main>
  );
}

/** `/`: send the signed-in user to where they left, else to their first project. */
export async function HomeContent() {
  // Reading the request first makes this request-time: the environment must not be frozen into the prerender.
  const requestHeaders = await headers();
  if (!process.env.DATABASE_URL) return <Brand />;
  if (!(await getSetupService().isCompleted())) redirect("/setup");
  const viewer = await currentViewer(requestHeaders);
  if (!viewer) redirect("/sign-in");

  const projects = await getProjects().visibleTo(viewer.login);
  const place = placeFromCookie((await cookies()).get(LAST_PAGE_COOKIE)?.value);
  const last = place && projects.find((project) => sameRepo(project, place));
  if (last && place) {
    const page = last.config && place.page ? pickPage(last.config.pages, place.page) : null;
    redirect(projectPath(last, page?.id));
  }
  if (projects[0]) redirect(projectPath(projects[0]));
  return (
    <AppShell projects={projects}>
      <EmptyProjects />
    </AppShell>
  );
}
