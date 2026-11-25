import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentViewer } from "@/features/auth/server/runtime";
import { getProjects } from "../server/runtime";
import { EmptyProjects } from "./app-shell";

/** `/welcome`: where a signed-in user with no project lands. Apart from `/`, so that only this screen downloads the sidebar. */
export async function WelcomeContent() {
  const viewer = await currentViewer(await headers());
  if (!viewer) redirect("/sign-in");
  // With a project there is somewhere to go, and `/` knows where.
  if ((await getProjects().visibleTo(viewer.login)).length > 0) redirect("/");
  return <EmptyProjects />;
}
