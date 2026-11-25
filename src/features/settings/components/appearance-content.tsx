import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentViewer } from "@/features/auth/server/runtime";
import { AppearanceView } from "./appearance-view";
import { settingsPage } from "./settings-page";

/** `/settings`: the first section of the general settings. */
export async function AppearanceContent() {
  const viewer = await currentViewer(await headers());
  if (!viewer) redirect("/sign-in");
  return settingsPage(viewer, "appearance", <AppearanceView />);
}
