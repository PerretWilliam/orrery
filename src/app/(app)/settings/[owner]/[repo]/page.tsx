import { Suspense } from "react";
import { SettingsContent } from "@/features/project-settings/components/settings-content";
import { SettingsSkeleton } from "@/features/repos/components/skeletons";

export default function SettingsPage(props: { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent {...props} />
    </Suspense>
  );
}
