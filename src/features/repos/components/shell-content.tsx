import { headers } from "next/headers";
import { currentViewer } from "@/features/auth/server/runtime";
import { getProjects } from "../server/runtime";
import { AppShell } from "./app-shell";

/**
 * The sidebar of the signed-in pages, kept from one page to the next. It is not a guard: a layout is not rendered again
 * on navigation, so each page checks the session and the access itself.
 */
export async function ShellContent({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer(await headers());
  // Nobody to show a sidebar to: the page sends them to sign-in.
  if (!viewer) return children;
  return (
    <AppShell viewer={viewer} projects={await getProjects().visibleTo(viewer.login)}>
      {children}
    </AppShell>
  );
}
