import { Suspense } from "react";
import { SettingsContent } from "@/features/project-settings/components/settings-content";

export default function SettingsPage(props: { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  return (
    <Suspense fallback={null}>
      <SettingsContent {...props} />
    </Suspense>
  );
}
