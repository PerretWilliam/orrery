import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAudit } from "@/features/audit/server/runtime";
import { currentViewer } from "@/features/auth/server/runtime";
import { AppShell } from "@/features/repos/components/app-shell";
import { getProjects } from "@/features/repos/server/runtime";
import { ADMIN_ERRORS, type AdminErrorCode } from "../domain/admin";
import { getAdminSettings } from "../server/runtime";
import { AdminView } from "./admin-view";

type Query = Promise<{ saved?: string; error?: string }>;

/** `/admin`: instance admins only. Anyone else gets the same 404 as a page that does not exist. */
export async function AdminContent({ searchParams }: { searchParams: Query }) {
  const { saved, error } = await searchParams;
  const viewer = await currentViewer(await headers());
  if (!viewer) redirect("/sign-in");
  const overview = await getAdminSettings().overview(viewer);
  if (!overview) notFound();
  const [audit, projects] = await Promise.all([getAudit().list(viewer.login, { limit: 50 }), getProjects().visibleTo(viewer.login)]);

  return (
    <AppShell projects={projects}>
      <AdminView overview={overview} audit={audit ?? []} saved={saved === "1"} error={error !== undefined && Object.hasOwn(ADMIN_ERRORS, error) ? (error as AdminErrorCode) : null} />
    </AppShell>
  );
}
